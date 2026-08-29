export interface SupercutReference {
  sourceId: string;
  startMs: number;
  endMs: number;
}

export const SUPERCUT_PARAM = "cut";
export const SUPERCUT_VERSION = "r1";
export const MAX_SUPERCUT_CLIPS = 12;

const SOURCE_ID = /^[A-Za-z0-9:_-]{3,80}$/u;

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isValidReference(reference: SupercutReference): boolean {
  return (
    SOURCE_ID.test(reference.sourceId) &&
    Number.isSafeInteger(reference.startMs) &&
    Number.isSafeInteger(reference.endMs) &&
    reference.startMs >= 0 &&
    reference.endMs > reference.startMs
  );
}

export function encodeSupercut(references: SupercutReference[]): string {
  const safeReferences = references.slice(0, MAX_SUPERCUT_CLIPS);
  if (safeReferences.length === 0 || !safeReferences.every(isValidReference)) return "";

  const body = [
    SUPERCUT_VERSION,
    ...safeReferences.flatMap((reference) => [
      reference.sourceId,
      reference.startMs.toString(36),
      reference.endMs.toString(36),
    ]),
  ].join("~");

  return `${body}~${checksum(body)}`;
}

export function decodeSupercut(value: string | null): SupercutReference[] {
  if (!value) return [];
  const parts = value.split("~");
  if (parts.length < 5 || parts[0] !== SUPERCUT_VERSION) return [];

  const claimedChecksum = parts.at(-1);
  const bodyParts = parts.slice(0, -1);
  const body = bodyParts.join("~");
  if (!claimedChecksum || checksum(body) !== claimedChecksum) return [];

  const referenceParts = bodyParts.slice(1);
  if (referenceParts.length % 3 !== 0) return [];
  if (referenceParts.length / 3 > MAX_SUPERCUT_CLIPS) return [];

  const references: SupercutReference[] = [];
  for (let index = 0; index < referenceParts.length; index += 3) {
    const reference = {
      sourceId: referenceParts[index]!,
      startMs: Number.parseInt(referenceParts[index + 1]!, 36),
      endMs: Number.parseInt(referenceParts[index + 2]!, 36),
    };
    if (!isValidReference(reference)) return [];
    references.push(reference);
  }

  return references;
}
