import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVIEW_CAPTION_SOURCES,
  REVIEW_CAPTION_TRACK,
} from "./review-caption-source-contract.ts";

interface CaptionEvent {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

interface CaptionJson {
  events?: CaptionEvent[];
}

interface PublicMetadata {
  id?: string;
  title?: string;
  channel?: string;
  channel_id?: string;
  webpage_url?: string;
  duration?: number;
  timestamp?: number;
}

interface ScreeningSource {
  sourceId: string;
  captionSha256: string;
}

interface ScreeningCorpus {
  sources: ScreeningSource[];
}

interface CandidateSource {
  sourceId: string;
  title: string;
}

interface CandidateFixture {
  sources: CandidateSource[];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const notice =
  "English YouTube auto-generated captions (ASR), unreviewed. They may contain errors, omissions, timing drift, and misattribution. A caption occurrence is not proof of word origin, authorship, endorsement, or unique usage by any speaker.";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function cleanText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200b\u200c\u200d\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function searchText(value: string): string {
  return cleanText(value).toLocaleLowerCase("en-US");
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function publishedAt(timestamp: number | undefined): string | null {
  return timestamp ? new Date(timestamp * 1_000).toISOString().replace(".000Z", "Z") : null;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function main(): Promise<void> {
  const rawDirectory = resolve(argument("--raw-dir") ?? join(root, "downloads", "tdd-captions"));
  const output = resolve(
    argument("--output") ?? join(root, "corpus", "fixtures", "tdd-auto-caption-review.json"),
  );
  const generatedAt = argument("--generated-at");
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("Pass --generated-at with the caption acquisition time in ISO 8601 format.");
  }

  const screening = await readJson<ScreeningCorpus>(
    join(root, "evals", "attribution", "screening-corpus.json"),
  );
  const candidates = await readJson<CandidateFixture>(
    join(root, "corpus", "fixtures", "tdd-sources.json"),
  );
  const expectedHashes = new Map(
    screening.sources.map((source) => [source.sourceId, source.captionSha256]),
  );
  const expectedTitles = new Map(
    candidates.sources.map((source) => [source.sourceId, source.title]),
  );

  const sources = [];
  for (const expectedSource of REVIEW_CAPTION_SOURCES) {
    const { platformId: videoId, sourceId } = expectedSource;
    const captionPath = join(rawDirectory, `${videoId}.en.json3`);
    const metadataPath = join(rawDirectory, `${videoId}.info.json`);
    const captionBytes = await readFile(captionPath);
    const actualCaptionHash = sha256(captionBytes);
    if (actualCaptionHash !== expectedHashes.get(sourceId)) {
      throw new Error(
        `${basename(captionPath)} SHA-256 ${actualCaptionHash} does not match the screened track`,
      );
    }

    const captions = JSON.parse(captionBytes.toString("utf8")) as CaptionJson;
    const metadata = await readJson<PublicMetadata>(metadataPath);
    if (metadata.id !== videoId) throw new Error(`${basename(metadataPath)} has the wrong video ID`);
    if (metadata.title !== expectedTitles.get(sourceId)) {
      throw new Error(`${sourceId} title no longer matches the Phase 0 candidate fixture`);
    }
    if (metadata.channel !== expectedSource.channel) {
      throw new Error(`${sourceId} channel no longer matches the pinned source contract`);
    }
    if (metadata.channel_id !== expectedSource.channelId) {
      throw new Error(`${sourceId} channel ID no longer matches the pinned source contract`);
    }
    if (metadata.webpage_url !== expectedSource.canonicalUrl) {
      throw new Error(`${sourceId} URL no longer matches the pinned source contract`);
    }
    if (Math.round((metadata.duration ?? 0) * 1_000) !== expectedSource.durationMs) {
      throw new Error(`${sourceId} duration no longer matches the pinned source contract`);
    }
    if (publishedAt(metadata.timestamp) !== expectedSource.publishedAt) {
      throw new Error(`${sourceId} publication time no longer matches the pinned source contract`);
    }

    const segments = [];
    for (const event of captions.events ?? []) {
      const text = cleanText((event.segs ?? []).map((segment) => segment.utf8 ?? "").join(""));
      if (!text) continue;
      const startMs = Math.max(0, Math.trunc(event.tStartMs ?? 0));
      const endMs = startMs + Math.max(1, Math.trunc(event.dDurationMs ?? 0));
      segments.push({
        segmentId: `${videoId}:${String(segments.length).padStart(4, "0")}`,
        startMs,
        endMs,
        text,
        search: searchText(text),
      });
    }

    sources.push({
      sourceId,
      platformId: videoId,
      title: metadata.title,
      channel: expectedSource.channel,
      canonicalUrl: expectedSource.canonicalUrl,
      publishedAt: expectedSource.publishedAt,
      durationMs: expectedSource.durationMs,
      captionSha256: actualCaptionHash,
      wordingStatus: "machine-generated-unreviewed",
      speakerStatus: "unknown",
      wordOriginStatus: "unknown",
      segments,
    });
  }

  const fixture = {
    schemaVersion: 1,
    status: "screening-unverified",
    captionTrack: REVIEW_CAPTION_TRACK,
    generatedAt: new Date(generatedAt).toISOString(),
    notice,
    sources,
  };
  await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(
    `Wrote ${sources.reduce((total, source) => total + source.segments.length, 0)} unreviewed caption segments to ${output}`,
  );
}

await main();
