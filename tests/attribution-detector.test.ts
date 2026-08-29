import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { detectAttribution } from "../scripts/attribution-detector.ts";
import {
  evaluateAttribution,
  type ScreeningCorpus,
} from "../scripts/evaluate-attribution.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("deterministic attribution screening", () => {
  test("lets an explicit read boundary outrank first-person chat wording", () => {
    const result = detectAttribution({
      previousText: "oh I like this",
      text: "in my opinion I don't think you can force somebody to become a good tester",
      nextText: "okay thank you Bry I appreciate that",
    });

    expect(result.label).toBe("quoted-source");
    expect(result.status).toBe("screening-candidate");
    expect(result.wordOriginCandidate).toBe("quoted-source");
    expect(result.evidence.map(({ ruleId }) => ruleId)).toContain("quote.deictic-source");
  });

  test("does not treat unmarked first-person wording as authorship proof", () => {
    const result = detectAttribution({
      text: "I need to test everything because I have a hard time deciding where to draw the line",
    });

    expect(result.label).toBe("unknown");
    expect(result.wordOriginCandidate).toBe("unknown");
  });

  test("separates a strong reply from the preceding quoted source", () => {
    const result = detectAttribution({
      previousText: "at my work a merge request gets rejected if there is no test attached",
      text: "yeah see I think that's wrong too",
    });

    expect(result.label).toBe("response");
    expect(result.wordOriginCandidate).toBe("speaker-original");
  });

  test("recognizes a strong standalone workflow statement as a candidate only", () => {
    const result = detectAttribution({
      text: "my argument is that we should make good tests for things that are valuable",
    });

    expect(result.label).toBe("creator-original");
    expect(result.evidence).toContainEqual(expect.objectContaining({
      ruleId: "original.stated-method",
    }));
  });

  test("flags an unresolved reading-repair span as mixed", () => {
    const result = detectAttribution({
      previousText: "I love this take right here",
      text: "I usually focus on integration tests let's see while I just test let's see hold on",
      nextText: "yes I will write a unit test",
    });

    expect(result.label).toBe("mixed");
    expect(result.wordOriginCandidate).toBe("mixed");
  });

  test("treats a completed quote in history as response context", () => {
    const result = detectAttribution({
      previousText: "someone just said I shake like an old alcoholic",
      text: "I hope I never have to hold a mic right",
    });

    expect(result.label).toBe("response");
    expect(result.evidence.map(({ ruleId }) => ruleId)).toContain("response.after-completed-quote");
  });
});

describe("attribution development corpus", () => {
  test("matches the dedicated JSON Schema", async () => {
    const schema = JSON.parse(await readFile(
      join(REPOSITORY_ROOT, "docs", "schemas", "attribution-screening-corpus.schema.json"),
      "utf8",
    )) as object;
    const corpus = JSON.parse(await readFile(
      join(REPOSITORY_ROOT, "evals", "attribution", "screening-corpus.json"),
      "utf8",
    )) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

    expect(validate(corpus), JSON.stringify(validate.errors)).toBe(true);
  });

  test("reports a descriptive smoke result without unsafe own-word attribution", async () => {
    const corpus = JSON.parse(await readFile(
      join(REPOSITORY_ROOT, "evals", "attribution", "screening-corpus.json"),
      "utf8",
    )) as ScreeningCorpus;
    const result = evaluateAttribution(corpus);

    expect(result).toEqual(expect.objectContaining({
      status: "descriptive-development-only",
      cases: 37,
      correct: 34,
      covered: 34,
      abstained: 3,
      unsafeAttributions: 0,
    }));
    expect(result.quotedSource).toEqual({
      truePositive: 14,
      falsePositive: 0,
      falseNegative: 2,
      precision: 1,
      recall: 0.875,
    });
  });
});
