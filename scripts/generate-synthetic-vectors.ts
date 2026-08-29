import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SYNTHETIC_VECTOR_DIMENSIONS = 384;
export const SUPPORTED_SYNTHETIC_VECTOR_COUNTS = [
  25_000, 100_000, 225_000, 450_000,
] as const;

const BYTES_PER_FLOAT32 = 4;
const BYTES_PER_VECTOR = SYNTHETIC_VECTOR_DIMENSIONS * BYTES_PER_FLOAT32;
const VECTORS_PER_SHARD = 8_192;
const VECTORS_PER_BATCH = 64;
const MAX_TEST_VECTOR_COUNT = 1_024;
const GENERATOR_VERSION = 1;
const MANIFEST_SCHEMA_VERSION = 1;
export const CORPUS_SCHEMA_ID = "prime-said-corpus@1";
const UINT32_RANGE = 0x1_0000_0000;

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const SYNTHETIC_VECTOR_OUTPUT_ROOT = join(
  repositoryRoot,
  "corpus",
  "generated",
  "embeddings",
  "synthetic",
);

export type SupportedSyntheticVectorCount =
  (typeof SUPPORTED_SYNTHETIC_VECTOR_COUNTS)[number];

export interface SyntheticVectorShardManifest {
  path: string;
  firstRow: number;
  rowCount: number;
  byteLength: number;
  sha256: string;
}

export interface SyntheticVectorManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  type: "prime-said.synthetic-vector-corpus";
  provenance: {
    corpusSchema: typeof CORPUS_SCHEMA_ID;
    sourceCommit: string;
    sourceState: "clean" | "dirty";
  };
  generator: {
    version: typeof GENERATOR_VERSION;
    prng: "mulberry32";
    seed: string;
    seedSha256: string;
    seedDerivation: "sha256-first-u32le";
  };
  layout: {
    rowCount: number;
    dimensions: typeof SYNTHETIC_VECTOR_DIMENSIONS;
    dataType: "float32";
    byteOrder: "little-endian";
    order: "row-major";
    bytesPerRow: typeof BYTES_PER_VECTOR;
    normalization: "l2";
    similarity: "dot-product";
    distribution: "normalized-uniform-cube";
  };
  corpus: {
    byteLength: number;
    sha256: string;
  };
  shards: SyntheticVectorShardManifest[];
}

export interface GenerateSyntheticVectorCorpusOptions {
  vectorCount: SupportedSyntheticVectorCount;
  seed: string;
}

/**
 * Kept separate from public options so the CLI cannot expose smaller, misleading
 * benchmark sizes or write generated vectors outside the ignored artifact tree.
 */
export interface SyntheticVectorTestOverrides {
  vectorCount: number;
  outputRoot: string;
  vectorsPerShard?: number;
  vectorsPerBatch?: number;
}

export interface GeneratedSyntheticVectorCorpus {
  directory: string;
  manifestPath: string;
  manifest: SyntheticVectorManifest;
}

export type ParsedSyntheticVectorCliArguments =
  | { help: true }
  | {
      help: false;
      vectorCount: SupportedSyntheticVectorCount;
      seed: string;
    };

const supportedVectorCountSet = new Set<number>(
  SUPPORTED_SYNTHETIC_VECTOR_COUNTS,
);

function formatSupportedCounts(): string {
  return SUPPORTED_SYNTHETIC_VECTOR_COUNTS.map((count) =>
    count.toLocaleString("en-US"),
  ).join(", ");
}

function normalizeSeed(seed: string): string {
  if (typeof seed !== "string") {
    throw new Error("Seed must be a string.");
  }
  const byteLength = Buffer.byteLength(seed, "utf8");

  if (byteLength === 0) {
    throw new Error("Seed must not be empty.");
  }
  if (byteLength > 256) {
    throw new Error("Seed must be no more than 256 UTF-8 bytes.");
  }

  return seed;
}

function parseVectorCount(value: string): SupportedSyntheticVectorCount {
  const shorthand = value.toLowerCase();
  const shorthandCounts: Record<string, SupportedSyntheticVectorCount> = {
    "25k": 25_000,
    "100k": 100_000,
    "225k": 225_000,
    "450k": 450_000,
  };
  const parsed =
    shorthandCounts[shorthand] ?? Number(value.replaceAll("_", ""));

  if (!Number.isSafeInteger(parsed) || !supportedVectorCountSet.has(parsed)) {
    throw new Error(
      `Unsupported vector count ${JSON.stringify(value)}. Choose exactly one of: ${formatSupportedCounts()}.`,
    );
  }

  return parsed as SupportedSyntheticVectorCount;
}

function takeFlagValue(
  args: string[],
  index: number,
  inlineValue: string | undefined,
  flag: string,
): { value: string; nextIndex: number } {
  if (inlineValue !== undefined) {
    if (inlineValue.length === 0) {
      throw new Error(`${flag} requires a value.`);
    }
    return { value: inlineValue, nextIndex: index };
  }

  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return { value, nextIndex: index + 1 };
}

export function parseSyntheticVectorCliArguments(
  args: string[],
): ParsedSyntheticVectorCliArguments {
  let countValue: string | undefined;
  let seedValue: string | undefined;
  let dimensionsValue: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      if (args.length !== 1) {
        throw new Error("--help cannot be combined with other arguments.");
      }
      return { help: true };
    }

    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    const inlineValue =
      equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);

    if (flag === "--count" || flag === "--size") {
      if (countValue !== undefined) {
        throw new Error("Vector count may be declared only once.");
      }
      const taken = takeFlagValue(args, index, inlineValue, flag);
      countValue = taken.value;
      index = taken.nextIndex;
      continue;
    }

    if (flag === "--seed") {
      if (seedValue !== undefined) {
        throw new Error("Seed may be declared only once.");
      }
      const taken = takeFlagValue(args, index, inlineValue, flag);
      seedValue = taken.value;
      index = taken.nextIndex;
      continue;
    }

    if (flag === "--dimensions") {
      if (dimensionsValue !== undefined) {
        throw new Error("Dimensions may be declared only once.");
      }
      const taken = takeFlagValue(args, index, inlineValue, flag);
      dimensionsValue = taken.value;
      index = taken.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument ${JSON.stringify(argument)}.`);
  }

  if (countValue === undefined) {
    throw new Error("Missing required --count argument.");
  }
  if (seedValue === undefined) {
    throw new Error("Missing required --seed argument.");
  }
  if (
    dimensionsValue !== undefined &&
    Number(dimensionsValue) !== SYNTHETIC_VECTOR_DIMENSIONS
  ) {
    throw new Error(
      `Synthetic benchmark dimensions are fixed at ${SYNTHETIC_VECTOR_DIMENSIONS}.`,
    );
  }

  return {
    help: false,
    vectorCount: parseVectorCount(countValue),
    seed: normalizeSeed(seedValue),
  };
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
}

function resolveGenerationSettings(
  options: GenerateSyntheticVectorCorpusOptions,
  testOverrides: SyntheticVectorTestOverrides | undefined,
): {
  vectorCount: number;
  seed: string;
  outputRoot: string;
  vectorsPerShard: number;
  vectorsPerBatch: number;
} {
  if (!supportedVectorCountSet.has(options.vectorCount)) {
    throw new Error(
      `Unsupported vector count ${options.vectorCount}. Choose exactly one of: ${formatSupportedCounts()}.`,
    );
  }

  const seed = normalizeSeed(options.seed);
  if (testOverrides === undefined) {
    return {
      vectorCount: options.vectorCount,
      seed,
      outputRoot: SYNTHETIC_VECTOR_OUTPUT_ROOT,
      vectorsPerShard: VECTORS_PER_SHARD,
      vectorsPerBatch: VECTORS_PER_BATCH,
    };
  }

  validatePositiveInteger(testOverrides.vectorCount, "Test vector count");
  if (testOverrides.vectorCount > MAX_TEST_VECTOR_COUNT) {
    throw new Error(
      `Test vector count must not exceed ${MAX_TEST_VECTOR_COUNT}.`,
    );
  }

  const vectorsPerShard =
    testOverrides.vectorsPerShard ??
    Math.min(VECTORS_PER_SHARD, testOverrides.vectorCount);
  const vectorsPerBatch =
    testOverrides.vectorsPerBatch ??
    Math.min(VECTORS_PER_BATCH, testOverrides.vectorCount);
  validatePositiveInteger(vectorsPerShard, "Test vectors per shard");
  validatePositiveInteger(vectorsPerBatch, "Test vectors per batch");
  if (vectorsPerShard > MAX_TEST_VECTOR_COUNT) {
    throw new Error(
      `Test vectors per shard must not exceed ${MAX_TEST_VECTOR_COUNT}.`,
    );
  }
  if (vectorsPerBatch > MAX_TEST_VECTOR_COUNT) {
    throw new Error(
      `Test vectors per batch must not exceed ${MAX_TEST_VECTOR_COUNT}.`,
    );
  }
  if (vectorsPerBatch > vectorsPerShard) {
    throw new Error(
      "Test vectors per batch must not exceed vectors per shard.",
    );
  }

  return {
    vectorCount: testOverrides.vectorCount,
    seed,
    outputRoot: testOverrides.outputRoot,
    vectorsPerShard,
    vectorsPerBatch,
  };
}

class Mulberry32 {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  next(): number {
    this.#state = (this.#state + 0x6d2b_79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }
}

function createPrng(seed: string): {
  prng: Mulberry32;
  seedSha256: string;
} {
  const digest = createHash("sha256").update(seed, "utf8").digest();
  return {
    prng: new Mulberry32(digest.readUInt32LE(0)),
    seedSha256: digest.toString("hex"),
  };
}

function readRepositoryProvenance(): SyntheticVectorManifest["provenance"] {
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error(`Cannot identify a full source commit: ${sourceCommit}`);
  }

  const status = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  return {
    corpusSchema: CORPUS_SCHEMA_ID,
    sourceCommit,
    sourceState: status.length === 0 ? "clean" : "dirty",
  };
}

function fillVectorBatch(
  bytes: Uint8Array,
  rowCount: number,
  prng: Mulberry32,
  scratchVector: Float64Array,
): number {
  const byteLength = rowCount * BYTES_PER_VECTOR;
  const view = new DataView(bytes.buffer, bytes.byteOffset, byteLength);
  let byteOffset = 0;

  for (let row = 0; row < rowCount; row += 1) {
    let squaredNorm = 0;
    for (
      let dimension = 0;
      dimension < SYNTHETIC_VECTOR_DIMENSIONS;
      dimension += 1
    ) {
      const value = prng.next() * 2 - 1;
      scratchVector[dimension] = value;
      squaredNorm += value * value;
    }

    const inverseNorm = 1 / Math.sqrt(squaredNorm);
    for (
      let dimension = 0;
      dimension < SYNTHETIC_VECTOR_DIMENSIONS;
      dimension += 1
    ) {
      view.setFloat32(
        byteOffset,
        Math.fround(scratchVector[dimension] * inverseNorm),
        true,
      );
      byteOffset += BYTES_PER_FLOAT32;
    }
  }

  return byteLength;
}

async function writeAll(
  file: FileHandle,
  bytes: Uint8Array,
  byteLength: number,
): Promise<void> {
  let offset = 0;
  while (offset < byteLength) {
    const { bytesWritten } = await file.write(
      bytes,
      offset,
      byteLength - offset,
      null,
    );
    if (bytesWritten === 0) {
      throw new Error("Vector shard write made no progress.");
    }
    offset += bytesWritten;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code === "ENOENT"
  );
}

async function assertPathDoesNotExist(path: string): Promise<void> {
  try {
    await access(path);
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw error;
  }
  throw new Error(
    `Refusing to overwrite existing synthetic corpus directory: ${path}`,
  );
}

export async function generateSyntheticVectorCorpus(
  options: GenerateSyntheticVectorCorpusOptions,
  testOverrides?: SyntheticVectorTestOverrides,
): Promise<GeneratedSyntheticVectorCorpus> {
  const settings = resolveGenerationSettings(options, testOverrides);
  const { prng, seedSha256 } = createPrng(settings.seed);
  const directoryName = [
    "f32",
    `${settings.vectorCount}x${SYNTHETIC_VECTOR_DIMENSIONS}`,
    seedSha256,
  ].join("-");
  const finalDirectory = join(settings.outputRoot, directoryName);

  await mkdir(settings.outputRoot, { recursive: true });
  await assertPathDoesNotExist(finalDirectory);
  const stagingDirectory = await mkdtemp(
    join(settings.outputRoot, ".generate-"),
  );
  const corpusHash = createHash("sha256");
  const shards: SyntheticVectorShardManifest[] = [];
  const batchBytes = new Uint8Array(
    Math.min(settings.vectorsPerBatch, settings.vectorCount) * BYTES_PER_VECTOR,
  );
  const scratchVector = new Float64Array(SYNTHETIC_VECTOR_DIMENSIONS);

  try {
    let firstRow = 0;
    while (firstRow < settings.vectorCount) {
      const shardIndex = shards.length;
      const shardRowCount = Math.min(
        settings.vectorsPerShard,
        settings.vectorCount - firstRow,
      );
      const shardName = `vectors-${String(shardIndex).padStart(5, "0")}.f32le`;
      const shardPath = join(stagingDirectory, shardName);
      const shardHash = createHash("sha256");
      const file = await open(shardPath, "wx");
      let shardRowsWritten = 0;

      try {
        while (shardRowsWritten < shardRowCount) {
          const batchRowCount = Math.min(
            settings.vectorsPerBatch,
            shardRowCount - shardRowsWritten,
          );
          const byteLength = fillVectorBatch(
            batchBytes,
            batchRowCount,
            prng,
            scratchVector,
          );
          const writtenBytes = batchBytes.subarray(0, byteLength);
          await writeAll(file, writtenBytes, byteLength);
          shardHash.update(writtenBytes);
          corpusHash.update(writtenBytes);
          shardRowsWritten += batchRowCount;
        }
      } finally {
        await file.close();
      }

      shards.push({
        path: shardName,
        firstRow,
        rowCount: shardRowCount,
        byteLength: shardRowCount * BYTES_PER_VECTOR,
        sha256: shardHash.digest("hex"),
      });
      firstRow += shardRowCount;
    }

    const manifest: SyntheticVectorManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      type: "prime-said.synthetic-vector-corpus",
      provenance: readRepositoryProvenance(),
      generator: {
        version: GENERATOR_VERSION,
        prng: "mulberry32",
        seed: settings.seed,
        seedSha256,
        seedDerivation: "sha256-first-u32le",
      },
      layout: {
        rowCount: settings.vectorCount,
        dimensions: SYNTHETIC_VECTOR_DIMENSIONS,
        dataType: "float32",
        byteOrder: "little-endian",
        order: "row-major",
        bytesPerRow: BYTES_PER_VECTOR,
        normalization: "l2",
        similarity: "dot-product",
        distribution: "normalized-uniform-cube",
      },
      corpus: {
        byteLength: settings.vectorCount * BYTES_PER_VECTOR,
        sha256: corpusHash.digest("hex"),
      },
      shards,
    };
    const manifestPath = join(stagingDirectory, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(stagingDirectory, finalDirectory);

    return {
      directory: finalDirectory,
      manifestPath: join(finalDirectory, "manifest.json"),
      manifest,
    };
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

export const SYNTHETIC_VECTOR_CLI_USAGE = `Usage:
  bun scripts/generate-synthetic-vectors.ts --count <25k|100k|225k|450k> --seed <seed> [--dimensions 384]

The generator writes deterministic 384-dimensional float32 shards and a manifest
under corpus/generated/embeddings/synthetic/. That directory is ignored by Git.`;

async function runCli(): Promise<void> {
  const parsed = parseSyntheticVectorCliArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${SYNTHETIC_VECTOR_CLI_USAGE}\n`);
    return;
  }

  const generated = await generateSyntheticVectorCorpus({
    vectorCount: parsed.vectorCount,
    seed: parsed.seed,
  });
  process.stdout.write(
    `Generated ${generated.manifest.layout.rowCount.toLocaleString("en-US")} ` +
      `vectors in ${generated.manifest.shards.length} shard(s).\n` +
      `Manifest: ${generated.manifestPath}\n`,
  );
}

const isMainModule = Boolean(
  (import.meta as ImportMeta & { main?: boolean }).main,
);
if (isMainModule) {
  try {
    await runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Synthetic vector generation failed: ${message}\n`);
    process.stderr.write(`${SYNTHETIC_VECTOR_CLI_USAGE}\n`);
    process.exitCode = 1;
  }
}
