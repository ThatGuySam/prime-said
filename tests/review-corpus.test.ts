import { describe, expect, test } from "bun:test";

import {
  buildReviewSearchCorpus,
  type AttributionScreeningFixture,
  type ReviewCaptionFixture,
} from "../src/lib/review-corpus.ts";
import { searchTranscriptCorpus } from "../src/lib/transcript-search.ts";

const fixture: ReviewCaptionFixture = {
  schemaVersion: 1,
  status: "screening-unverified",
  generatedAt: "2026-08-29T13:27:06Z",
  sources: [
    {
      sourceId: "youtube:test",
      platformId: "test",
      title: "Test source",
      channel: "Test channel",
      durationMs: 30_000,
      segments: [
        { segmentId: "s0", startMs: 0, endMs: 4_000, text: "I love driving", search: "i love driving" },
        { segmentId: "s1", startMs: 4_000, endMs: 8_000, text: "implementation via tests", search: "implementation via tests" },
        { segmentId: "s2", startMs: 8_000, endMs: 12_000, text: "because it is easier", search: "because it is easier" },
        { segmentId: "s3", startMs: 12_000, endMs: 16_000, text: "the reverse funnel", search: "the reverse funnel" },
        { segmentId: "s4", startMs: 16_000, endMs: 20_000, text: "then I respond", search: "then i respond" },
        { segmentId: "s5", startMs: 20_000, endMs: 24_000, text: "with more context", search: "with more context" },
      ],
    },
  ],
};

const screening: AttributionScreeningFixture = {
  cases: [
    {
      sourceId: "youtube:test",
      startMs: 12_000,
      endMs: 16_000,
      screening: {
        label: "quoted-source",
        wordsFrom: "twitch-chat",
        reviewStatus: "user-reviewed-window",
        confidence: 0.8,
        notes: "Chat-to-response sequence; exact boundary unreviewed.",
      },
    },
    {
      sourceId: "youtube:test",
      startMs: 16_000,
      endMs: 24_000,
      screening: {
        label: "response",
        wordsFrom: "speaker-original",
        reviewStatus: "user-reviewed-window",
        confidence: 0.95,
        notes: "Response after the chat reading.",
      },
    },
  ],
};

describe("review search corpus", () => {
  test("builds phrase-searchable windows across adjacent caption segments", () => {
    const corpus = buildReviewSearchCorpus(fixture, screening);
    const results = searchTranscriptCorpus(corpus, "driving implementation via tests");

    expect(results[0]?.windowId).toBe("test:0");
    expect(results[0]?.text).toContain("I love driving implementation via tests");
  });

  test("carries a quoted-source screen without upgrading it to reviewed wording", () => {
    const corpus = buildReviewSearchCorpus(fixture, screening);
    const results = searchTranscriptCorpus(corpus, "reverse funnel");

    expect(results[0]?.screening).toMatchObject({
      label: "quoted-source",
      wordsFrom: "twitch-chat",
      reviewStatus: "user-reviewed-window",
    });
    expect(corpus.status).toBe("youtube-auto-captions-unreviewed");
  });

  test("uses stable IDs and deterministic ordering on repeated builds", () => {
    expect(buildReviewSearchCorpus(fixture, screening)).toEqual(
      buildReviewSearchCorpus(fixture, screening),
    );
  });
});
