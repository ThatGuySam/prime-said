import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { REVIEW_CAPTION_SOURCES } from "./review-caption-source-contract.ts";

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
  spokenBy: {
    speakerId: string | null;
    status: "pending" | "reviewed";
  };
  wordsFrom: {
    kind: "speaker-original" | "twitch-chat" | "screen-source" | "quoted-person" | "played-media" | "mixed" | "unknown";
    status: "pending" | "reviewed";
  };
  humanReview: {
    status: "pending" | "reviewed";
    scopes: Array<"wording" | "timing" | "speaker" | "word-origin">;
  };
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

interface TddCandidateSource extends JsonObject {
  sourceId: string;
  title: string;
  approximateTimestampMs: number;
  rememberedIntent: {
    text: string | null;
    fidelity: "paraphrase" | "topic-only";
    provenance: "user-note";
  };
  reviewInstructions: string;
}

interface TddCandidates extends JsonObject {
  schemaVersion: number;
  status: "candidate-unverified";
  note: string;
  sources: TddCandidateSource[];
  cases: JsonObject[];
}

interface ReviewCaptionSegment extends JsonObject {
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
  search: string;
}

interface ReviewCaptionSource extends JsonObject {
  sourceId: string;
  platformId: string;
  title: string;
  channel: string;
  canonicalUrl: string;
  publishedAt: string | null;
  durationMs: number;
  captionSha256: string;
  segments: ReviewCaptionSegment[];
}

interface ReviewCaptionCorpus extends JsonObject {
  sources: ReviewCaptionSource[];
}

interface AttributionScreeningSource extends JsonObject {
  sourceId: string;
  captionSha256: string;
}

interface AttributionScreeningCorpus extends JsonObject {
  sources: AttributionScreeningSource[];
}

export interface CorpusValidationOptions {
  rootDir?: string;
  corpusDir?: string;
  fixturePath?: string;
  candidatePath?: string;
  reviewFixturePath?: string;
  attributionScreeningPath?: string;
  // Compatibility alias for callers from the Phase 0 scaffold.
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
  "attribution-screening-corpus.schema.json",
  "collection.schema.json",
  "eval-case.schema.json",
  "moment.schema.json",
  "review-caption-corpus.schema.json",
  "source.schema.json",
  "transcript.schema.json",
] as const;

const TDD_SOURCE_PROPERTIES = {
  sourceId: { type: "string", pattern: "^youtube:.+$" },
  title: { type: "string", minLength: 1 },
  approximateTimestampMs: { type: "integer", minimum: 0 },
  rememberedIntent: {
    type: "object",
    additionalProperties: false,
    required: ["text", "fidelity", "provenance"],
    properties: {
      text: { type: ["string", "null"] },
      fidelity: { enum: ["paraphrase", "topic-only"] },
      provenance: { const: "user-note" },
    },
  },
  reviewInstructions: { type: "string", minLength: 1 },
} as const;

const TDD_SOURCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sourceId", "title", "approximateTimestampMs", "rememberedIntent", "reviewInstructions"],
  properties: TDD_SOURCE_PROPERTIES,
} as const;

const TDD_FIXTURE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://prime-said.example/schemas/tdd-source-fixture.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "reviewStatus", "note", "sources"],
  properties: {
    schemaVersion: { const: 2 },
    reviewStatus: { const: "candidate-unverified" },
    note: { type: "string", minLength: 1 },
    sources: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: TDD_SOURCE_SCHEMA,
    },
  },
} as const;

const TDD_CANDIDATE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://prime-said.example/schemas/tdd-candidate-seed.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "status", "note", "sources", "cases"],
  properties: {
    schemaVersion: { const: 2 },
    status: { const: "candidate-unverified" },
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
      items: {
        type: "object",
        additionalProperties: false,
        required: ["caseId", "query", "queryClass", "candidateTargets", "provenance", "reviewStatus"],
        properties: {
          caseId: { type: "string", minLength: 1 },
          query: { type: "string", minLength: 1 },
          queryClass: { enum: ["paraphrase", "topic", "stretch"] },
          candidateTargets: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          provenance: { const: "human-seed" },
          reviewStatus: { const: "candidate-unverified" },
          notes: { type: "string", minLength: 1 },
        },
      },
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
    ajv.addSchema(TDD_CANDIDATE_SCHEMA);
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

  return (["verbatim", "display"] as const).some((field) => {
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
        if (moment.reviewStatus !== "reviewed") {
          errors.push(
            `${entry.label}/reviewStatus: canonical quotations must be reviewed or removed`,
          );
        }
        if (moment.spokenBy.status !== "reviewed" || moment.spokenBy.speakerId !== "theprimeagen") {
          errors.push(
            `${entry.label}/spokenBy: canonical quotations require reviewed theprimeagen vocal-speaker attribution`,
          );
        }
        if (moment.wordsFrom.status !== "reviewed" || moment.wordsFrom.kind !== "speaker-original") {
          errors.push(
            `${entry.label}/wordsFrom: canonical quotations require reviewed speaker-original word origin`,
          );
        }
        const requiredReviewScopes = ["wording", "timing", "speaker", "word-origin"] as const;
        if (
          moment.humanReview.status !== "reviewed"
          || requiredReviewScopes.some((scope) => !moment.humanReview.scopes.includes(scope))
        ) {
          errors.push(
            `${entry.label}/humanReview: canonical quotations require wording, timing, speaker, and word-origin review`,
          );
        }
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
  candidatePath: string,
  corpusDir: string,
  ajv: Ajv2020,
  errors: string[],
): Promise<number> {
  const fixtureLabel = corpusLabel(corpusDir, fixturePath);
  const fixture = await readJson(fixturePath, fixtureLabel, errors);
  const candidates = await readJson(candidatePath, "evals/candidates/tdd-seed.json", errors);
  if (fixture === undefined || candidates === undefined) return 0;

  const fixtureValidator = requiredValidator(
    ajv,
    String(TDD_FIXTURE_SCHEMA.$id),
    errors,
  );
  const candidateValidator = requiredValidator(ajv, String(TDD_CANDIDATE_SCHEMA.$id), errors);
  if (!fixtureValidator || !candidateValidator) return 0;

  if (!fixtureValidator(fixture)) {
    appendSchemaErrors(errors, fixtureLabel, fixtureValidator.errors);
    return 1;
  }
  if (!candidateValidator(candidates)) {
    appendSchemaErrors(errors, "evals/candidates/tdd-seed.json", candidateValidator.errors);
    return 1;
  }

  const typedCandidates = candidates as TddCandidates;
  const expectedFixture = {
    schemaVersion: typedCandidates.schemaVersion,
    reviewStatus: typedCandidates.status,
    note: typedCandidates.note,
    sources: typedCandidates.sources,
  };

  if (!isDeepStrictEqual(fixture, expectedFixture)) {
    errors.push(
      `${fixtureLabel}: fixture drifted from evals/candidates/tdd-seed.json; keep it candidate-unverified until source metadata and attribution spans are reviewed`,
    );
  }

  return 1;
}

async function validateReviewCaptionFixture(
  reviewFixturePath: string,
  tddFixturePath: string,
  attributionScreeningPath: string,
  corpusDir: string,
  ajv: Ajv2020,
  errors: string[],
): Promise<number> {
  const reviewLabel = corpusLabel(corpusDir, reviewFixturePath);
  const reviewFixture = await readJson(reviewFixturePath, reviewLabel, errors);
  const tddFixture = await readJson(tddFixturePath, corpusLabel(corpusDir, tddFixturePath), errors);
  const attribution = await readJson(
    attributionScreeningPath,
    "evals/attribution/screening-corpus.json",
    errors,
  );
  if (reviewFixture === undefined || tddFixture === undefined || attribution === undefined) return 0;

  const reviewValidator = requiredValidator(
    ajv,
    "https://prime-said.example/schemas/review-caption-corpus.schema.json",
    errors,
  );
  const tddValidator = requiredValidator(ajv, String(TDD_FIXTURE_SCHEMA.$id), errors);
  const attributionValidator = requiredValidator(
    ajv,
    "https://prime-said.example/schemas/attribution-screening-corpus.schema.json",
    errors,
  );
  if (!reviewValidator || !tddValidator || !attributionValidator) return 0;

  let inputsValid = true;
  if (!reviewValidator(reviewFixture)) {
    appendSchemaErrors(errors, reviewLabel, reviewValidator.errors);
    inputsValid = false;
  }
  if (!tddValidator(tddFixture)) {
    appendSchemaErrors(errors, corpusLabel(corpusDir, tddFixturePath), tddValidator.errors);
    inputsValid = false;
  }
  if (!attributionValidator(attribution)) {
    appendSchemaErrors(
      errors,
      "evals/attribution/screening-corpus.json",
      attributionValidator.errors,
    );
    inputsValid = false;
  }
  if (!inputsValid) {
    return 1;
  }

  const review = reviewFixture as ReviewCaptionCorpus;
  const candidates = tddFixture as { sources: TddCandidateSource[] };
  const screening = attribution as AttributionScreeningCorpus;
  const expectedCandidates = new Map(
    candidates.sources.map((source) => [source.sourceId, source]),
  );
  const expectedHashes = new Map(
    screening.sources.map((source) => [source.sourceId, source.captionSha256]),
  );
  const expectedMetadata = new Map<string, (typeof REVIEW_CAPTION_SOURCES)[number]>(
    REVIEW_CAPTION_SOURCES.map((source) => [source.sourceId, source]),
  );
  const seenSourceIds = new Set<string>();
  const seenSegmentIds = new Set<string>();

  review.sources.forEach((source, sourceIndex) => {
    const sourceLabel = `${reviewLabel}/sources/${sourceIndex}`;
    const expectedSource = expectedCandidates.get(source.sourceId);
    const metadata = expectedMetadata.get(source.sourceId);
    if (seenSourceIds.has(source.sourceId)) {
      errors.push(`${sourceLabel}/sourceId: duplicate source ${source.sourceId}`);
    }
    seenSourceIds.add(source.sourceId);

    if (!expectedSource) {
      errors.push(`${sourceLabel}/sourceId: source is not one of the three Phase 0 candidates`);
    } else if (source.title !== expectedSource.title) {
      errors.push(`${sourceLabel}/title: title does not match the Phase 0 candidate fixture`);
    }
    if (source.sourceId !== `youtube:${source.platformId}`) {
      errors.push(`${sourceLabel}/sourceId: expected youtube:${source.platformId}`);
    }
    if (!metadata) {
      errors.push(`${sourceLabel}/sourceId: source is absent from the pinned review contract`);
    } else {
      if (source.platformId !== metadata.platformId) {
        errors.push(`${sourceLabel}/platformId: does not match the pinned review contract`);
      }
      if (source.channel !== metadata.channel) {
        errors.push(`${sourceLabel}/channel: does not match the pinned review contract`);
      }
      if (source.canonicalUrl !== metadata.canonicalUrl) {
        errors.push(`${sourceLabel}/canonicalUrl: does not match the pinned review contract`);
      }
      if (source.publishedAt !== metadata.publishedAt) {
        errors.push(`${sourceLabel}/publishedAt: does not match the pinned review contract`);
      }
      if (source.durationMs !== metadata.durationMs) {
        errors.push(`${sourceLabel}/durationMs: does not match the pinned review contract`);
      }
    }
    if (source.captionSha256 !== expectedHashes.get(source.sourceId)) {
      errors.push(`${sourceLabel}/captionSha256: hash does not match the attribution screening corpus`);
    }

    let previousStart = -1;
    let previousEnd = -1;
    source.segments.forEach((segment, segmentIndex) => {
      const segmentLabel = `${sourceLabel}/segments/${segmentIndex}`;
      if (seenSegmentIds.has(segment.segmentId)) {
        errors.push(`${segmentLabel}/segmentId: duplicate segment ID ${segment.segmentId}`);
      }
      seenSegmentIds.add(segment.segmentId);
      if (segment.endMs <= segment.startMs) {
        errors.push(`${segmentLabel}: endMs must be greater than startMs`);
      }
      if (segment.startMs < previousStart || segment.endMs < previousEnd) {
        errors.push(`${segmentLabel}: timestamps must be monotonic`);
      }
      if (segment.endMs > source.durationMs + 5_000) {
        errors.push(
          `${segmentLabel}/endMs: ${segment.endMs} exceeds source duration plus caption tolerance ${source.durationMs + 5_000}`,
        );
      }
      if (segment.search !== segment.text.toLocaleLowerCase("en-US")) {
        errors.push(`${segmentLabel}/search: must be the case-folded caption text`);
      }
      previousStart = segment.startMs;
      previousEnd = segment.endMs;
    });
  });

  const expectedIds = candidates.sources.map((source) => source.sourceId);
  const actualIds = review.sources.map((source) => source.sourceId);
  if (!isDeepStrictEqual(actualIds, expectedIds)) {
    errors.push(`${reviewLabel}/sources: source order must match the Phase 0 candidate fixture`);
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
  const candidatePath = resolve(
    options.candidatePath
      ?? options.goldPath
      ?? join(rootDir, "evals", "candidates", "tdd-seed.json"),
  );
  const reviewFixturePath = resolve(
    options.reviewFixturePath
      ?? join(corpusDir, "fixtures", "tdd-auto-caption-review.json"),
  );
  const attributionScreeningPath = resolve(
    options.attributionScreeningPath
      ?? join(rootDir, "evals", "attribution", "screening-corpus.json"),
  );
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
    if (resolve(file) === fixturePath || resolve(file) === reviewFixturePath) continue;

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
  const tddFixtureFilesValidated = await validateTddFixture(
    fixturePath,
    candidatePath,
    corpusDir,
    ajv,
    errors,
  );
  const reviewFixtureFilesValidated = await validateReviewCaptionFixture(
    reviewFixturePath,
    fixturePath,
    attributionScreeningPath,
    corpusDir,
    ajv,
    errors,
  );
  const fixtureFilesValidated = tddFixtureFilesValidated + reviewFixtureFilesValidated;

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
