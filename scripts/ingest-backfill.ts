import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCorpus } from "./validate-corpus.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CHANNEL_URL = "https://www.youtube.com/@ThePrimeTimeagen/videos";
const APPROVED_CHANNEL_ID = "UCUyeluBRhGPCW4rPe_UvBZQ";
const ALLOW_LIST_ID = "youtube:theprimetimeagen-official";
const MODEL_ID = "mlx-community/parakeet-tdt-0.6b-v3";
const MODEL_REVISION = "ed2b7e8c15f9aaa0b5772e2efb986255eaef7e15";
const YT_DLP_VERSION = "2026.08.27.231323";
const YT_DLP_MACOS_SHA256 = "282d67228a418b4f0c56ce0ca82d0f6b12dc31bb5d3f7b85c1d5944974e1fbe8";
const PINNED_YT_DLP_PATH = join(
  REPOSITORY_ROOT,
  "artifacts",
  "tools",
  "yt-dlp",
  YT_DLP_VERSION,
  "yt-dlp_macos",
);
const MODEL_SNAPSHOT = join(
  process.env.HOME ?? "",
  ".cache",
  "huggingface",
  "hub",
  "models--mlx-community--parakeet-tdt-0.6b-v3",
  "snapshots",
  MODEL_REVISION,
);
const PIPELINE_VERSION = 1;
const MAX_BATCH_SIZE = 10;
export const YOUTUBE_ORIGINAL_AUDIO_FORMAT =
  "bestaudio[language^=en][abr<=160]/bestaudio[language^=en]";

type JsonObject = Record<string, unknown>;

type ParsedCliArguments =
  | { kind: "help" }
  | {
      kind: "run";
      channelUrl: string;
      limit: number;
      videoIds: string[];
      dryRun: boolean;
    };

interface ToolPaths {
  deno: string;
  ffmpeg: string;
  ffprobe: string;
  parakeet: string;
  ytDlp: string;
}

interface ToolVersions {
  deno: string;
  ffmpeg: string;
  parakeet: string;
  ytDlp: string;
}

interface DiscoveredVideo {
  platformId: string;
  title: string;
}

interface SourceMetadata {
  platformId: string;
  channelId: string;
  channelName: string;
  title: string;
  description: string;
  canonicalUrl: string;
  publishedAt: string | null;
  durationMs: number;
}

interface ParakeetToken {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface ParakeetSentence {
  text: string;
  start: number;
  end: number;
  confidence: number;
  tokens: ParakeetToken[];
}

interface ParakeetOutput {
  text: string;
  sentences: ParakeetSentence[];
}

interface CanonicalSource extends JsonObject {
  schemaVersion: 1;
  sourceId: string;
  platform: "youtube";
  platformId: string;
  channel: {
    id: string;
    name: string;
    category: "creator-official";
  };
  title: string;
  description: string;
  canonicalUrl: string;
  publishedAt: string | null;
  durationMs: number;
  availability: "available";
  lastCheckedAt: string;
  mediaFingerprint: string | null;
  provenance: {
    allowListId: string;
    discoveredAt: string;
    runId: string;
  };
}

interface CanonicalTranscript extends JsonObject {
  schemaVersion: 1;
  transcriptId: string;
  sourceId: string;
  language: "en";
  pipeline: {
    modelId: string;
    modelRevision: string;
    runtime: string;
    generatedAt: string;
  };
  segments: Array<{
    segmentId: string;
    startMs: number;
    endMs: number;
    verbatim: string;
    display: string;
    search: string;
    confidence: number;
  }>;
}

interface BatchResult {
  platformId: string;
  status: "completed" | "failed" | "skipped";
  sourcePath?: string;
  transcriptPath?: string;
  workDirectory?: string;
  error?: string;
}

interface RunManifest {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  channelUrl: string;
  requestedLimit: number;
  selectedVideoIds: string[];
  pipelineVersion: number;
  tools: ToolVersions;
  model: { id: string; revision: string; snapshot: string };
  results: BatchResult[];
}

export function parseCliArguments(args: string[]): ParsedCliArguments {
  const channelUrl = DEFAULT_CHANNEL_URL;
  let limit = MAX_BATCH_SIZE;
  let dryRun = false;
  const videoIds: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") return { kind: "help" };
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--limit" || argument === "--video-id") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--limit") {
        limit = Number(value);
      } else {
        videoIds.push(parseVideoId(value));
      }
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) {
    throw new Error(`--limit must be an integer from 1 through ${MAX_BATCH_SIZE}`);
  }
  const uniqueVideoIds = [...new Set(videoIds)];
  if (uniqueVideoIds.length > limit) {
    throw new Error(`received ${uniqueVideoIds.length} video IDs but --limit is ${limit}`);
  }

  return { kind: "run", channelUrl, limit, videoIds: uniqueVideoIds, dryRun };
}

function parseVideoId(value: string): string {
  if (/^[A-Za-z0-9_-]{6,20}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid YouTube video ID or URL: ${value}`);
  }
  const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v");
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    throw new Error(`invalid YouTube video ID or URL: ${value}`);
  }
  return id;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`expected ${key} to be a non-empty string`);
  }
  return value;
}

function requireFiniteNumber(object: JsonObject, key: string): number {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`expected ${key} to be a finite number`);
  }
  return value;
}

export function parseDiscoveryPayload(value: unknown): DiscoveredVideo[] {
  if (!isObject(value) || !Array.isArray(value.entries)) {
    throw new Error("yt-dlp discovery output has no entries array");
  }
  const videos: DiscoveredVideo[] = [];
  const seen = new Set<string>();
  for (const entry of value.entries) {
    if (!isObject(entry)) continue;
    const platformId = typeof entry.id === "string" ? entry.id : null;
    const title = typeof entry.title === "string" ? entry.title : null;
    if (!platformId || !title || seen.has(platformId)) continue;
    seen.add(platformId);
    videos.push({ platformId, title });
  }
  if (videos.length === 0) throw new Error("yt-dlp discovery returned no usable videos");
  return videos;
}

export function parseSourceMetadata(value: unknown): SourceMetadata {
  if (!isObject(value)) throw new Error("yt-dlp metadata output is not an object");
  const platformId = requireString(value, "id");
  const channelId = requireString(value, "channel_id");
  const channelName = requireString(value, "channel");
  if (channelId !== APPROVED_CHANNEL_ID) {
    throw new Error(`source ${platformId} belongs to unapproved channel ${channelId}`);
  }
  const durationSeconds = requireFiniteNumber(value, "duration");
  if (durationSeconds <= 0) throw new Error(`source ${platformId} has invalid duration`);
  const uploadDate = typeof value.upload_date === "string" ? value.upload_date : null;
  const publishedTimestamp = typeof value.timestamp === "number" && Number.isFinite(value.timestamp)
    ? value.timestamp
    : null;
  return {
    platformId,
    channelId,
    channelName,
    title: requireString(value, "title"),
    description: typeof value.description === "string" ? value.description : "",
    canonicalUrl: `https://www.youtube.com/watch?v=${platformId}`,
    publishedAt: publishedTimestamp !== null
      ? new Date(publishedTimestamp * 1_000).toISOString()
      : uploadDate ? youtubeDateToIso(uploadDate) : null,
    durationMs: Math.round(durationSeconds * 1_000),
  };
}

function youtubeDateToIso(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error(`invalid YouTube upload date: ${value}`);
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

export function parseParakeetOutput(value: unknown): ParakeetOutput {
  if (!isObject(value) || !Array.isArray(value.sentences)) {
    throw new Error("Parakeet output has no sentences array");
  }
  const sentences = value.sentences.map((sentenceValue, sentenceIndex) => {
    if (!isObject(sentenceValue) || !Array.isArray(sentenceValue.tokens)) {
      throw new Error(`Parakeet sentence ${sentenceIndex} is invalid`);
    }
    const sentence: ParakeetSentence = {
      text: requireString(sentenceValue, "text"),
      start: requireFiniteNumber(sentenceValue, "start"),
      end: requireFiniteNumber(sentenceValue, "end"),
      confidence: requireFiniteNumber(sentenceValue, "confidence"),
      tokens: sentenceValue.tokens.map((tokenValue, tokenIndex) => {
        if (!isObject(tokenValue)) {
          throw new Error(`Parakeet token ${sentenceIndex}:${tokenIndex} is invalid`);
        }
        return {
          text: requireString(tokenValue, "text"),
          start: requireFiniteNumber(tokenValue, "start"),
          end: requireFiniteNumber(tokenValue, "end"),
          confidence: requireFiniteNumber(tokenValue, "confidence"),
        };
      }),
    };
    if (sentence.end <= sentence.start || sentence.tokens.length === 0) {
      throw new Error(`Parakeet sentence ${sentenceIndex} has invalid timing or no tokens`);
    }
    return sentence;
  });
  if (sentences.length === 0) throw new Error("Parakeet returned an empty transcript");
  return {
    text: typeof value.text === "string" ? value.text : sentences.map((item) => item.text).join(" "),
    sentences,
  };
}

export function parseDownloadedAudioLanguage(value: unknown): string {
  if (!isObject(value)) throw new Error("yt-dlp download metadata is not an object");
  const requestedAudio = value.vcodec === "none"
    ? value
    : Array.isArray(value.requested_downloads)
      ? value.requested_downloads.find((download) =>
          isObject(download) && download.vcodec === "none"
        )
      : null;
  if (!isObject(requestedAudio)) throw new Error("yt-dlp metadata has no requested audio format");
  const language = requireString(requestedAudio, "language");
  if (!language.toLocaleLowerCase("en-US").startsWith("en")) {
    throw new Error(`downloaded audio language is ${language}, not English`);
  }
  return language;
}

export function buildCanonicalRecords(options: {
  metadata: SourceMetadata;
  parakeet: ParakeetOutput;
  generatedAt: string;
  runId: string;
  runtime: string;
}): { source: CanonicalSource; transcript: CanonicalTranscript } {
  const sourceId = `youtube:${options.metadata.platformId}`;
  let previousEndMs = 0;
  const segments = options.parakeet.sentences.map((sentence, index) => {
    const startMs = Math.round(sentence.start * 1_000);
    const endMs = Math.round(sentence.end * 1_000);
    if (startMs < previousEndMs || endMs <= startMs || endMs > options.metadata.durationMs + 2_500) {
      throw new Error(`sentence ${index} violates transcript timing invariants`);
    }
    previousEndMs = endMs;
    const verbatim = normalizeWhitespace(sentence.text);
    return {
      segmentId: `youtube:${options.metadata.platformId}:segment:${index + 1}`,
      startMs,
      endMs,
      verbatim,
      display: verbatim,
      search: normalizeSearchText(verbatim),
      confidence: clampConfidence(sentence.confidence),
    };
  });
  const transcriptDigest = createHash("sha256")
    .update(JSON.stringify({ schemaVersion: 1, sourceId, segments }))
    .digest("hex")
    .slice(0, 24);

  return {
    source: {
      schemaVersion: 1,
      sourceId,
      platform: "youtube",
      platformId: options.metadata.platformId,
      channel: {
        id: options.metadata.channelId,
        name: options.metadata.channelName,
        category: "creator-official",
      },
      title: options.metadata.title,
      description: options.metadata.description,
      canonicalUrl: options.metadata.canonicalUrl,
      publishedAt: options.metadata.publishedAt,
      durationMs: options.metadata.durationMs,
      availability: "available",
      lastCheckedAt: options.generatedAt,
      mediaFingerprint: null,
      provenance: {
        allowListId: ALLOW_LIST_ID,
        discoveredAt: options.generatedAt,
        runId: options.runId,
      },
    },
    transcript: {
      schemaVersion: 1,
      transcriptId: `t1_${transcriptDigest}`,
      sourceId,
      language: "en",
      pipeline: {
        modelId: MODEL_ID,
        modelRevision: MODEL_REVISION,
        runtime: options.runtime,
        generatedAt: options.generatedAt,
      },
      segments,
    },
  };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeWhitespace(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return normalizeWhitespace(value).normalize("NFKC").toLocaleLowerCase("en-US");
}

function requireTool(name: string): string {
  const path = Bun.which(name);
  if (!path) throw new Error(`required tool not found on PATH: ${name}`);
  return resolve(path);
}

async function resolveTooling(): Promise<{ paths: ToolPaths; versions: ToolVersions }> {
  const paths: ToolPaths = {
    deno: requireTool("deno"),
    ffmpeg: requireTool("ffmpeg"),
    ffprobe: requireTool("ffprobe"),
    parakeet: requireTool("parakeet-mlx"),
    ytDlp: await resolveYtDlpPath(),
  };
  await access(MODEL_SNAPSHOT);
  const [deno, ffmpeg, parakeet, parakeetVersion, ytDlp] = await Promise.all([
    captureCommand([paths.deno, "--version"]),
    captureCommand([paths.ffmpeg, "-version"]),
    captureCommand([paths.parakeet, "--help"]),
    readParakeetVersion(paths.parakeet),
    captureCommand([paths.ytDlp, "--version"]),
  ]);
  return {
    paths,
    versions: {
      deno: firstLine(deno.stdout),
      ffmpeg: firstLine(ffmpeg.stdout),
      parakeet: parakeet.stdout.includes("Transcribe audio files")
        ? `parakeet-mlx ${parakeetVersion}`
        : "unknown",
      ytDlp: firstLine(ytDlp.stdout),
    },
  };
}

async function resolveYtDlpPath(): Promise<string> {
  if (!(await exists(PINNED_YT_DLP_PATH))) return requireTool("yt-dlp");
  const digest = createHash("sha256")
    .update(await readFile(PINNED_YT_DLP_PATH))
    .digest("hex");
  if (digest !== YT_DLP_MACOS_SHA256) {
    throw new Error(`pinned yt-dlp SHA-256 mismatch: ${digest}`);
  }
  return PINNED_YT_DLP_PATH;
}

async function readParakeetVersion(executablePath: string): Promise<string> {
  try {
    const firstExecutableLine = firstLine(await readFile(executablePath, "utf8"));
    if (!firstExecutableLine.startsWith("#!")) return "version-unavailable";
    const pythonPath = firstExecutableLine.slice(2);
    const result = await captureCommand([
      pythonPath,
      "-c",
      "from importlib.metadata import version; print(version('parakeet-mlx'))",
    ]);
    return firstLine(result.stdout);
  } catch {
    return "version-unavailable";
  }
}

function firstLine(value: string): string {
  return value.split("\n")[0]?.trim() ?? "unknown";
}

function ytDlpSafetyArguments(paths: ToolPaths): string[] {
  return [
    "--ignore-config",
    "--no-plugin-dirs",
    "--no-js-runtimes",
    "--js-runtimes",
    `deno:${paths.deno}`,
    "--no-remote-components",
    "--no-update",
  ];
}

async function discoverVideos(channelUrl: string, paths: ToolPaths): Promise<DiscoveredVideo[]> {
  const command = [
    paths.ytDlp,
    ...ytDlpSafetyArguments(paths),
    "--flat-playlist",
    "--dump-single-json",
    channelUrl,
  ];
  return parseDiscoveryPayload(JSON.parse((await captureCommand(command)).stdout));
}

async function fetchMetadata(platformId: string, paths: ToolPaths): Promise<SourceMetadata> {
  const url = `https://www.youtube.com/watch?v=${platformId}`;
  const command = [
    paths.ytDlp,
    ...ytDlpSafetyArguments(paths),
    "--no-playlist",
    "--dump-single-json",
    url,
  ];
  return parseSourceMetadata(JSON.parse((await captureCommand(command)).stdout));
}

async function downloadAudio(platformId: string, workDirectory: string, paths: ToolPaths): Promise<string> {
  const existing = await findMediaFile(workDirectory);
  if (existing) {
    await verifyDownloadedAudioLanguage(workDirectory);
    return existing;
  }
  const url = `https://www.youtube.com/watch?v=${platformId}`;
  const command = [
    paths.ytDlp,
    ...ytDlpSafetyArguments(paths),
    "--no-playlist",
    "--format",
    YOUTUBE_ORIGINAL_AUDIO_FORMAT,
    "--write-info-json",
    "--output",
    join(workDirectory, "source.%(ext)s"),
    url,
  ];
  await runStreamingCommand(command, workDirectory);
  const downloaded = await findMediaFile(workDirectory);
  if (!downloaded) throw new Error("yt-dlp completed without a downloaded audio file");
  await verifyDownloadedAudioLanguage(workDirectory);
  return downloaded;
}

async function verifyDownloadedAudioLanguage(workDirectory: string): Promise<void> {
  const metadataPath = join(workDirectory, "source.info.json");
  const metadata: unknown = JSON.parse(await readFile(metadataPath, "utf8"));
  parseDownloadedAudioLanguage(metadata);
}

async function findMediaFile(directory: string): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true });
  const match = entries.find((entry) =>
    entry.isFile() && /^source\.(?:aac|flac|m4a|mp3|ogg|opus|wav|webm)$/i.test(entry.name)
  );
  return match ? join(directory, match.name) : null;
}

async function normalizeAudio(mediaPath: string, workDirectory: string, paths: ToolPaths): Promise<string> {
  const normalizedPath = join(workDirectory, "normalized.wav");
  if (await exists(normalizedPath)) return normalizedPath;
  await runStreamingCommand([
    paths.ffmpeg,
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    mediaPath,
    "-map_metadata",
    "-1",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    normalizedPath,
  ], workDirectory);
  return normalizedPath;
}

async function verifyAudio(path: string, expectedDurationMs: number, paths: ToolPaths): Promise<void> {
  const result = await captureCommand([
    paths.ffprobe,
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    path,
  ]);
  const payload: unknown = JSON.parse(result.stdout);
  if (!isObject(payload) || !isObject(payload.format)) throw new Error("ffprobe returned invalid JSON");
  const duration = Number(payload.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("ffprobe returned invalid audio duration");
  const driftMs = Math.abs(duration * 1_000 - expectedDurationMs);
  if (driftMs > 5_000) throw new Error(`audio duration differs from metadata by ${Math.round(driftMs)} ms`);
}

async function transcribeAudio(
  audioPath: string,
  workDirectory: string,
  paths: ToolPaths,
): Promise<ParakeetOutput> {
  const outputDirectory = join(workDirectory, "parakeet");
  const outputPath = join(outputDirectory, `${basename(audioPath, ".wav")}.json`);
  if (!(await exists(outputPath))) {
    await mkdir(outputDirectory, { recursive: true });
    await runStreamingCommand([
      paths.parakeet,
      audioPath,
      "--model",
      MODEL_SNAPSHOT,
      "--output-dir",
      outputDirectory,
      "--output-format",
      "json",
      "--decoding",
      "beam",
      "--chunk-duration",
      "1200",
      "--overlap-duration",
      "15",
      "--local-attention",
    ], workDirectory, {
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
    });
  }
  return parseParakeetOutput(JSON.parse(await readFile(outputPath, "utf8")));
}

async function stageAndValidateRecords(
  source: CanonicalSource,
  transcript: CanonicalTranscript,
  workDirectory: string,
): Promise<{ sourcePath: string; transcriptPath: string }> {
  const shadowCorpus = join(workDirectory, "validation-corpus");
  await rm(shadowCorpus, { recursive: true, force: true });
  await cp(join(REPOSITORY_ROOT, "corpus"), shadowCorpus, { recursive: true });
  const shadowSourcePath = join(shadowCorpus, "sources", "youtube", `${source.platformId}.json`);
  const shadowTranscriptPath = join(shadowCorpus, "transcripts", "youtube", `${source.platformId}.json`);
  await writeJson(shadowSourcePath, source);
  await writeJson(shadowTranscriptPath, transcript);
  const shadowValidation = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir: shadowCorpus });
  if (!shadowValidation.ok) {
    throw new Error(`candidate corpus validation failed:\n${shadowValidation.errors.join("\n")}`);
  }

  const sourcePath = join(REPOSITORY_ROOT, "corpus", "sources", "youtube", `${source.platformId}.json`);
  const transcriptPath = join(REPOSITORY_ROOT, "corpus", "transcripts", "youtube", `${source.platformId}.json`);
  const sourceExisted = await exists(sourcePath);
  const transcriptExisted = await exists(transcriptPath);
  try {
    if (!sourceExisted) await writeJsonAtomically(sourcePath, source);
    if (!transcriptExisted) await writeJsonAtomically(transcriptPath, transcript);
    const canonicalValidation = await validateCorpus({ rootDir: REPOSITORY_ROOT });
    if (!canonicalValidation.ok) {
      throw new Error(`canonical corpus validation failed:\n${canonicalValidation.errors.join("\n")}`);
    }
  } catch (error) {
    if (!sourceExisted) await rm(sourcePath, { force: true });
    if (!transcriptExisted) await rm(transcriptPath, { force: true });
    throw error;
  }
  return { sourcePath, transcriptPath };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeJson(temporaryPath, value);
  await rename(temporaryPath, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function captureCommand(
  command: string[],
  cwd = REPOSITORY_ROOT,
  extraEnvironment: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string }> {
  const subprocess = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command[0]} exited ${exitCode}: ${stderr.trim()}`);
  }
  return { stdout, stderr };
}

async function runStreamingCommand(
  command: string[],
  cwd: string,
  extraEnvironment: Record<string, string> = {},
): Promise<void> {
  console.log(`$ ${command.map(quoteArgument).join(" ")}`);
  const subprocess = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await subprocess.exited;
  if (exitCode !== 0) throw new Error(`${command[0]} exited ${exitCode}`);
}

function quoteArgument(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

async function processVideo(options: {
  platformId: string;
  runId: string;
  paths: ToolPaths;
  versions: ToolVersions;
}): Promise<BatchResult> {
  const transcriptPath = join(
    REPOSITORY_ROOT,
    "corpus",
    "transcripts",
    "youtube",
    `${options.platformId}.json`,
  );
  if (await exists(transcriptPath)) {
    return { platformId: options.platformId, status: "skipped", transcriptPath };
  }
  const workDirectory = join(REPOSITORY_ROOT, "artifacts", "ingestion", "work", options.platformId);
  await mkdir(workDirectory, { recursive: true });
  try {
    const metadata = await fetchMetadata(options.platformId, options.paths);
    const mediaPath = await downloadAudio(options.platformId, workDirectory, options.paths);
    await verifyAudio(mediaPath, metadata.durationMs, options.paths);
    const normalizedPath = await normalizeAudio(mediaPath, workDirectory, options.paths);
    await verifyAudio(normalizedPath, metadata.durationMs, options.paths);
    const parakeet = await transcribeAudio(normalizedPath, workDirectory, options.paths);
    const generatedAt = new Date().toISOString();
    const records = buildCanonicalRecords({
      metadata,
      parakeet,
      generatedAt,
      runId: options.runId,
      runtime: options.versions.parakeet,
    });
    const paths = await stageAndValidateRecords(records.source, records.transcript, workDirectory);
    await rm(workDirectory, { recursive: true, force: true });
    return { platformId: options.platformId, status: "completed", ...paths };
  } catch (error) {
    return {
      platformId: options.platformId,
      status: "failed",
      workDirectory,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function listCommittedTranscriptIds(): Promise<Set<string>> {
  const directory = join(REPOSITORY_ROOT, "corpus", "transcripts", "youtube");
  return new Set(
    (await readdir(directory))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5)),
  );
}

async function writeManifest(path: string, manifest: RunManifest): Promise<void> {
  await writeJsonAtomically(path, manifest);
}

function printHelp(): void {
  console.log(`Usage: bun run ingest:backfill -- [options]\n\nOptions:\n  --limit <1-10>       Maximum videos in this run (default: 10)\n  --video-id <id|url>  Process an approved video; repeat as needed\n  --dry-run            Discover and print the next batch without downloads\n  --help               Show this help`);
}

async function main(): Promise<void> {
  const parsed = parseCliArguments(process.argv.slice(2));
  if (parsed.kind === "help") {
    printHelp();
    return;
  }
  const { paths, versions } = await resolveTooling();
  const committed = await listCommittedTranscriptIds();
  const discovered = parsed.videoIds.length > 0
    ? parsed.videoIds.map((platformId) => ({ platformId, title: platformId }))
    : await discoverVideos(parsed.channelUrl, paths);
  const selected = discovered.filter((video) => !committed.has(video.platformId)).slice(0, parsed.limit);
  console.log(JSON.stringify({ selected, alreadyCommitted: committed.size }, null, 2));
  if (parsed.dryRun || selected.length === 0) return;

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const manifestPath = join(REPOSITORY_ROOT, "artifacts", "ingestion", "runs", `${runId}.json`);
  const manifest: RunManifest = {
    schemaVersion: 1,
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    channelUrl: parsed.channelUrl,
    requestedLimit: parsed.limit,
    selectedVideoIds: selected.map((video) => video.platformId),
    pipelineVersion: PIPELINE_VERSION,
    tools: versions,
    model: { id: MODEL_ID, revision: MODEL_REVISION, snapshot: MODEL_SNAPSHOT },
    results: [],
  };
  await writeManifest(manifestPath, manifest);

  for (const video of selected) {
    console.log(`\nProcessing ${video.platformId}: ${video.title}`);
    const result = await processVideo({ platformId: video.platformId, runId, paths, versions });
    manifest.results.push(result);
    await writeManifest(manifestPath, manifest);
    if (result.status === "failed") {
      console.error(`Failed ${video.platformId}: ${result.error}`);
      break;
    }
  }
  manifest.finishedAt = new Date().toISOString();
  await writeManifest(manifestPath, manifest);
  const failures = manifest.results.filter((result) => result.status === "failed");
  if (failures.length > 0) process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}
