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
}

export interface RankedSearchWindow extends SearchWindow {
  score: number;
  source: SearchSource;
}

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

export function searchTranscriptCorpus(
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
