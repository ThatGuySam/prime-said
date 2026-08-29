import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCorpus } from "../scripts/validate-corpus.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPORARY_ROOTS: string[] = [];

const REQUIRED_DIRECTORIES = [
  "collections",
  "corrections/youtube",
  "dictionaries",
  "fixtures",
  "manifests",
  "moments",
  "sources/youtube",
  "transcripts/youtube",
] as const;

const SCHEMA_FILES = [
  "appearance.schema.json",
  "collection.schema.json",
  "eval-case.schema.json",
  "moment.schema.json",
  "source.schema.json",
  "transcript.schema.json",
] as const;

function syntheticSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceId: "youtube:fixture",
    platform: "youtube",
    platformId: "fixture",
    channel: {
      id: "fixture-channel",
      name: "Fixture channel",
      category: "creator-official",
    },
    title: "Synthetic validator fixture",
    canonicalUrl: "https://www.youtube.com/watch?v=fixture",
    publishedAt: null,
    durationMs: 2_000,
    availability: "unknown",
    lastCheckedAt: null,
    mediaFingerprint: null,
    provenance: {
      allowListId: "fixture-allow-list",
      discoveredAt: "2026-08-29T00:00:00Z",
    },
    ...overrides,
  };
}

function syntheticTranscript(display = "Transcript-backed fixture quote."): Record<string, unknown> {
  return {
    schemaVersion: 1,
    transcriptId: "transcript-fixture",
    sourceId: "youtube:fixture",
    language: "en",
    pipeline: {
      modelId: "fixture-model",
      modelRevision: "fixture-revision",
      generatedAt: "2026-08-29T00:00:00Z",
    },
    segments: [
      {
        segmentId: "segment-1",
        startMs: 500,
        endMs: 1_500,
        verbatim: display,
        display,
        search: display.toLowerCase(),
      },
    ],
  };
}

function syntheticMoment(quote = "Transcript-backed fixture quote."): Record<string, unknown> {
  return {
    schemaVersion: 1,
    momentId: "m1_fixture",
    quote,
    appearances: [
      {
        appearanceId: "a1_fixture",
        sourceId: "youtube:fixture",
        startMs: 500,
        endMs: 1_500,
        kind: "full-context",
        matchConfidence: 1,
        available: true,
      },
    ],
    canonicalAppearanceId: "a1_fixture",
    tags: [],
    reviewStatus: "reviewed",
    provenance: "human-seed",
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createCorpusCopy(): Promise<string> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "prime-said-corpus-test-"));
  TEMPORARY_ROOTS.push(temporaryRoot);
  const corpusDir = join(temporaryRoot, "corpus");

  for (const directory of REQUIRED_DIRECTORIES) {
    await mkdir(join(corpusDir, directory), { recursive: true });
  }
  await copyFile(
    join(REPOSITORY_ROOT, "corpus", "fixtures", "tdd-sources.json"),
    join(corpusDir, "fixtures", "tdd-sources.json"),
  );

  return corpusDir;
}

afterEach(async () => {
  const roots = TEMPORARY_ROOTS.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("corpus validation", () => {
  test("accepts the Phase 0 layout and unverified seed fixture", async () => {
    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT });

    expect(result).toEqual({
      ok: true,
      errors: [],
      canonicalFilesValidated: 0,
      fixtureFilesValidated: 1,
    });
  });

  test("reports a corpus traversal failure instead of treating it as empty", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "prime-said-corpus-read-test-"));
    TEMPORARY_ROOTS.push(temporaryRoot);
    const corpusDir = join(temporaryRoot, "corpus");
    await writeFile(corpusDir, "not a directory\n");

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("corpus/: cannot read directory: ENOTDIR");
  });

  test("reports JSON Schema violations with a stable file and field path", async () => {
    const corpusDir = await createCorpusCopy();
    await writeJson(
      join(corpusDir, "sources", "youtube", "invalid.json"),
      syntheticSource({
        unexpected: true,
      }),
    );

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.canonicalFilesValidated).toBe(1);
    expect(result.errors).toEqual([
      "corpus/sources/youtube/invalid.json/unexpected: must NOT have additional properties",
    ]);
  });

  test("rejects duplicate stable IDs", async () => {
    const corpusDir = await createCorpusCopy();
    await writeJson(
      join(corpusDir, "sources", "youtube", "a.json"),
      syntheticSource(),
    );
    await writeJson(
      join(corpusDir, "sources", "youtube", "b.json"),
      syntheticSource(),
    );

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/sources/youtube/b.json/sourceId: duplicate ID youtube:fixture",
    ]);
  });

  test("requires source platform fields to match the platform directory", async () => {
    const corpusDir = await createCorpusCopy();
    const twitchDir = join(corpusDir, "sources", "twitch");
    await mkdir(twitchDir, { recursive: true });
    await writeJson(join(twitchDir, "fixture.json"), syntheticSource());

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/sources/twitch/fixture.json/platform: value youtube does not match directory twitch",
      "corpus/sources/twitch/fixture.json/sourceId: platform youtube does not match directory twitch",
    ]);
  });

  test("resolves the nested appearance schema used by moments", async () => {
    const corpusDir = await createCorpusCopy();
    await writeFile(
      join(corpusDir, "moments", "invalid.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        momentId: "m1_fixture",
        quote: "Synthetic validator fixture.",
        appearances: [
          {
            appearanceId: "a1_fixture",
            sourceId: "youtube:fixture",
            startMs: 1_000,
            endMs: 2_000,
            kind: "unknown",
            matchConfidence: 0,
            unexpected: true,
          },
        ],
        tags: [],
        reviewStatus: "unreviewed",
      }, null, 2)}\n`,
    );

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/moments/invalid.json/appearances/0/unexpected: must NOT have additional properties",
    ]);
  });

  test("returns Ajv reference compilation failures as validation errors", async () => {
    const corpusDir = await createCorpusCopy();
    const schemaDir = join(dirname(corpusDir), "schemas");
    await mkdir(schemaDir, { recursive: true });
    for (const schemaFile of SCHEMA_FILES) {
      await copyFile(
        join(REPOSITORY_ROOT, "docs", "schemas", schemaFile),
        join(schemaDir, schemaFile),
      );
    }

    const momentSchemaPath = join(schemaDir, "moment.schema.json");
    const momentSchema = JSON.parse(await readFile(momentSchemaPath, "utf8")) as {
      properties: { appearances: { items: { $ref: string } } };
    };
    momentSchema.properties.appearances.items.$ref = "missing.schema.json";
    await writeJson(momentSchemaPath, momentSchema);

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir, schemaDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.startsWith(
      "Schema validator cannot compile https://prime-said.example/schemas/moment.schema.json:",
    )).toBe(true);
    expect(result.errors[0]).toContain("missing.schema.json");
  });

  test("requires a committed transcript for a canonical moment quote", async () => {
    const corpusDir = await createCorpusCopy();
    await writeJson(
      join(corpusDir, "sources", "youtube", "fixture.json"),
      syntheticSource(),
    );
    await writeJson(join(corpusDir, "moments", "m1_fixture.json"), syntheticMoment());

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/moments/m1_fixture.json/quote: no committed transcript exists for an appearance source",
    ]);
  });

  test("rejects a moment quote absent from overlapping transcript segments", async () => {
    const corpusDir = await createCorpusCopy();
    await writeJson(
      join(corpusDir, "sources", "youtube", "fixture.json"),
      syntheticSource(),
    );
    await writeJson(
      join(corpusDir, "transcripts", "youtube", "fixture.json"),
      syntheticTranscript("Different transcript text."),
    );
    await writeJson(join(corpusDir, "moments", "m1_fixture.json"), syntheticMoment());

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/moments/m1_fixture.json/quote: quote is not derivable from transcript segments overlapping an appearance",
    ]);
  });

  test("accepts a moment quote found in an overlapping transcript span", async () => {
    const corpusDir = await createCorpusCopy();
    await writeJson(
      join(corpusDir, "sources", "youtube", "fixture.json"),
      syntheticSource(),
    );
    await writeJson(
      join(corpusDir, "transcripts", "youtube", "fixture.json"),
      syntheticTranscript(),
    );
    await writeJson(join(corpusDir, "moments", "m1_fixture.json"), syntheticMoment());

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result).toEqual({
      ok: true,
      errors: [],
      canonicalFilesValidated: 3,
      fixtureFilesValidated: 1,
    });
  });

  test("requires an available appearance for a published quotation", async () => {
    const corpusDir = await createCorpusCopy();
    const moment = syntheticMoment() as {
      appearances: Array<{ available: boolean }>;
    };
    moment.appearances[0].available = false;
    await writeJson(
      join(corpusDir, "sources", "youtube", "fixture.json"),
      syntheticSource(),
    );
    await writeJson(
      join(corpusDir, "transcripts", "youtube", "fixture.json"),
      syntheticTranscript(),
    );
    await writeJson(join(corpusDir, "moments", "m1_fixture.json"), moment);

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/moments/m1_fixture.json/appearances: a published quotation needs at least one available appearance",
    ]);
  });

  test("does not treat touching transcript and appearance spans as overlapping", async () => {
    const corpusDir = await createCorpusCopy();
    const moment = syntheticMoment() as {
      appearances: Array<{ startMs: number; endMs: number }>;
    };
    moment.appearances[0].startMs = 1_500;
    moment.appearances[0].endMs = 1_600;
    await writeJson(
      join(corpusDir, "sources", "youtube", "fixture.json"),
      syntheticSource(),
    );
    await writeJson(
      join(corpusDir, "transcripts", "youtube", "fixture.json"),
      syntheticTranscript(),
    );
    await writeJson(join(corpusDir, "moments", "m1_fixture.json"), moment);

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/moments/m1_fixture.json/quote: quote is not derivable from transcript segments overlapping an appearance",
    ]);
  });

  test("rejects drift from the seed-unverified gold fixture", async () => {
    const corpusDir = await createCorpusCopy();
    const fixturePath = join(corpusDir, "fixtures", "tdd-sources.json");
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
      sources: Array<{ timestampMs: number }>;
    };
    fixture.sources[0].timestampMs += 1;
    await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/fixtures/tdd-sources.json: fixture drifted from evals/gold/tdd-seed.json; keep it seed-unverified until source metadata and timestamp spans are reviewed",
    ]);
  });

  test("ignores reproducible files under corpus/generated", async () => {
    const corpusDir = await createCorpusCopy();
    const generatedDir = join(corpusDir, "generated", "indexes");
    await mkdir(generatedDir, { recursive: true });
    await writeFile(join(generatedDir, "manifest.json"), "not canonical corpus data\n");

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result).toEqual({
      ok: true,
      errors: [],
      canonicalFilesValidated: 0,
      fixtureFilesValidated: 1,
    });
  });

  test("does not hide a nested canonical directory named generated", async () => {
    const corpusDir = await createCorpusCopy();
    const nestedDir = join(corpusDir, "sources", "youtube", "generated");
    await mkdir(nestedDir, { recursive: true });
    await writeJson(
      join(nestedDir, "invalid.json"),
      syntheticSource({ unexpected: true }),
    );

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.canonicalFilesValidated).toBe(1);
    expect(result.errors).toEqual([
      "corpus/sources/youtube/generated/invalid.json/unexpected: must NOT have additional properties",
    ]);
  });

  test("checks timestamp order and source duration after schema validation", async () => {
    const corpusDir = await createCorpusCopy();
    await writeJson(
      join(corpusDir, "sources", "youtube", "fixture.json"),
      syntheticSource(),
    );
    await writeJson(
      join(corpusDir, "transcripts", "youtube", "fixture.json"),
      {
        schemaVersion: 1,
        transcriptId: "transcript-fixture",
        sourceId: "youtube:fixture",
        language: "en",
        pipeline: {
          modelId: "fixture-model",
          modelRevision: "fixture-revision",
          generatedAt: "2026-08-29T00:00:00Z",
        },
        segments: [
          {
            segmentId: "segment-1",
            startMs: 1_500,
            endMs: 2_100,
            verbatim: "fixture",
            display: "Fixture.",
            search: "fixture",
            words: [
              {
                text: "fixture",
                startMs: 1_400,
                endMs: 1_600,
              },
            ],
          },
          {
            segmentId: "segment-2",
            startMs: 1_000,
            endMs: 1_400,
            verbatim: "fixture",
            display: "Fixture.",
            search: "fixture",
          },
        ],
      },
    );

    const result = await validateCorpus({ rootDir: REPOSITORY_ROOT, corpusDir });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "corpus/transcripts/youtube/fixture.json/segments/0/endMs: 2100 exceeds source duration 2000",
      "corpus/transcripts/youtube/fixture.json/segments/0/words/0: word timestamps must stay within the segment",
      "corpus/transcripts/youtube/fixture.json/segments/1: timestamps must be monotonic",
    ]);
  });
});
