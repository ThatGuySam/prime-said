import { describe, expect, test } from "bun:test";

import {
  decodeSupercut,
  encodeSupercut,
  MAX_SUPERCUT_CLIPS,
  type SupercutReference,
} from "../src/lib/supercut.ts";

const references: SupercutReference[] = [
  { sourceId: "youtube:S_7SE_Uzk-I", startMs: 1_181_520, endMs: 1_193_080 },
  { sourceId: "youtube:IInciWyU74U", startMs: 375_360, endMs: 385_200 },
];

describe("supercut URL payload", () => {
  test("round trips ordered sources and clip boundaries", () => {
    const encoded = encodeSupercut(references);

    expect(encoded.startsWith("r1~")).toBe(true);
    expect(decodeSupercut(encoded)).toEqual(references);
  });

  test("rejects a payload whose checksum no longer matches", () => {
    const encoded = encodeSupercut(references);
    const tampered = encoded.replace("S_7SE_Uzk-I", "S_7SE_Uzk-X");

    expect(decodeSupercut(tampered)).toEqual([]);
  });

  test("rejects invalid boundaries and caps encoded collections", () => {
    expect(encodeSupercut([{ sourceId: "youtube:valid_ID", startMs: 50, endMs: 50 }])).toBe("");

    const oversized = Array.from({ length: MAX_SUPERCUT_CLIPS + 4 }, (_, index) => ({
      sourceId: `youtube:video_${String(index).padStart(2, "0")}`,
      startMs: index * 1_000,
      endMs: index * 1_000 + 900,
    }));
    expect(decodeSupercut(encodeSupercut(oversized))).toHaveLength(MAX_SUPERCUT_CLIPS);
  });
});
