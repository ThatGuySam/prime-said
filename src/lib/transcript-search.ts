export interface SearchSource {
  sourceId: string;
  platformId: string;
  title: string;
  channelName: string;
  durationMs: number;
}

export type ScreeningLabel =
  | "creator-original"
  | "quoted-source"
  | "response"
  | "mixed"
  | "unknown";

export interface AttributionScreening {
  label: ScreeningLabel;
  wordsFrom: string;
  reviewStatus: string;
  confidence: number;
  notes: string;
}

export interface SearchWindow {
  windowId: string;
  sourceId: string;
  startMs: number;
  endMs: number;
  text: string;
  before: string;
  after: string;
  screening?: AttributionScreening | null;
}

export interface SearchCorpus {
  schemaVersion: 1;
  status: "youtube-auto-captions-unreviewed";
  generatedAt: string;
  sources: SearchSource[];
  windows: SearchWindow[];
  screeningSpans?: Array<{
    sourceId: string;
    startMs: number;
    endMs: number;
    label: ScreeningLabel;
  }>;
}

export interface RankedSearchWindow extends SearchWindow {
  score: number;
  source: SearchSource;
  matchReason?: "caption-terms" | "response-to-source";
}

export interface TranscriptSearchIndex {
  search: (query: string, sourceId?: string, limit?: number) => RankedSearchWindow[];
}

export interface TranscriptSearchOptions {
  originAware?: boolean;
}

interface IndexedWindow {
  window: SearchWindow;
  source: SearchSource;
  bodyTokens: string[];
  titleTokens: string[];
}

interface QueryFeatures {
  terms: string[];
  normalized: string;
  creatorIntent: boolean;
  requireTermGroups: boolean;
}

const STOPWORDS = new Set([
  "a", "about", "after", "an", "and", "are", "as", "at", "be", "before", "does",
  "he", "i", "in", "is", "it", "me", "of", "on", "or", "prime", "should", "the",
  "think", "to", "what", "you",
]);

const TERM_ALIASES = new Map<string, string>([
  ["builds", "build"],
  ["building", "build"],
  ["developed", "develop"],
  ["developer", "develop"],
  ["developers", "develop"],
  ["developing", "develop"],
  ["development", "develop"],
  ["drives", "drive"],
  ["driving", "drive"],
  ["driven", "drive"],
  ["drove", "drive"],
  ["makes", "make"],
  ["postmortems", "postmortem"],
  ["mortems", "postmortem"],
  ["programmers", "programmer"],
  ["requests", "request"],
  ["requires", "require"],
  ["requiring", "require"],
  ["targets", "target"],
  ["tested", "test"],
  ["testing", "test"],
  ["tests", "test"],
  ["transactions", "transaction"],
]);

const indexCache = new WeakMap<SearchCorpus, TranscriptSearchIndex>();

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeQuery(value: string): string[] {
  return [
    ...new Set(
      normalizeSearchText(value)
        .split(" ")
        .filter((token) => token.length > 1),
    ),
  ];
}

export function canonicalTerm(term: string): string {
  return TERM_ALIASES.get(term) ?? term;
}

export function lexicalTokens(value: string, removeStopwords = false): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .filter(Boolean)
    .map((term) => term.replace(/^\.+|\.+$/gu, ""))
    .filter(Boolean)
    .map(canonicalTerm)
    .filter((term) => !removeStopwords || !STOPWORDS.has(term));
}

function termFrequency(tokens: string[], term: string): number {
  return tokens.reduce((count, token) => count + Number(token === term), 0);
}

function minimumCoveringSpan(tokens: string[], queryTerms: string[]): number | null {
  const wanted = new Set(queryTerms);
  const counts = new Map<string, number>();
  let have = 0;
  let left = 0;
  let best = Number.POSITIVE_INFINITY;

  for (let right = 0; right < tokens.length; right += 1) {
    const token = tokens[right]!;
    if (!wanted.has(token)) continue;
    const nextCount = (counts.get(token) ?? 0) + 1;
    counts.set(token, nextCount);
    if (nextCount === 1) have += 1;

    while (have === wanted.size && left <= right) {
      best = Math.min(best, right - left + 1);
      const leftToken = tokens[left]!;
      if (wanted.has(leftToken)) {
        const nextLeftCount = (counts.get(leftToken) ?? 1) - 1;
        counts.set(leftToken, nextLeftCount);
        if (nextLeftCount === 0) have -= 1;
      }
      left += 1;
    }
  }

  return Number.isFinite(best) ? best : null;
}

function queryFeatures(query: string): QueryFeatures {
  const terms = [...new Set(lexicalTokens(query, true))];
  const creatorIntent = /\b(prime|he|does|should|think|supports?|likes?|recommend)/iu.test(query);
  return {
    terms,
    normalized: normalizeSearchText(query.replaceAll('"', "")),
    creatorIntent,
    // Compound queries need evidence from both halves. This prevents a trailing
    // modifier pair such as "fear driven development" from satisfying
    // "tests drive development", while still allowing a missing connective or
    // intent verb in a longer natural-language query.
    requireTermGroups: terms.length >= 3,
  };
}

function displayMatchScore(item: RankedSearchWindow, features: QueryFeatures): number {
  const tokens = lexicalTokens(item.text);
  const matchedTerms = features.terms.filter((term) => tokens.includes(term));
  if (matchedTerms.length === 0) return 0;

  let score = (matchedTerms.length / features.terms.length) * 100;
  const span = minimumCoveringSpan(tokens, matchedTerms);
  if (span !== null) score += 30 / Math.max(span - matchedTerms.length + 1, 1);
  if (features.normalized && normalizeSearchText(item.text).includes(features.normalized)) score += 100;

  for (let index = 0; index < features.terms.length - 1; index += 1) {
    const left = tokens.indexOf(features.terms[index]!);
    const right = tokens.indexOf(features.terms[index + 1]!, Math.max(left + 1, 0));
    if (left >= 0 && right >= 0) score += 12 / Math.max(right - left, 1);
  }

  const firstMatch = tokens.findIndex((token) => matchedTerms.includes(token));
  if (firstMatch >= 0) score -= Math.min(firstMatch, 12) * 0.25;
  return score;
}

function selectNeighborhoodRepresentatives(
  scored: RankedSearchWindow[],
  features: QueryFeatures,
): RankedSearchWindow[] {
  const neighborhoods: Array<{
    anchor: RankedSearchWindow;
    members: RankedSearchWindow[];
  }> = [];

  for (const candidate of scored) {
    const neighborhood = neighborhoods.find(
      ({ anchor }) =>
        anchor.sourceId === candidate.sourceId &&
        Math.abs(anchor.startMs - candidate.startMs) < 15_000,
    );
    if (neighborhood) neighborhood.members.push(candidate);
    else neighborhoods.push({ anchor: candidate, members: [candidate] });
  }

  return neighborhoods.map(({ anchor, members }) => {
    const representative = [...members].sort(
      (left, right) =>
        Number(right.matchReason === "response-to-source") -
          Number(left.matchReason === "response-to-source") ||
        displayMatchScore(right, features) - displayMatchScore(left, features) ||
        left.startMs - right.startMs,
    )[0]!;
    return {
      ...representative,
      score: anchor.score,
      matchReason: representative.matchReason ?? anchor.matchReason,
    };
  });
}

export function rankTranscriptWindow(
  window: SearchWindow,
  query: string,
  source: SearchSource,
): number {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = tokenizeQuery(query);
  if (!normalizedQuery || tokens.length === 0) return 0;

  const text = normalizeSearchText(window.text);
  const searchable = `${text} ${normalizeSearchText(source.title)}`;
  let score = 0;
  let matched = 0;

  const exactIndex = text.indexOf(normalizedQuery);
  if (exactIndex >= 0) {
    score += 80 + 30 * (1 - exactIndex / Math.max(text.length, 1));
  }

  for (const token of tokens) {
    const textMatches = text.split(token).length - 1;
    if (textMatches > 0) {
      matched += 1;
      score += 16 + Math.min(textMatches - 1, 3) * 2;
    } else if (searchable.includes(token)) {
      matched += 1;
      score += 4;
    }
  }

  if (matched === 0) return 0;
  if (matched === tokens.length) score += 28;
  score += (matched / tokens.length) * 18;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (text.includes(`${tokens[index]} ${tokens[index + 1]}`)) score += 8;
  }

  return score;
}

export function searchTranscriptCorpusLegacy(
  corpus: SearchCorpus,
  query: string,
  sourceId = "all",
  limit = 12,
): RankedSearchWindow[] {
  const sources = new Map(corpus.sources.map((source) => [source.sourceId, source]));

  return corpus.windows
    .filter((window) => sourceId === "all" || window.sourceId === sourceId)
    .map((window) => {
      const source = sources.get(window.sourceId);
      if (!source) {
        throw new Error(`Search window ${window.windowId} references missing source ${window.sourceId}`);
      }
      return { ...window, source, score: rankTranscriptWindow(window, query, source) };
    })
    .filter((window) => window.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.title.localeCompare(right.source.title) ||
        left.startMs - right.startMs,
    )
    .filter(
      (window, index, all) =>
        index ===
        all.findIndex(
          (candidate) =>
            candidate.sourceId === window.sourceId &&
            Math.abs(candidate.startMs - window.startMs) < 8_000,
        ),
    )
    .slice(0, limit);
}

export function createTranscriptSearchIndex(
  corpus: SearchCorpus,
  { originAware = true }: TranscriptSearchOptions = {},
): TranscriptSearchIndex {
  const sourceMap = new Map(corpus.sources.map((source) => [source.sourceId, source]));
  const indexed: IndexedWindow[] = corpus.windows.map((window) => {
    const source = sourceMap.get(window.sourceId);
    if (!source) {
      throw new Error(`Search window ${window.windowId} references missing source ${window.sourceId}`);
    }
    return {
      window,
      source,
      bodyTokens: lexicalTokens(window.text),
      titleTokens: lexicalTokens(source.title),
    };
  });
  const averageLength = indexed.reduce((sum, item) => sum + item.bodyTokens.length, 0) /
    Math.max(indexed.length, 1);
  const documentFrequency = new Map<string, number>();
  for (const item of indexed) {
    for (const term of new Set(item.bodyTokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const screeningSpans = corpus.screeningSpans ?? corpus.windows.flatMap((window) =>
    window.screening
      ? [{
          sourceId: window.sourceId,
          startMs: window.startMs,
          endMs: window.endMs,
          label: window.screening.label,
        }]
      : []
  );

  return {
    search(query: string, sourceId = "all", limit = 12): RankedSearchWindow[] {
      const features = queryFeatures(query);
      if (features.terms.length === 0) return [];
      const requiredCoverage = features.terms.length === 1
        ? 1
        : Math.max(2, Math.ceil(features.terms.length * 0.6));

      const scored = indexed
        .filter((item) => sourceId === "all" || item.window.sourceId === sourceId)
        .map((item): RankedSearchWindow => {
          const matchedTerms = features.terms.filter((term) => item.bodyTokens.includes(term));
          const splitAt = Math.floor(features.terms.length / 2);
          const matchesFirstGroup = features.terms
            .slice(0, splitAt)
            .some((term) => item.bodyTokens.includes(term));
          const matchesSecondGroup = features.terms
            .slice(splitAt)
            .some((term) => item.bodyTokens.includes(term));
          if (
            matchedTerms.length < requiredCoverage ||
            (features.requireTermGroups && (!matchesFirstGroup || !matchesSecondGroup))
          ) {
            return { ...item.window, source: item.source, score: 0 };
          }

          let score = 0;
          for (const term of features.terms) {
            const frequency = termFrequency(item.bodyTokens, term);
            if (frequency === 0) continue;
            const df = documentFrequency.get(term) ?? 0;
            const idf = Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
            const denominator = frequency + 1.2 *
              (1 - 0.75 + 0.75 * item.bodyTokens.length / averageLength);
            score += idf * (frequency * 2.2) / denominator;
            if (item.titleTokens.includes(term)) score += idf * 0.12;
          }

          score += (matchedTerms.length / features.terms.length) * 2;
          const span = minimumCoveringSpan(item.bodyTokens, matchedTerms);
          if (span !== null) score += 3 / Math.max(span - matchedTerms.length + 1, 1);
          if (
            features.normalized &&
            normalizeSearchText(item.window.text).includes(features.normalized)
          ) {
            score += 8;
          }

          if (originAware && features.creatorIntent) {
            const label = item.window.screening?.label;
            if (label === "quoted-source" || label === "mixed") score *= 0.55;
            else if (label === "response") score *= 1.15;
            else if (label === "creator-original") score *= 1.05;
            else score *= 0.9;
          }

          return { ...item.window, source: item.source, score, matchReason: "caption-terms" };
        });

      if (originAware && features.creatorIntent) {
        for (const candidate of scored.filter((item) => item.score > 0)) {
          const quotedSpan = screeningSpans.find(
            (span) =>
              span.sourceId === candidate.sourceId &&
              (span.label === "quoted-source" || span.label === "mixed") &&
              span.endMs > candidate.startMs &&
              span.startMs < candidate.endMs,
          );
          if (!quotedSpan) continue;
          const responseSpan = screeningSpans
            .filter(
              (span) =>
                span.sourceId === quotedSpan.sourceId &&
                span.label === "response" &&
                span.startMs >= quotedSpan.endMs &&
                span.startMs <= quotedSpan.endMs + 30_000,
            )
            .sort((left, right) => left.startMs - right.startMs)[0];
          if (!responseSpan) continue;
          const responseWindow = scored.find(
            (item) =>
              item.sourceId === responseSpan.sourceId &&
              item.startMs >= responseSpan.startMs &&
              item.startMs < responseSpan.startMs + 3_000,
          );
          if (responseWindow) {
            responseWindow.matchReason = "response-to-source";
            responseWindow.score = Math.max(responseWindow.score, candidate.score * 1.3);
          }
        }
      }

      const ranked = scored
        .filter((item) => item.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.source.title.localeCompare(right.source.title) ||
            left.startMs - right.startMs,
        );

      return selectNeighborhoodRepresentatives(ranked, features)
        .filter(
          (item, index, all) =>
            index === all.findIndex(
              (candidate) =>
                candidate.sourceId === item.sourceId &&
                Math.abs(candidate.startMs - item.startMs) < 15_000,
            ),
        )
        .slice(0, limit);
    },
  };
}

export function searchTranscriptCorpus(
  corpus: SearchCorpus,
  query: string,
  sourceId = "all",
  limit = 12,
): RankedSearchWindow[] {
  let index = indexCache.get(corpus);
  if (!index) {
    index = createTranscriptSearchIndex(corpus);
    indexCache.set(corpus, index);
  }
  return index.search(query, sourceId, limit);
}

export function formatTimestamp(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function sourceTimestampUrl(source: SearchSource, startMs: number): string {
  return `https://www.youtube.com/watch?v=${source.platformId}&t=${Math.floor(startMs / 1_000)}s`;
}
