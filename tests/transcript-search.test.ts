import { describe, expect, test } from "bun:test";

import {
  formatTimestamp,
  normalizeSearchText,
  searchTranscriptCorpus,
  sourceTimestampUrl,
  type SearchCorpus,
} from "../src/lib/transcript-search.ts";

const corpus: SearchCorpus = {
  schemaVersion: 1,
  status: "youtube-auto-captions-unreviewed",
  generatedAt: "2026-08-29T00:00:00Z",
  sources: [
    {
      sourceId: "youtube:unit",
      platformId: "unit",
      title: "Lets Chat About Unit Tests",
      channelName: "The Prime Time",
      durationMs: 1_000_000,
    },
    {
      sourceId: "youtube:coverage",
      platformId: "coverage",
      title: "The Lies Of 100% Code Coverage",
      channelName: "The Prime Time",
      durationMs: 2_000_000,
    },
  ],
  windows: [
    {
      windowId: "unit:373160",
      sourceId: "youtube:unit",
      startMs: 373_160,
      endMs: 381_199,
      text: "Yeah, absolutely. That's why I love driving implementation via tests.",
      before: "A chat message about manual testing.",
      after: "A concrete example follows.",
      screening: {
        label: "response",
        wordsFrom: "speaker-original",
        reviewStatus: "screening-unverified",
        confidence: 0.99,
        notes: "Development screen only.",
      },
    },
    {
      windowId: "coverage:1242559",
      sourceId: "youtube:coverage",
      startMs: 1_242_559,
      endMs: 1_243_640,
      text: "The reverse funnel.",
      before: "",
      after: "I do like integration testing.",
      screening: {
        label: "quoted-source",
        wordsFrom: "twitch-chat",
        reviewStatus: "user-reviewed-window",
        confidence: 0.78,
        notes: "Exact ASR words and split remain unreviewed.",
      },
    },
  ],
};

describe("transcript search", () => {
  test("normalizes case, punctuation, whitespace, and apostrophes deterministically", () => {
    expect(normalizeSearchText("  That's 100% CODE-Coverage!!! ")).toBe(
      "thats 100 code coverage",
    );
  });

  test("ranks exact multi-token transcript matches ahead of title-only matches", () => {
    const results = searchTranscriptCorpus(corpus, "DRIVING implementation!!!");

    expect(results.map((result) => result.windowId)).toEqual(["unit:373160"]);
    expect(results[0]?.screening?.label).toBe("response");
  });

  test("returns the quoted-chat hard negative without changing its attribution status", () => {
    const results = searchTranscriptCorpus(corpus, "reverse funnel");

    expect(results[0]?.windowId).toBe("coverage:1242559");
    expect(results[0]?.screening?.wordsFrom).toBe("twitch-chat");
  });

  test("returns an empty list for an unrelated query", () => {
    expect(searchTranscriptCorpus(corpus, "purple aardvark compiler")).toEqual([]);
  });

  test("formats timestamp labels and direct source links", () => {
    expect(formatTimestamp(1_242_559)).toBe("20:42");
    expect(sourceTimestampUrl(corpus.sources[1]!, 1_242_559)).toBe(
      "https://www.youtube.com/watch?v=coverage&t=1242s",
    );
  });
});
