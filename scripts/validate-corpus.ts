import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

type JsonObject = Record<string, unknown>;

type CanonicalKind = "source" | "transcript" | "moment" | "collection";

interface SchemaSpec {
  directory: string;
  id: string;
  kind: CanonicalKind;
}

interface CanonicalRecord {
  file: string;
  label: string;
  kind: CanonicalKind;
  value: JsonObject;
}

interface SourceRecord extends JsonObject {
  sourceId: string;
  platform: string;
  platformId: string;
  durationMs: number;
}

interface TranscriptSegment extends JsonObject {
  segmentId: string;
  startMs: number;
  endMs: number;
  verbatim: string;
  display: string;
  search: string;
  words?: Array<{
    text: string;
    startMs: number;
    endMs: number;
  }>;
}

interface TranscriptRecord extends JsonObject {
  transcriptId: string;
  sourceId: string;
  segments: TranscriptSegment[];
}

interface AppearanceRecord extends JsonObject {
  appearanceId: string;
  sourceId: string;
  startMs: number;
  endMs: number;
  available?: boolean;
}

interface MomentRecord extends JsonObject {
  momentId: string;
  quote: string;
  appearances: AppearanceRecord[];
  canonicalAppearanceId?: string | null;
  reviewStatus: "unreviewed" | "reviewed" | "disputed" | "removed";
}

interface CollectionItem extends JsonObject {
  momentId: string;
  preferredAppearanceId?: string | null;
  trimStartMs?: number | null;
  trimEndMs?: number | null;
}

interface CollectionRecord extends JsonObject {
  collectionId: string;
  items: CollectionItem[];
}

interface TddSeedSource extends JsonObject {
  sourceId: string;
  title: string;
  timestampMs: number;
  knownWording: string | null;
}

interface TddGold extends JsonObject {
  schemaVersion: number;
  status: "seed-unverified";
  note: string;
  sources: TddSeedSource[];
  cases: JsonObject[];
}

export interface CorpusValidationOptions {
  rootDir?: string;
  corpusDir?: string;
  fixturePath?: string;
  goldPath?: string;
  schemaDir?: string;
}

export interface CorpusValidationResult {
  ok: boolean;
  errors: string[];
  canonicalFilesValidated: number;
  fixtureFilesValidated: number;
}

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_CORPUS_DIRECTORIES = [
  "collections",
  "corrections",
  "corrections/youtube",
  "dictionaries",
  "fixtures",
  "manifests",
  "moments",
  "sources",
  "sources/youtube",
  "transcripts",
  "transcripts/youtube",
] as const;

const SCHEMA_SPECS: SchemaSpec[] = [
  {
    directory: "sources",
    id: "https://prime-said.example/schemas/source.schema.json",
    kind: "source",
  },
  {
    directory: "transcripts",
    id: "https://prime-said.example/schemas/transcript.schema.json",
    kind: "transcript",
  },
  {
    directory: "moments",
    id: "https://prime-said.example/schemas/moment.schema.json",
    kind: "moment",
  },
  {
    directory: "collections",
    id: "https://prime-said.example/schemas/collection.schema.json",
    kind: "collection",
  },
];

const ALL_SCHEMA_FILES = [
  "appearance.schema.json",
  "collection.schema.json",
  "eval-case.schema.json",
  "moment.schema.json",
  "source.schema.json",
  "transcript.schema.json",
] as const;

const EVAL_CASE_SCHEMA_ID = "https://prime-said.example/schemas/eval-case.schema.json";

const TDD_SOURCE_PROPERTIES = {
  sourceId: { type: "string", pattern: "^youtube:.+$" },
  title: { type: "string", minLength: 1 },
  timestampMs: { type: "integer", minimum: 0 },
  knownWording: { type: ["string", "null"] },
} as const;

const TDD_SOURCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sourceId", "title", "timestampMs", "knownWording"],
  properties: TDD_SOURCE_PROPERTIES,
} as const;

const TDD_FIXTURE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://prime-said.example/schemas/tdd-source-fixture.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "reviewStatus", "note", "sources"],
  properties: {
    schemaVersion: { const: 1 },
    reviewStatus: { const: "seed-unverified" },
    note: { type: "string", minLength: 1 },
    sources: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: TDD_SOURCE_SCHEMA,
    },
  },
} as const;

const TDD_GOLD_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://prime-said.example/schemas/tdd-gold-seed.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "status", "note", "sources", "cases"],
  properties: {
    schemaVersion: { const: 1 },
    status: { const: "seed-unverified" },
    note: { type: "string", minLength: 1 },
    sources: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: TDD_SOURCE_SCHEMA,
    },
    cases: {
      type: "array",
      minItems: 1,
      items: { $ref: EVAL_CASE_SCHEMA_ID },
    },
  },
} as const;

function slashPath(path: string): string {
  return path.split(sep).join("/");
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function corpusLabel(corpusDir: string, file: string): string {
  return `corpus/${slashPath(relative(corpusDir, file))}`;
}

function schemaErrorPath(error: ErrorObject): string {
  const parameters = error.params as Record<string, unknown>;
  if (error.keyword === "required" && typeof parameters.missingProperty === "string") {
    return `${error.instancePath}/${parameters.missingProperty}`;
  }
  if (error.keyword === "additionalProperties" && typeof parameters.additionalProperty === "string") {
    return `${error.instancePath}/${parameters.additionalProperty}`;
  }
  return error.instancePath || "/";
}

function appendSchemaErrors(
  errors: string[],
  label: string,
  validationErrors: ErrorObject[] | null | undefined,
): void {
  for (const error of validationErrors ?? []) {
    errors.push(`${label}${schemaErrorPath(error)}: ${error.message ?? error.keyword}`);
  }
}

async function readJson(
  file: string,
  label: string,
  errors: string[],
): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${label}: cannot read valid JSON: ${message}`);
    return undefined;
  }
}

async function listJsonFiles(
  directory: string,
  ignoredDirectoryPaths: ReadonlySet<string>,
  corpusDir: string,
  errors: string[],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown error";
    errors.push(`${corpusLabel(corpusDir, directory)}: cannot read directory: ${code}`);
    return [];
  }

  const files: string[] = [];
  for (const entry of entries.sort((left, right) => compareStrings(left.name, right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignoredDirectoryPaths.has(resolve(path))) {
      files.push(...await listJsonFiles(path, ignoredDirectoryPaths, corpusDir, errors));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path);
    }
  }
  return files;
}

async function validateLayout(corpusDir: string, errors: string[]): Promise<void> {
  for (const directory of REQUIRED_CORPUS_DIRECTORIES) {
    const path = join(corpusDir, directory);
    try {
      if (!(await stat(path)).isDirectory()) {
        errors.push(`corpus/${directory}: expected a directory`);
      }
    } catch {
      errors.push(`corpus/${directory}: missing required directory`);
    }
  }
}

async function createAjv(
  schemaDir: string,
  errors: string[],
): Promise<Ajv2020 | undefined> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const file of ALL_SCHEMA_FILES) {
    const path = join(schemaDir, file);
    const schema = await readJson(path, `docs/schemas/${file}`, errors);
    if (schema === undefined) continue;
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      errors.push(`docs/schemas/${file}: schema root must be an object`);
      continue;
    }

    try {
      ajv.addSchema(schema);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`docs/schemas/${file}: cannot register schema: ${message}`);
    }
  }

  if (errors.some((error) => error.startsWith("docs/schemas/"))) return undefined;

  try {
    ajv.addSchema(TDD_FIXTURE_SCHEMA);
    ajv.addSchema(TDD_GOLD_SCHEMA);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`TDD fixture schemas: cannot register schema: ${message}`);
    return undefined;
  }

  return ajv;
}

function requiredValidator(
  ajv: Ajv2020,
  schemaId: string,
  errors: string[],
): ValidateFunction | undefined {
  try {
    const validator = ajv.getSchema(schemaId);
    if (!validator) errors.push(`Schema validator is unavailable for ${schemaId}`);
    return validator;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Schema validator cannot compile ${schemaId}: ${message}`);
    return undefined;
  }
}

function validatePlatformPath(
  record: CanonicalRecord,
  corpusDir: string,
  errors: string[],
): void {
  if (record.kind !== "source" && record.kind !== "transcript") return;

  const parts = slashPath(relative(corpusDir, record.file)).split("/");
  const platformDirectory = parts[1];
  if (parts.length < 3 || !platformDirectory) {
    errors.push(`${record.label}: ${record.kind} records must be stored under a platform directory`);
    return;
  }

  const sourceId = String(record.value.sourceId);
  const sourcePlatform = sourceId.split(":", 1)[0];
  if (sourcePlatform !== platformDirectory) {
    errors.push(`${record.label}/sourceId: platform ${sourcePlatform} does not match directory ${platformDirectory}`);
  }

  if (record.kind === "source" && String(record.value.platform) !== platformDirectory) {
    errors.push(`${record.label}/platform: value ${String(record.value.platform)} does not match directory ${platformDirectory}`);
  }
}

function addUnique<T>(
  map: Map<string, T>,
  id: string,
  value: T,
  label: string,
  field: string,
  errors: string[],
): void {
  if (map.has(id)) {
    errors.push(`${label}/${field}: duplicate ID ${id}`);
    return;
  }
  map.set(id, value);
}

function validateTimedItems(
  label: string,
  items: Array<{ startMs: number; endMs: number }>,
  durationMs: number | undefined,
  errors: string[],
): void {
  let previousStart = -1;
  let previousEnd = -1;

  items.forEach((item, index) => {
    const itemLabel = `${label}/${index}`;
    validateTimedItem(itemLabel, item, durationMs, errors);
    if (item.startMs < previousStart || item.endMs < previousEnd) {
      errors.push(`${itemLabel}: timestamps must be monotonic`);
    }
    previousStart = item.startMs;
    previousEnd = item.endMs;
  });
}

function validateTimedItem(
  label: string,
  item: { startMs: number; endMs: number },
  durationMs: number | undefined,
  errors: string[],
): void {
  if (item.endMs <= item.startMs) {
    errors.push(`${label}: endMs must be greater than startMs`);
  }
  if (durationMs !== undefined && item.endMs > durationMs) {
    errors.push(`${label}/endMs: ${item.endMs} exceeds source duration ${durationMs}`);
  }
}

function normalizeDerivableText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function transcriptContainsQuote(
  transcript: TranscriptRecord,
  appearance: AppearanceRecord,
  normalizedQuote: string,
): boolean {
  const overlappingSegments = transcript.segments.filter(
    (segment) => segment.endMs > appearance.startMs && segment.startMs < appearance.endMs,
  );

  return (["verbatim", "display", "search"] as const).some((field) => {
    const transcriptText = overlappingSegments.map((segment) => segment[field]).join(" ");
    return normalizeDerivableText(transcriptText).includes(normalizedQuote);
  });
}

function validateIntegrity(records: CanonicalRecord[], errors: string[]): void {
  const sources = new Map<string, { label: string; record: SourceRecord }>();
  const transcripts = new Map<string, TranscriptRecord>();
  const transcriptsBySource = new Map<string, TranscriptRecord[]>();
  const moments = new Map<string, { label: string; record: MomentRecord }>();
  const collections = new Map<string, CollectionRecord>();
  const appearanceOwners = new Map<string, string>();

  for (const entry of records) {
    if (entry.kind === "source") {
      const source = entry.value as SourceRecord;
      addUnique(sources, source.sourceId, { label: entry.label, record: source }, entry.label, "sourceId", errors);
      const expectedSourceId = `${source.platform}:${source.platformId}`;
      if (source.sourceId !== expectedSourceId) {
        errors.push(`${entry.label}/sourceId: expected ${expectedSourceId} from platform and platformId`);
      }
    } else if (entry.kind === "transcript") {
      const transcript = entry.value as TranscriptRecord;
      addUnique(transcripts, transcript.transcriptId, transcript, entry.label, "transcriptId", errors);
      const sourceTranscripts = transcriptsBySource.get(transcript.sourceId) ?? [];
      sourceTranscripts.push(transcript);
      transcriptsBySource.set(transcript.sourceId, sourceTranscripts);
    } else if (entry.kind === "moment") {
      const moment = entry.value as MomentRecord;
      addUnique(moments, moment.momentId, { label: entry.label, record: moment }, entry.label, "momentId", errors);
    } else {
      const collection = entry.value as CollectionRecord;
      addUnique(collections, collection.collectionId, collection, entry.label, "collectionId", errors);
    }
  }

  for (const entry of records) {
    if (entry.kind === "transcript") {
      const transcript = entry.value as TranscriptRecord;
      const source = sources.get(transcript.sourceId)?.record;
      if (!source) errors.push(`${entry.label}/sourceId: unknown source ${transcript.sourceId}`);

      validateTimedItems(
        `${entry.label}/segments`,
        transcript.segments,
        source?.durationMs,
        errors,
      );

      transcript.segments.forEach((segment, segmentIndex) => {
        if (!segment.words) return;
        validateTimedItems(
          `${entry.label}/segments/${segmentIndex}/words`,
          segment.words,
          source?.durationMs,
          errors,
        );
        segment.words.forEach((word, wordIndex) => {
          if (word.startMs < segment.startMs || word.endMs > segment.endMs) {
            errors.push(
              `${entry.label}/segments/${segmentIndex}/words/${wordIndex}: word timestamps must stay within the segment`,
            );
          }
        });
      });
    }

    if (entry.kind === "moment") {
      const moment = entry.value as MomentRecord;
      const localAppearanceIds = new Set<string>();
      const normalizedQuote = normalizeDerivableText(moment.quote);
      let hasReferencedTranscript = false;
      let quoteIsDerivable = false;
      let hasAvailableAppearance = false;

      moment.appearances.forEach((appearance, appearanceIndex) => {
        const appearanceLabel = `${entry.label}/appearances/${appearanceIndex}`;
        const owner = appearanceOwners.get(appearance.appearanceId);
        if (owner) {
          errors.push(`${appearanceLabel}/appearanceId: duplicate ID ${appearance.appearanceId}; first used by ${owner}`);
        } else {
          appearanceOwners.set(appearance.appearanceId, moment.momentId);
        }
        localAppearanceIds.add(appearance.appearanceId);

        const source = sources.get(appearance.sourceId)?.record;
        if (!source) errors.push(`${appearanceLabel}/sourceId: unknown source ${appearance.sourceId}`);
        validateTimedItem(appearanceLabel, appearance, source?.durationMs, errors);
        if (appearance.available === true) hasAvailableAppearance = true;

        const sourceTranscripts = transcriptsBySource.get(appearance.sourceId) ?? [];
        if (sourceTranscripts.length > 0) hasReferencedTranscript = true;
        if (
          normalizedQuote.length > 0
          && sourceTranscripts.some((transcript) => transcriptContainsQuote(transcript, appearance, normalizedQuote))
        ) {
          quoteIsDerivable = true;
        }
      });

      if (moment.reviewStatus !== "removed") {
        if (!hasAvailableAppearance) {
          errors.push(
            `${entry.label}/appearances: a published quotation needs at least one available appearance`,
          );
        }
        if (normalizedQuote.length === 0) {
          errors.push(`${entry.label}/quote: quote must contain non-whitespace text`);
        } else if (!hasReferencedTranscript) {
          errors.push(
            `${entry.label}/quote: no committed transcript exists for an appearance source`,
          );
        } else if (!quoteIsDerivable) {
          errors.push(
            `${entry.label}/quote: quote is not derivable from transcript segments overlapping an appearance`,
          );
        }
      }

      if (
        moment.canonicalAppearanceId !== undefined
        && moment.canonicalAppearanceId !== null
        && !localAppearanceIds.has(moment.canonicalAppearanceId)
      ) {
        errors.push(
          `${entry.label}/canonicalAppearanceId: unknown appearance ${moment.canonicalAppearanceId}`,
        );
      }
    }

    if (entry.kind === "collection") {
      const collection = entry.value as CollectionRecord;
      collection.items.forEach((item, itemIndex) => {
        const itemLabel = `${entry.label}/items/${itemIndex}`;
        const moment = moments.get(item.momentId)?.record;
        if (!moment) {
          errors.push(`${itemLabel}/momentId: unknown moment ${item.momentId}`);
        } else if (
          item.preferredAppearanceId
          && !moment.appearances.some(({ appearanceId }) => appearanceId === item.preferredAppearanceId)
        ) {
          errors.push(
            `${itemLabel}/preferredAppearanceId: ${item.preferredAppearanceId} does not belong to ${item.momentId}`,
          );
        }

        if (
          item.trimStartMs !== undefined
          && item.trimStartMs !== null
          && item.trimEndMs !== undefined
          && item.trimEndMs !== null
          && item.trimEndMs <= item.trimStartMs
        ) {
          errors.push(`${itemLabel}: trimEndMs must be greater than trimStartMs`);
        }
      });
    }
  }
}

async function validateTddFixture(
  fixturePath: string,
  goldPath: string,
  corpusDir: string,
  ajv: Ajv2020,
  errors: string[],
): Promise<number> {
  const fixtureLabel = corpusLabel(corpusDir, fixturePath);
  const fixture = await readJson(fixturePath, fixtureLabel, errors);
  const gold = await readJson(goldPath, "evals/gold/tdd-seed.json", errors);
  if (fixture === undefined || gold === undefined) return 0;

  const fixtureValidator = requiredValidator(
    ajv,
    String(TDD_FIXTURE_SCHEMA.$id),
    errors,
  );
  const goldValidator = requiredValidator(ajv, String(TDD_GOLD_SCHEMA.$id), errors);
  if (!fixtureValidator || !goldValidator) return 0;

  if (!fixtureValidator(fixture)) {
    appendSchemaErrors(errors, fixtureLabel, fixtureValidator.errors);
    return 1;
  }
  if (!goldValidator(gold)) {
    appendSchemaErrors(errors, "evals/gold/tdd-seed.json", goldValidator.errors);
    return 1;
  }

  const typedGold = gold as TddGold;
  const expectedFixture = {
    schemaVersion: typedGold.schemaVersion,
    reviewStatus: typedGold.status,
    note: typedGold.note,
    sources: typedGold.sources,
  };

  if (!isDeepStrictEqual(fixture, expectedFixture)) {
    errors.push(
      `${fixtureLabel}: fixture drifted from evals/gold/tdd-seed.json; keep it seed-unverified until source metadata and timestamp spans are reviewed`,
    );
  }

  return 1;
}

export async function validateCorpus(
  options: CorpusValidationOptions = {},
): Promise<CorpusValidationResult> {
  const rootDir = resolve(options.rootDir ?? DEFAULT_ROOT);
  const corpusDir = resolve(options.corpusDir ?? join(rootDir, "corpus"));
  const schemaDir = resolve(options.schemaDir ?? join(rootDir, "docs", "schemas"));
  const fixturePath = resolve(options.fixturePath ?? join(corpusDir, "fixtures", "tdd-sources.json"));
  const goldPath = resolve(options.goldPath ?? join(rootDir, "evals", "gold", "tdd-seed.json"));
  const errors: string[] = [];

  await validateLayout(corpusDir, errors);
  const ajv = await createAjv(schemaDir, errors);
  if (!ajv) {
    return {
      ok: false,
      errors: errors.sort(compareStrings),
      canonicalFilesValidated: 0,
      fixtureFilesValidated: 0,
    };
  }

  const validators = new Map<CanonicalKind, ValidateFunction>();
  for (const spec of SCHEMA_SPECS) {
    const validator = requiredValidator(ajv, spec.id, errors);
    if (validator) validators.set(spec.kind, validator);
  }

  const allCorpusJson = await listJsonFiles(
    corpusDir,
    new Set([resolve(corpusDir, "generated")]),
    corpusDir,
    errors,
  );
  const canonicalRecords: CanonicalRecord[] = [];
  let canonicalFilesValidated = 0;

  for (const file of allCorpusJson) {
    if (resolve(file) === fixturePath) continue;

    const relativePath = slashPath(relative(corpusDir, file));
    const topDirectory = relativePath.split("/", 1)[0];
    const spec = SCHEMA_SPECS.find(({ directory }) => directory === topDirectory);
    const label = corpusLabel(corpusDir, file);
    if (!spec) {
      errors.push(
        `${label}: no JSON Schema is registered for this corpus path; add a schema before committing canonical data here`,
      );
      continue;
    }

    canonicalFilesValidated += 1;
    const value = await readJson(file, label, errors);
    if (value === undefined) continue;

    const validator = validators.get(spec.kind);
    if (!validator) continue;
    if (!validator(value)) {
      appendSchemaErrors(errors, label, validator.errors);
      continue;
    }

    const record: CanonicalRecord = {
      file,
      label,
      kind: spec.kind,
      value: value as JsonObject,
    };
    canonicalRecords.push(record);
    validatePlatformPath(record, corpusDir, errors);
  }

  validateIntegrity(canonicalRecords, errors);
  const fixtureFilesValidated = await validateTddFixture(
    fixturePath,
    goldPath,
    corpusDir,
    ajv,
    errors,
  );

  const sortedErrors = errors.sort(compareStrings);
  return {
    ok: sortedErrors.length === 0,
    errors: sortedErrors,
    canonicalFilesValidated,
    fixtureFilesValidated,
  };
}

if (import.meta.main) {
  const result = await validateCorpus({ rootDir: process.argv[2] });
  if (!result.ok) {
    console.error(["Corpus validation failed:", ...result.errors.map((error) => `- ${error}`)].join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `Corpus validation passed: ${result.canonicalFilesValidated} canonical file(s), ${result.fixtureFilesValidated} fixture file(s).`,
    );
  }
}
