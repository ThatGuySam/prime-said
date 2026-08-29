import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import fixtureData from "../corpus/fixtures/tdd-auto-caption-review.json";
import screeningData from "../evals/attribution/screening-corpus.json";
import {
  buildReviewSearchCorpus,
  type AttributionScreeningFixture,
  type ReviewCaptionFixture,
} from "../src/lib/review-corpus.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  outputIndex >= 0 && process.argv[outputIndex + 1]
    ? process.argv[outputIndex + 1]!
    : join(root, "artifacts", "review-search-corpus.json"),
);
const fixture = fixtureData as ReviewCaptionFixture;
const corpus = buildReviewSearchCorpus(
  fixture,
  screeningData as AttributionScreeningFixture,
);
const sourceSegments = new Map(
  fixture.sources.map((source) => [source.sourceId, source.segments.length]),
);

const exported = {
  ...corpus,
  sources: corpus.sources.map((source) => ({
    sourceId: source.sourceId,
    videoId: source.platformId,
    title: source.title,
    channel: source.channelName,
    durationMs: source.durationMs,
    captionTrack: "YouTube English auto captions (unreviewed)",
    segmentCount: sourceSegments.get(source.sourceId) ?? 0,
  })),
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(exported, null, 2)}\n`);
console.log(
  `Wrote ${exported.windows.length} review windows from ${exported.sources.length} real caption tracks to ${output}`,
);
