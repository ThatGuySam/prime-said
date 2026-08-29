import { describe, expect, test } from "bun:test";

import {
  createExperimentalRanker,
  lexicalTokens,
  type ScreeningSpan,
} from "../scripts/evaluate-review-retrieval.ts";
import type { SearchCorpus } from "../src/lib/transcript-search.ts";

const corpus: SearchCorpus = {
  schemaVersion: 1,
  status: "youtube-auto-captions-unreviewed",
  generatedAt: "2026-08-29T00:00:00Z",
  sources: [
    {
      sourceId: "youtube:unit",
      platformId: "unit",
      title: "Unit testing conversation",
      channelName: "Example",
      durationMs: 30_000,
    },
  ],
  windows: [
    {
      windowId: "unit:0",
      sourceId: "youtube:unit",
      startMs: 0,
      endMs: 8_000,
      text: "A merge request gets rejected if there is no test attached.",
      before: "",
      after: "Yeah, I think that is wrong.",
      screening: {
        label: "quoted-source",
        wordsFrom: "twitch-chat",
        reviewStatus: "screening-unverified",
        confidence: 0.9,
        notes: "Development fixture.",
      },
    },
    {
      windowId: "unit:8000",
      sourceId: "youtube:unit",
      startMs: 8_000,
      endMs: 16_000,
      text: "Yeah, I think that is wrong too.",
      before: "A merge request gets rejected if there is no test attached.",
      after: "",
      screening: {
        label: "response",
        wordsFrom: "speaker-original",
        reviewStatus: "screening-unverified",
        confidence: 0.9,
        notes: "Development fixture.",
      },
    },
  ],
};

const screening: ScreeningSpan[] = [
  {
    sourceId: "youtube:unit",
    startMs: 0,
    endMs: 8_000,
    screening: { label: "quoted-source" },
  },
  {
    sourceId: "youtube:unit",
    startMs: 8_000,
    endMs: 16_000,
    screening: { label: "response" },
  },
];

describe("review retrieval experiment", () => {
  test("uses whole-token aliases instead of substring matches", () => {
    expect(lexicalTokens("tests driving development")).toEqual(["test", "drive", "develop"]);
    expect(lexicalTokens("the greatest developer")).not.toContain("test");
  });

  test("requires enough concrete query anchors", () => {
    const rank = createExperimentalRanker(corpus, screening, { originAware: false });
    expect(rank("testing PostgreSQL transactions")).toEqual([]);
  });

  test("can route a creator-position query from a quoted prompt to its response", () => {
    const rank = createExperimentalRanker(corpus, screening, { originAware: true });
    const results = rank("should merge requests require tests");

    expect(results[0]?.windowId).toBe("unit:8000");
  });
});
