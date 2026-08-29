import { describe, expect, test } from "bun:test";

import {
  buildCanonicalRecords,
  parseCliArguments,
  parseDiscoveryPayload,
  parseParakeetOutput,
  parseSourceMetadata,
} from "../scripts/ingest-backfill.ts";

const METADATA = {
  id: "S_7SE_Uzk-I",
  channel_id: "UCUyeluBRhGPCW4rPe_UvBZQ",
  channel: "ThePrimeTimeagen",
  title: "Fixture video",
  description: "Fixture description",
  duration: 12.5,
  upload_date: "20260829",
};

const PARAKEET = {
  text: "Hello TypeScript.",
  sentences: [
    {
      text: " Hello   TypeScript. ",
      start: 1.25,
      end: 3.5,
      confidence: 0.9,
      tokens: [
        { text: " Hello", start: 1.25, end: 1.75, duration: 0.5, confidence: 0.8 },
        { text: " TypeScript.", start: 1.75, end: 3.5, duration: 1.75, confidence: 0.95 },
      ],
    },
  ],
};

describe("backfill CLI", () => {
  test("defaults to a ten-video batch", () => {
    expect(parseCliArguments([])).toEqual({
      kind: "run",
      channelUrl: "https://www.youtube.com/@ThePrimeTimeagen/videos",
      limit: 10,
      videoIds: [],
      dryRun: false,
    });
  });

  test("accepts repeated explicit video IDs without duplicates", () => {
    expect(parseCliArguments([
      "--limit",
      "2",
      "--video-id",
      "S_7SE_Uzk-I",
      "--video-id",
      "https://www.youtube.com/watch?v=S_7SE_Uzk-I",
    ])).toMatchObject({ videoIds: ["S_7SE_Uzk-I"], limit: 2 });
  });

  test("refuses batches larger than ten", () => {
    expect(() => parseCliArguments(["--limit", "11"])).toThrow("1 through 10");
  });
});
describe("external data parsing", () => {
  test("deduplicates usable discovery entries", () => {
    expect(parseDiscoveryPayload({
      entries: [
        { id: "one123", title: "One" },
        { id: "one123", title: "Duplicate" },
        { id: "two456", title: "Two" },
        null,
      ],
    })).toEqual([
      { platformId: "one123", title: "One" },
      { platformId: "two456", title: "Two" },
    ]);
  });

  test("rejects metadata from an unapproved channel", () => {
    expect(() => parseSourceMetadata({ ...METADATA, channel_id: "other" })).toThrow(
      "unapproved channel",
    );
  });

  test("rejects empty Parakeet output", () => {
    expect(() => parseParakeetOutput({ text: "", sentences: [] })).toThrow("empty transcript");
  });
});

describe("canonical corpus conversion", () => {
  test("creates timestamped source and transcript records", () => {
    const metadata = parseSourceMetadata(METADATA);
    const parakeet = parseParakeetOutput(PARAKEET);
    const records = buildCanonicalRecords({
      metadata,
      parakeet,
      generatedAt: "2026-08-29T12:00:00.000Z",
      runId: "fixture-run",
      runtime: "parakeet-mlx 0.5.1",
    });

    expect(records.source).toMatchObject({
      sourceId: "youtube:S_7SE_Uzk-I",
      durationMs: 12_500,
      channel: { id: "UCUyeluBRhGPCW4rPe_UvBZQ", category: "creator-official" },
    });
    expect(records.transcript.transcriptId).toMatch(/^t1_[a-f0-9]{24}$/);
    expect(records.transcript.segments).toEqual([
      {
        segmentId: "youtube:S_7SE_Uzk-I:segment:1",
        startMs: 1_250,
        endMs: 3_500,
        verbatim: "Hello TypeScript.",
        display: "Hello TypeScript.",
        search: "hello typescript.",
        confidence: 0.9,
        words: [
          { text: " Hello", startMs: 1_250, endMs: 1_750, confidence: 0.8 },
          { text: " TypeScript.", startMs: 1_750, endMs: 3_500, confidence: 0.95 },
        ],
      },
    ]);
  });

  test("rejects transcript timestamps beyond the source duration", () => {
    const metadata = parseSourceMetadata(METADATA);
    const parakeet = parseParakeetOutput({
      ...PARAKEET,
      sentences: [{ ...PARAKEET.sentences[0], start: 11, end: 20 }],
    });
    expect(() => buildCanonicalRecords({
      metadata,
      parakeet,
      generatedAt: "2026-08-29T12:00:00.000Z",
      runId: "fixture-run",
      runtime: "parakeet-mlx 0.5.1",
    })).toThrow("timing invariants");
  });
});
