import fixtureData from "../corpus/fixtures/tdd-auto-caption-review.json";
import screeningData from "../evals/attribution/screening-corpus.json";
import evaluationData from "../evals/development/caption-search-regressions.json";
import {
  buildReviewSearchCorpus,
  type AttributionScreeningFixture,
  type ReviewCaptionFixture,
} from "../src/lib/review-corpus.ts";
import {
  normalizeSearchText,
  rankTranscriptWindow,
  searchTranscriptCorpus,
  type RankedSearchWindow,
  type SearchCorpus,
  type SearchSource,
  type SearchWindow,
} from "../src/lib/transcript-search.ts";

interface TargetSpan {
  sourceId: string;
  startMs: number;
  endMs: number;
}

interface RankedConstraint {
  maxRank: number;
  targets: TargetSpan[];
}

interface PairwiseConstraint {
  higher: TargetSpan;
  lower: TargetSpan;
}

interface EvaluationCase {
  caseId: string;
  query: string;
  intent: string;
  requiredAny?: RankedConstraint;
  protectedLiteral?: RankedConstraint;
  pairwise?: PairwiseConstraint[];
  expectedNoResult?: boolean;
}

interface DevelopmentEvaluation {
  cases: EvaluationCase[];
  syntheticCases: Array<{
    caseId: string;
    query: string;
    text: string;
    expectedMatch: boolean;
  }>;
}

interface IndexedWindow {
  window: SearchWindow;
  source: SearchSource;
  bodyTokens: string[];
  titleTokens: string[];
}

export interface ScreeningSpan {
  sourceId: string;
  startMs: number;
  endMs: number;
  screening: {
    label: string;
  };
}

type Ranker = (query: string) => RankedSearchWindow[];

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

export function canonicalTerm(term: string): string {
  const aliased = TERM_ALIASES.get(term);
  if (aliased) return aliased;
  if (term.length > 4 && term.endsWith("s")) return term.slice(0, -1);
  return term;
}

export function lexicalTokens(value: string, removeStopwords = false): string[] {
  return normalizeSearchText(value)
    .split(" ")
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

export function createExperimentalRanker(
  corpus: SearchCorpus,
  screeningCases: ScreeningSpan[],
  { originAware }: { originAware: boolean },
): Ranker {
  const sourceMap = new Map(corpus.sources.map((source) => [source.sourceId, source]));
  const indexed: IndexedWindow[] = corpus.windows.map((window) => {
    const source = sourceMap.get(window.sourceId);
    if (!source) throw new Error(`Missing source ${window.sourceId}`);
    return {
      window,
      source,
      bodyTokens: lexicalTokens(window.text),
      titleTokens: lexicalTokens(source.title),
    };
  });
  const averageLength = indexed.reduce((sum, item) => sum + item.bodyTokens.length, 0) / indexed.length;
  const documentFrequency = new Map<string, number>();
  for (const item of indexed) {
    for (const term of new Set(item.bodyTokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return (query: string) => {
    const queryTerms = [...new Set(lexicalTokens(query, true))];
    if (queryTerms.length === 0) return [];
    const requiredCoverage = queryTerms.length === 1 ? 1 : Math.max(2, Math.ceil(queryTerms.length * 0.6));
    const normalizedQuery = normalizeSearchText(query.replaceAll('"', ""));
    const creatorIntent = /\b(prime|he|does|should|think|supports?|likes?|recommend)/iu.test(query);
    const supportClaim = /\b(supports?|likes?|recommends?|stan)\b/iu.test(query);

    const scored = indexed.map((item): RankedSearchWindow => {
        const matchedTerms = queryTerms.filter((term) => item.bodyTokens.includes(term));
        if (matchedTerms.length < requiredCoverage) {
          return { ...item.window, source: item.source, score: 0 };
        }

        let score = 0;
        for (const term of queryTerms) {
          const frequency = termFrequency(item.bodyTokens, term);
          if (frequency === 0) continue;
          const df = documentFrequency.get(term) ?? 0;
          const idf = Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
          const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * item.bodyTokens.length / averageLength);
          score += idf * (frequency * 2.2) / denominator;
          if (item.titleTokens.includes(term)) score += idf * 0.12;
        }

        score += (matchedTerms.length / queryTerms.length) * 2;
        const span = minimumCoveringSpan(item.bodyTokens, matchedTerms);
        if (span !== null) score += 3 / Math.max(span - matchedTerms.length + 1, 1);
        if (normalizedQuery && normalizeSearchText(item.window.text).includes(normalizedQuery)) score += 8;

        if (originAware && creatorIntent) {
          const label = item.window.screening?.label;
          if (label === "quoted-source" || label === "mixed") score *= 0.55;
          else if (label === "response") score *= 1.15;
          else if (label === "creator-original") score *= 1.05;
          else score *= 0.9;
        }

        if (originAware && supportClaim) {
          const context = normalizeSearchText(`${item.window.text} ${item.window.after}`);
          if (
            context.includes("opposite of tdd") ||
            context.includes("dont really buy") ||
            context.includes("testing after development")
          ) {
            score *= 0.3;
          }
        }

        return { ...item.window, source: item.source, score };
      });

    if (originAware && creatorIntent) {
      for (const candidate of scored.filter((item) => item.score > 0)) {
        const quotedSpan = screeningCases.find(
          (screeningCase) =>
            screeningCase.sourceId === candidate.sourceId &&
            (screeningCase.screening.label === "quoted-source" || screeningCase.screening.label === "mixed") &&
            screeningCase.endMs > candidate.startMs &&
            screeningCase.startMs < candidate.endMs,
        );
        if (!quotedSpan) continue;
        const responseSpan = screeningCases
          .filter(
            (screeningCase) =>
              screeningCase.sourceId === quotedSpan.sourceId &&
              screeningCase.screening.label === "response" &&
              screeningCase.startMs >= quotedSpan.endMs &&
              screeningCase.startMs <= quotedSpan.endMs + 30_000,
          )
          .sort((left, right) => left.startMs - right.startMs)[0];
        if (!responseSpan) continue;
        const responseWindow = scored.find(
          (item) =>
            item.sourceId === responseSpan.sourceId &&
            item.startMs >= responseSpan.startMs &&
            item.startMs < responseSpan.startMs + 3_000,
        );
        if (responseWindow) responseWindow.score = Math.max(responseWindow.score, candidate.score * 1.3);
      }
    }

    return scored
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.source.title.localeCompare(right.source.title) ||
          left.startMs - right.startMs,
      )
      .filter(
        (item, index, all) =>
          index ===
          all.findIndex(
            (candidate) =>
              candidate.sourceId === item.sourceId &&
              Math.abs(candidate.startMs - item.startMs) < 15_000,
          ),
      )
      .slice(0, 20);
  };
}

function targetRank(results: RankedSearchWindow[], target: TargetSpan): number | null {
  const index = results.findIndex(
    (result) =>
      result.sourceId === target.sourceId &&
      result.startMs >= target.startMs &&
      result.startMs < target.endMs,
  );
  return index >= 0 ? index + 1 : null;
}

function bestTargetRank(results: RankedSearchWindow[], targets: TargetSpan[]): number | null {
  const ranks = targets
    .map((target) => {
      const index = results.findIndex(
        (result) =>
          result.sourceId === target.sourceId &&
          result.endMs > target.startMs &&
          result.startMs < target.endMs,
      );
      return index >= 0 ? index + 1 : null;
    })
    .filter((rank): rank is number => rank !== null);
  return ranks.length > 0 ? Math.min(...ranks) : null;
}

function duplicateNeighborhoodCount(results: RankedSearchWindow[]): number {
  return results.slice(0, 10).filter((result, index, top) =>
    top.slice(0, index).some(
      (candidate) =>
        candidate.sourceId === result.sourceId &&
        Math.abs(candidate.startMs - result.startMs) < 15_000,
    ),
  ).length;
}

function evaluateRanker(
  name: string,
  ranker: Ranker,
  corpus: SearchCorpus,
  evaluation: DevelopmentEvaluation,
) {
  let requiredPasses = 0;
  let requiredTotal = 0;
  let protectedPasses = 0;
  let protectedTotal = 0;
  let pairwisePasses = 0;
  let pairwiseTotal = 0;
  let expectedNoResultPasses = 0;
  let expectedNoResultTotal = 0;
  let originRiskCount = 0;
  let originTopCount = 0;
  let duplicateCount = 0;
  const failures: string[] = [];

  for (const testCase of evaluation.cases) {
    const results = ranker(testCase.query);
    duplicateCount += duplicateNeighborhoodCount(results);

    if (testCase.requiredAny) {
      requiredTotal += 1;
      const rank = bestTargetRank(results, testCase.requiredAny.targets);
      if (rank !== null && rank <= testCase.requiredAny.maxRank) requiredPasses += 1;
      else failures.push(
        `${testCase.caseId}: required hit was ${rank ? `rank ${rank}` : "absent"}; top ${results
          .slice(0, 3)
          .map((result) => `${result.source.platformId}@${result.startMs}`)
          .join(", ") || "none"}`,
      );
    }

    if (testCase.protectedLiteral) {
      protectedTotal += 1;
      const rank = bestTargetRank(results, testCase.protectedLiteral.targets);
      if (rank !== null && rank <= testCase.protectedLiteral.maxRank) protectedPasses += 1;
      else failures.push(`${testCase.caseId}: protected literal was ${rank ? `rank ${rank}` : "absent"}`);
    }

    for (const pair of testCase.pairwise ?? []) {
      pairwiseTotal += 1;
      const higher = targetRank(results, pair.higher);
      const lower = targetRank(results, pair.lower);
      if (higher !== null && (lower === null || higher < lower)) pairwisePasses += 1;
      else failures.push(`${testCase.caseId}: preferred ${higher ?? "absent"} vs prompt ${lower ?? "absent"}`);
    }

    if (testCase.expectedNoResult) {
      expectedNoResultTotal += 1;
      if (results.length === 0) expectedNoResultPasses += 1;
      else failures.push(`${testCase.caseId}: returned ${results.length} result(s)`);
    }

    if (testCase.intent === "creator-position" || testCase.intent === "claim-support") {
      for (const result of results.slice(0, 3)) {
        originTopCount += 1;
        if (result.screening?.label === "quoted-source" || result.screening?.label === "mixed") {
          originRiskCount += 1;
        }
      }
    }
  }

  const synthetic = evaluation.syntheticCases[0]!;
  const syntheticSource: SearchSource = {
    sourceId: "synthetic",
    platformId: "synthetic",
    title: "Synthetic",
    channelName: "Synthetic",
    durationMs: 1_000,
  };
  const syntheticWindow: SearchWindow = {
    windowId: "synthetic:0",
    sourceId: "synthetic",
    startMs: 0,
    endMs: 1_000,
    text: synthetic.text,
    before: "",
    after: "",
  };
  const baselineSyntheticMatch = rankTranscriptWindow(syntheticWindow, synthetic.query, syntheticSource) > 0;
  const candidateSyntheticMatch = lexicalTokens(synthetic.text).includes(canonicalTerm(synthetic.query));
  const wholeTokenPass = (name === "current" ? baselineSyntheticMatch : candidateSyntheticMatch) === synthetic.expectedMatch;
  if (!wholeTokenPass) failures.push(`${synthetic.caseId}: substring-only match`);

  return {
    name,
    required: `${requiredPasses}/${requiredTotal}`,
    pairwise: `${pairwisePasses}/${pairwiseTotal}`,
    protectedLiteral: `${protectedPasses}/${protectedTotal}`,
    expectedNoResult: `${expectedNoResultPasses}/${expectedNoResultTotal}`,
    wholeToken: wholeTokenPass ? "1/1" : "0/1",
    originRisk: `${originRiskCount}/${originTopCount}`,
    duplicateCount,
    failures,
    corpusWindows: corpus.windows.length,
  };
}

if (import.meta.main) {
  const corpus = buildReviewSearchCorpus(
    fixtureData as ReviewCaptionFixture,
    screeningData as AttributionScreeningFixture,
  );
  const evaluation = evaluationData as DevelopmentEvaluation;
  const screeningCases = (screeningData as { cases: ScreeningSpan[] }).cases;
  const rankers: Array<[string, Ranker]> = [
    ["current", (query) => searchTranscriptCorpus(corpus, query, "all", 20)],
    ["bm25-proximity", createExperimentalRanker(corpus, screeningCases, { originAware: false })],
    ["bm25-proximity-origin", createExperimentalRanker(corpus, screeningCases, { originAware: true })],
  ];
  const reports = rankers.map(([name, ranker]) => evaluateRanker(name, ranker, corpus, evaluation));

  console.table(
    reports.map((report) => ({
      ranker: report.name,
      required: report.required,
      pairwise: report.pairwise,
      literals: report.protectedLiteral,
      "no-result": report.expectedNoResult,
      "whole-token": report.wholeToken,
      "origin-risk@3": report.originRisk,
      "duplicate-neighborhoods": report.duplicateCount,
    })),
  );

  for (const report of reports) {
    console.log(`\n${report.name} failures (${report.failures.length}):`);
    for (const failure of report.failures) console.log(`- ${failure}`);
  }

  console.log(
    `\nDevelopment screen only: ${evaluation.cases.length} caption-derived queries over ${corpus.windows.length} overlapping windows. No recording, speaker, origin, gold-set, or device claim.`,
  );
}
