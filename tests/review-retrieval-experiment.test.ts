import { describe, expect, test } from "bun:test";

import fixtureData from "../corpus/fixtures/tdd-auto-caption-review.json";
import screeningData from "../evals/attribution/screening-corpus.json";
import {
  buildReviewSearchCorpus,
  type AttributionScreeningFixture,
  type ReviewCaptionFixture,
} from "../src/lib/review-corpus.ts";
import {
  createTranscriptSearchIndex,
  lexicalTokens,
  type SearchCorpus,
} from "../src/lib/transcript-search.ts";

const reviewCorpus = buildReviewSearchCorpus(
  fixtureData as ReviewCaptionFixture,
  screeningData as AttributionScreeningFixture,
);

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

describe("review retrieval experiment", () => {
  test("uses whole-token aliases instead of substring matches", () => {
    expect(lexicalTokens("tests driving development")).toEqual(["test", "drive", "develop"]);
    expect(lexicalTokens("the greatest developer")).not.toContain("test");
    expect(lexicalTokens("analysis status")).toEqual(["analysis", "status"]);
  });

  test("requires enough concrete query anchors", () => {
    const index = createTranscriptSearchIndex(corpus, { originAware: false });
    expect(index.search("testing PostgreSQL transactions")).toEqual([]);
  });

  test("can route a creator-position query from a quoted prompt to its response", () => {
    const index = createTranscriptSearchIndex(corpus, { originAware: true });
    const results = index.search("should merge requests require tests");

    expect(results[0]?.windowId).toBe("unit:8000");
    expect(results[0]?.matchReason).toBe("response-to-source");
  });

  test("rejects the unrelated Fear title transition and centers the matching clause", () => {
    const index = createTranscriptSearchIndex(reviewCorpus);
    const results = index.search("tests drive development", "all", 20);
    const coverage = results.find((result) => result.sourceId === "youtube:S_7SE_Uzk-I");

    expect(
      results.some(
        (result) =>
          result.sourceId === "youtube:20SkiBvylyM" &&
          result.startMs >= 890_000 &&
          result.startMs < 910_000,
      ),
    ).toBe(false);
    expect(coverage?.startMs).toBe(1_181_520);
    expect(coverage?.text).toContain("tests that drive");
    expect(results.indexOf(coverage!)).toBeLessThan(8);
  });

  test("keeps compound-query coverage when creator-position words are present", () => {
    const index = createTranscriptSearchIndex(reviewCorpus);
    const results = index.search("does he think tests drive development", "all", 20);

    expect(
      results.some(
        (result) =>
          result.sourceId === "youtube:20SkiBvylyM" &&
          result.startMs >= 890_000 &&
          result.startMs < 910_000,
      ),
    ).toBe(false);
  });
});
