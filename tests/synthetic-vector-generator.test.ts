import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "bun:test";

import {
  CORPUS_SCHEMA_ID,
  SUPPORTED_SYNTHETIC_VECTOR_COUNTS,
  SYNTHETIC_VECTOR_DIMENSIONS,
  SYNTHETIC_VECTOR_OUTPUT_ROOT,
  generateSyntheticVectorCorpus,
  parseSyntheticVectorCliArguments,
  type SupportedSyntheticVectorCount,
  type SyntheticVectorManifest,
} from "../scripts/generate-synthetic-vectors";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "prime-said-vectors-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function readCorpusFiles(
  directory: string,
): Promise<Map<string, Uint8Array>> {
  const files = (await readdir(directory)).sort();
  const contents = new Map<string, Uint8Array>();
  for (const file of files) {
    contents.set(file, await readFile(join(directory, file)));
  }
  return contents;
}

async function expectRejectionContaining(
  promise: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  let rejection: unknown;
  try {
    await promise;
  } catch (error) {
    rejection = error;
  }

  expect(rejection).toBeInstanceOf(Error);
  if (!(rejection instanceof Error)) {
    throw new Error("Expected the operation to reject with an Error.");
  }
  expect(rejection.message).toContain(expectedMessage);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("synthetic vector CLI constraints", () => {
  test("accepts exactly the four benchmark sizes and fixes dimensions at 384", () => {
    const spellings = ["25k", "100000", "225_000", "450k"];

    for (const [index, spelling] of spellings.entries()) {
      const parsed = parseSyntheticVectorCliArguments([
        "--count",
        spelling,
        "--seed",
        "declared-seed",
        "--dimensions",
        "384",
      ]);
      expect(parsed.help).toBe(false);
      if (!parsed.help) {
        expect(parsed.vectorCount).toBe(
          SUPPORTED_SYNTHETIC_VECTOR_COUNTS[index],
        );
        expect(parsed.seed).toBe("declared-seed");
      }
    }
  });

  test("rejects unsupported sizes, dimensions, and an undeclared seed", () => {
    expect(() =>
      parseSyntheticVectorCliArguments(["--count", "24999", "--seed", "x"]),
    ).toThrow("Unsupported vector count");
    expect(() =>
      parseSyntheticVectorCliArguments([
        "--count",
        "25k",
        "--seed",
        "x",
        "--dimensions",
        "768",
      ]),
    ).toThrow("fixed at 384");
    expect(() => parseSyntheticVectorCliArguments(["--count", "25k"])).toThrow(
      "Missing required --seed",
    );
    expect(() =>
      parseSyntheticVectorCliArguments([
        "--count",
        "25k",
        "--seed",
        "x",
        "--output-root",
        "/tmp",
      ]),
    ).toThrow("Unknown argument");
  });

  test("keeps public output in the ignored generated-embeddings tree", async () => {
    const relativeOutputRoot = relative(
      repositoryRoot,
      SYNTHETIC_VECTOR_OUTPUT_ROOT,
    ).replaceAll("\\", "/");
    expect(relativeOutputRoot).toBe("corpus/generated/embeddings/synthetic");

    const ignoreRules = (
      await readFile(join(repositoryRoot, ".gitignore"), "utf8")
    )
      .split(/\r?\n/u)
      .filter(Boolean);
    expect(ignoreRules).toContain("corpus/generated/");
  });
});

describe("synthetic vector generation", () => {
  test("is byte-for-byte deterministic for a declared seed", async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const first = await generateSyntheticVectorCorpus(
      { vectorCount: 25_000, seed: "fixture-seed" },
      {
        vectorCount: 3,
        outputRoot: join(temporaryDirectory, "first"),
        vectorsPerShard: 2,
        vectorsPerBatch: 1,
      },
    );
    const second = await generateSyntheticVectorCorpus(
      { vectorCount: 25_000, seed: "fixture-seed" },
      {
        vectorCount: 3,
        outputRoot: join(temporaryDirectory, "second"),
        vectorsPerShard: 2,
        vectorsPerBatch: 2,
      },
    );
    const differentlySharded = await generateSyntheticVectorCorpus(
      { vectorCount: 25_000, seed: "fixture-seed" },
      {
        vectorCount: 3,
        outputRoot: join(temporaryDirectory, "third"),
        vectorsPerShard: 1,
        vectorsPerBatch: 1,
      },
    );

    const firstFiles = await readCorpusFiles(first.directory);
    const secondFiles = await readCorpusFiles(second.directory);
    expect(first.manifest.corpus.sha256).toBe(
      "31384664a584a226b2ed69d13b6547e2da8d4cc0fbe704f28a115e0746e0833f",
    );
    expect(differentlySharded.manifest.corpus.sha256).toBe(
      first.manifest.corpus.sha256,
    );
    expect([...firstFiles.keys()]).toEqual([...secondFiles.keys()]);
    for (const [name, firstBytes] of firstFiles) {
      const secondBytes = secondFiles.get(name);
      expect(secondBytes).toBeDefined();
      if (secondBytes === undefined) {
        throw new Error(`Missing generated file ${name} in second corpus.`);
      }
      expect(firstBytes).toEqual(secondBytes);
    }
  });

  test("writes a benchmark-ready, self-verifying streaming layout", async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const generated = await generateSyntheticVectorCorpus(
      { vectorCount: 100_000, seed: "manifest-seed-🧪" },
      {
        vectorCount: 3,
        outputRoot: temporaryDirectory,
        vectorsPerShard: 2,
        vectorsPerBatch: 1,
      },
    );
    const manifest = JSON.parse(
      await readFile(generated.manifestPath, "utf8"),
    ) as SyntheticVectorManifest;

    expect(manifest.provenance.corpusSchema).toBe(CORPUS_SCHEMA_ID);
    expect(manifest.provenance.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(["clean", "dirty"]).toContain(manifest.provenance.sourceState);
    expect(manifest.generator.seed).toBe("manifest-seed-🧪");
    expect(manifest.generator.seedSha256).toBe(
      createHash("sha256").update("manifest-seed-🧪", "utf8").digest("hex"),
    );
    expect(manifest.layout).toEqual({
      rowCount: 3,
      dimensions: SYNTHETIC_VECTOR_DIMENSIONS,
      dataType: "float32",
      byteOrder: "little-endian",
      order: "row-major",
      bytesPerRow: SYNTHETIC_VECTOR_DIMENSIONS * 4,
      normalization: "l2",
      similarity: "dot-product",
      distribution: "normalized-uniform-cube",
    });
    expect(manifest.shards.map((shard) => shard.rowCount)).toEqual([2, 1]);
    expect(manifest.shards.map((shard) => shard.firstRow)).toEqual([0, 2]);
    expect(manifest.corpus.byteLength).toBe(
      3 * SYNTHETIC_VECTOR_DIMENSIONS * 4,
    );

    const corpusHash = createHash("sha256");
    for (const shard of manifest.shards) {
      const bytes = await readFile(join(generated.directory, shard.path));
      expect(bytes.byteLength).toBe(shard.byteLength);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        shard.sha256,
      );
      corpusHash.update(bytes);
    }
    expect(corpusHash.digest("hex")).toBe(manifest.corpus.sha256);

    const firstShard = await readFile(
      join(generated.directory, manifest.shards[0].path),
    );
    const floats = new DataView(
      firstShard.buffer,
      firstShard.byteOffset,
      firstShard.byteLength,
    );
    for (let row = 0; row < 2; row += 1) {
      let squaredNorm = 0;
      for (
        let dimension = 0;
        dimension < SYNTHETIC_VECTOR_DIMENSIONS;
        dimension += 1
      ) {
        const value = floats.getFloat32(
          (row * SYNTHETIC_VECTOR_DIMENSIONS + dimension) * 4,
          true,
        );
        squaredNorm += value * value;
      }
      expect(Math.sqrt(squaredNorm)).toBeCloseTo(1, 6);
    }
  });

  test("changes the corpus bytes when the seed changes", async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const first = await generateSyntheticVectorCorpus(
      { vectorCount: 225_000, seed: "seed-a" },
      { vectorCount: 2, outputRoot: join(temporaryDirectory, "a") },
    );
    const second = await generateSyntheticVectorCorpus(
      { vectorCount: 225_000, seed: "seed-b" },
      { vectorCount: 2, outputRoot: join(temporaryDirectory, "b") },
    );

    expect(first.manifest.corpus.sha256).not.toBe(
      second.manifest.corpus.sha256,
    );
  });

  test("keeps the internal override small and the requested size public", async () => {
    const temporaryDirectory = await makeTemporaryDirectory();

    await expectRejectionContaining(
      generateSyntheticVectorCorpus(
        { vectorCount: 10 as SupportedSyntheticVectorCount, seed: "x" },
        { vectorCount: 1, outputRoot: temporaryDirectory },
      ),
      "Unsupported vector count",
    );
    await expectRejectionContaining(
      generateSyntheticVectorCorpus(
        { vectorCount: 450_000, seed: "x" },
        { vectorCount: 1_025, outputRoot: temporaryDirectory },
      ),
      "must not exceed 1024",
    );
    await expectRejectionContaining(
      generateSyntheticVectorCorpus(
        { vectorCount: 450_000, seed: "x" },
        {
          vectorCount: 1,
          outputRoot: temporaryDirectory,
          vectorsPerShard: Number.MAX_SAFE_INTEGER,
          vectorsPerBatch: Number.MAX_SAFE_INTEGER,
        },
      ),
      "Test vectors per shard must not exceed 1024",
    );
    await expectRejectionContaining(
      generateSyntheticVectorCorpus(
        { vectorCount: 25_000, seed: 1 as unknown as string },
        { vectorCount: 1, outputRoot: temporaryDirectory },
      ),
      "Seed must be a string",
    );
  });
});
