import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectAttribution,
  type AttributionInput,
  type AttributionLabel,
} from "./attribution-detector.ts";

interface ScreeningCase {
  caseId: string;
  sourceId: string;
  input: AttributionInput;
  screening: {
    label: AttributionLabel;
  };
}

export interface ScreeningCorpus {
  schemaVersion: 1;
  status: "screening-unverified";
  cases: ScreeningCase[];
}

export interface AttributionEvaluation {
  status: "descriptive-development-only";
  cases: number;
  correct: number;
  accuracy: number;
  covered: number;
  coverage: number;
  abstained: number;
  unsafeAttributions: number;
  quotedSource: {
    truePositive: number;
    falsePositive: number;
    falseNegative: number;
    precision: number | null;
    recall: number | null;
  };
  bySource: Record<string, { cases: number; correct: number }>;
  failures: Array<{
    caseId: string;
    expected: AttributionLabel;
    actual: AttributionLabel;
  }>;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function isQuoted(label: AttributionLabel): boolean {
  return label === "quoted-source" || label === "mixed";
}

function isUnsafeOwnAttribution(label: AttributionLabel): boolean {
  return label === "creator-original" || label === "response";
}

export function evaluateAttribution(corpus: ScreeningCorpus): AttributionEvaluation {
  let correct = 0;
  let covered = 0;
  let unsafeAttributions = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  const bySource: AttributionEvaluation["bySource"] = {};
  const failures: AttributionEvaluation["failures"] = [];

  for (const testCase of corpus.cases) {
    const expected = testCase.screening.label;
    const actual = detectAttribution(testCase.input).label;
    const source = bySource[testCase.sourceId] ?? { cases: 0, correct: 0 };
    source.cases += 1;
    if (actual === expected) {
      correct += 1;
      source.correct += 1;
    } else {
      failures.push({ caseId: testCase.caseId, expected, actual });
    }
    bySource[testCase.sourceId] = source;

    if (actual !== "unknown") covered += 1;
    if (isQuoted(expected) && isUnsafeOwnAttribution(actual)) unsafeAttributions += 1;
    if (isQuoted(actual) && isQuoted(expected)) truePositive += 1;
    if (isQuoted(actual) && !isQuoted(expected)) falsePositive += 1;
    if (!isQuoted(actual) && isQuoted(expected)) falseNegative += 1;
  }

  return {
    status: "descriptive-development-only",
    cases: corpus.cases.length,
    correct,
    accuracy: ratio(correct, corpus.cases.length) ?? 0,
    covered,
    coverage: ratio(covered, corpus.cases.length) ?? 0,
    abstained: corpus.cases.length - covered,
    unsafeAttributions,
    quotedSource: {
      truePositive,
      falsePositive,
      falseNegative,
      precision: ratio(truePositive, truePositive + falsePositive),
      recall: ratio(truePositive, truePositive + falseNegative),
    },
    bySource,
    failures,
  };
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (import.meta.main) {
  const inputPath = resolve(
    process.argv[2] ?? join(repositoryRoot, "evals", "attribution", "screening-corpus.json"),
  );
  const corpus = JSON.parse(await readFile(inputPath, "utf8")) as ScreeningCorpus;
  console.log(JSON.stringify(evaluateAttribution(corpus), null, 2));
}
