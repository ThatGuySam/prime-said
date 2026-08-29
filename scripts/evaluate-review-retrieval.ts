import fixtureData from "../corpus/fixtures/tdd-auto-caption-review.json";
import screeningData from "../evals/attribution/screening-corpus.json";
import evaluationData from "../evals/development/caption-search-regressions.json";
import {
  buildReviewSearchCorpus,
  type AttributionScreeningFixture,
  type ReviewCaptionFixture,
} from "../src/lib/review-corpus.ts";
import {
  canonicalTerm,
  createTranscriptSearchIndex,
  lexicalTokens,
  rankTranscriptWindow,
  searchTranscriptCorpusLegacy,
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
  excludedTop?: RankedConstraint;
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

type Ranker = (query: string) => RankedSearchWindow[];

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
  let excludedPasses = 0;
  let excludedTotal = 0;
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

    if (testCase.excludedTop) {
      excludedTotal += 1;
      const rank = bestTargetRank(results, testCase.excludedTop.targets);
      if (rank === null || rank > testCase.excludedTop.maxRank) excludedPasses += 1;
      else failures.push(`${testCase.caseId}: excluded span appeared at rank ${rank}`);
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
  const wholeTokenPass = (name === "legacy" ? baselineSyntheticMatch : candidateSyntheticMatch) === synthetic.expectedMatch;
  if (!wholeTokenPass) failures.push(`${synthetic.caseId}: substring-only match`);

  return {
    name,
    required: `${requiredPasses}/${requiredTotal}`,
    pairwise: `${pairwisePasses}/${pairwiseTotal}`,
    protectedLiteral: `${protectedPasses}/${protectedTotal}`,
    expectedNoResult: `${expectedNoResultPasses}/${expectedNoResultTotal}`,
    excludedTop: `${excludedPasses}/${excludedTotal}`,
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
  const proximityIndex = createTranscriptSearchIndex(corpus, { originAware: false });
  const productionIndex = createTranscriptSearchIndex(corpus, { originAware: true });
  const rankers: Array<[string, Ranker]> = [
    ["legacy", (query) => searchTranscriptCorpusLegacy(corpus, query, "all", 20)],
    ["bm25-proximity", (query) => proximityIndex.search(query, "all", 20)],
    ["production", (query) => productionIndex.search(query, "all", 20)],
  ];
  const reports = rankers.map(([name, ranker]) => evaluateRanker(name, ranker, corpus, evaluation));

  console.table(
    reports.map((report) => ({
      ranker: report.name,
      required: report.required,
      pairwise: report.pairwise,
      literals: report.protectedLiteral,
      "no-result": report.expectedNoResult,
      exclusions: report.excludedTop,
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
