import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_ASSET_BYTES,
  MAX_ASSET_COUNT,
  findAssetBudgetViolations,
  formatAssetBudgetViolation,
  formatAssetReport,
  inspectAssetDirectory,
  runAssetReport,
  summarizeAssets
} from "../scripts/report-assets";

async function expectRejectionMessage(
  promise: Promise<unknown>,
  expectedMessage: string
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
  expect(rejection.message).toBe(expectedMessage);
}

describe("production asset report", () => {
  let fixtureRoot: string;
  let dist: string;

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "prime-said-assets-"));
    dist = join(fixtureRoot, "dist");
    await mkdir(dist);
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  test("reports nested assets in deterministic path order", async () => {
    await mkdir(join(dist, "assets"));
    await writeFile(join(dist, "z.txt"), "12");
    await writeFile(join(dist, "assets", "b.bin"), "1234");
    await writeFile(join(dist, "assets", "a.bin"), "5678");

    const report = await inspectAssetDirectory(dist);

    expect(report.assets).toEqual([
      { path: "assets/a.bin", bytes: 4 },
      { path: "assets/b.bin", bytes: 4 },
      { path: "z.txt", bytes: 2 }
    ]);
    expect(report.assetCount).toBe(3);
    expect(report.largestAsset).toEqual({ path: "assets/a.bin", bytes: 4 });
    expect(report.totalBytes).toBe(10);
    expect(formatAssetReport(report)).toBe(
      [
        "Production asset report",
        "Asset count: 3",
        "Largest asset: assets/a.bin (4 bytes)",
        "Total bytes: 10"
      ].join("\n")
    );
  });

  test("allows the exact production size and count limits", () => {
    const assets = Array.from({ length: MAX_ASSET_COUNT }, (_, index) => ({
      path: `asset-${index.toString().padStart(4, "0")}.bin`,
      bytes: index === 0 ? MAX_ASSET_BYTES : 0
    }));
    const report = summarizeAssets(assets);

    expect(findAssetBudgetViolations(report)).toEqual([]);
  });

  test("rejects every oversized asset and a count above the limit", () => {
    const assets = Array.from({ length: MAX_ASSET_COUNT + 1 }, (_, index) => ({
      path: `asset-${index.toString().padStart(4, "0")}.bin`,
      bytes: index < 2 ? MAX_ASSET_BYTES + index + 1 : 0
    }));
    const report = summarizeAssets(assets);
    const violations = findAssetBudgetViolations(report);

    expect(violations).toEqual([
      { kind: "asset-count", actual: 5_001, limit: 5_000 },
      {
        kind: "asset-size",
        path: "asset-0000.bin",
        actual: MAX_ASSET_BYTES + 1,
        limit: MAX_ASSET_BYTES
      },
      {
        kind: "asset-size",
        path: "asset-0001.bin",
        actual: MAX_ASSET_BYTES + 2,
        limit: MAX_ASSET_BYTES
      }
    ]);
    expect(violations.map(formatAssetBudgetViolation)).toEqual([
      "Asset count 5001 exceeds limit 5000.",
      `Asset asset-0000.bin is ${MAX_ASSET_BYTES + 1} bytes, exceeding limit ${MAX_ASSET_BYTES} bytes (16 MiB).`,
      `Asset asset-0001.bin is ${MAX_ASSET_BYTES + 2} bytes, exceeding limit ${MAX_ASSET_BYTES} bytes (16 MiB).`
    ]);
  });

  test("fails clearly when dist is missing", async () => {
    const missing = join(fixtureRoot, "missing-dist");

    await expectRejectionMessage(
      inspectAssetDirectory(missing),
      `Production asset directory does not exist: ${missing}`,
    );
  });

  test("fails clearly when dist contains no files", async () => {
    await mkdir(join(dist, "empty", "nested"), { recursive: true });

    await expectRejectionMessage(
      inspectAssetDirectory(dist),
      `Production asset directory contains no files: ${dist}`,
    );
  });

  test("returns failure after printing a report for budget violations", async () => {
    await writeFile(join(dist, "one.bin"), "1234");
    await writeFile(join(dist, "two.bin"), "12");
    const logged: string[] = [];
    const errors: string[] = [];

    const exitCode = await runAssetReport(
      dist,
      { maxAssetBytes: 3, maxAssetCount: 1 },
      {
        log: (message) => logged.push(message),
        error: (message) => errors.push(message)
      }
    );

    expect(exitCode).toBe(1);
    expect(logged).toEqual([
      [
        "Production asset report",
        "Asset count: 2",
        "Largest asset: one.bin (4 bytes)",
        "Total bytes: 6"
      ].join("\n")
    ]);
    expect(errors).toEqual([
      "Asset budget violation: Asset count 2 exceeds limit 1.",
      "Asset budget violation: Asset one.bin is 4 bytes, exceeding limit 3 bytes."
    ]);
  });
});
