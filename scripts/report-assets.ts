import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const MAX_ASSET_BYTES = 16 * 1024 * 1024;
export const MAX_ASSET_COUNT = 5_000;

export interface AssetBudget {
  readonly maxAssetBytes: number;
  readonly maxAssetCount: number;
}

export interface AssetFile {
  readonly path: string;
  readonly bytes: number;
}

export interface AssetReport {
  readonly assets: readonly AssetFile[];
  readonly assetCount: number;
  readonly largestAsset: AssetFile;
  readonly totalBytes: number;
}

export type AssetBudgetViolation =
  | {
      readonly kind: "asset-count";
      readonly actual: number;
      readonly limit: number;
    }
  | {
      readonly kind: "asset-size";
      readonly path: string;
      readonly actual: number;
      readonly limit: number;
    };

export interface AssetReportLogger {
  log(message: string): void;
  error(message: string): void;
}

export const PRODUCTION_ASSET_BUDGET: AssetBudget = {
  maxAssetBytes: MAX_ASSET_BYTES,
  maxAssetCount: MAX_ASSET_COUNT
};

export const DEFAULT_DIST_DIRECTORY = join(import.meta.dirname, "..", "dist");

function compareNames(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toAssetPath(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function walkAssetDirectory(
  root: string,
  directory: string,
  assets: AssetFile[]
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareNames(left.name, right.name));

  for (const entry of entries) {
    const file = join(directory, entry.name);

    if (entry.isDirectory()) {
      await walkAssetDirectory(root, file, assets);
      continue;
    }

    const path = toAssetPath(root, file);
    if (!entry.isFile()) {
      throw new Error(`Production asset directory contains unsupported entry: ${path}`);
    }

    const info = await stat(file);
    assets.push({ path, bytes: info.size });
  }
}

export async function collectAssets(directory: string): Promise<AssetFile[]> {
  let directoryInfo;
  try {
    directoryInfo = await stat(directory);
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) {
      throw new Error(`Production asset directory does not exist: ${directory}`);
    }
    throw error;
  }

  if (!directoryInfo.isDirectory()) {
    throw new Error(`Production asset path is not a directory: ${directory}`);
  }

  const assets: AssetFile[] = [];
  await walkAssetDirectory(directory, directory, assets);
  return assets;
}

export function summarizeAssets(assets: readonly AssetFile[]): AssetReport {
  if (assets.length === 0) {
    throw new Error("Cannot summarize an empty production asset list.");
  }

  const orderedAssets = [...assets].sort((left, right) =>
    compareNames(left.path, right.path)
  );
  const firstAsset = orderedAssets[0];
  if (!firstAsset) {
    throw new Error("Cannot summarize an empty production asset list.");
  }

  let largestAsset = firstAsset;
  let totalBytes = 0;

  for (const asset of orderedAssets) {
    totalBytes += asset.bytes;
    if (asset.bytes > largestAsset.bytes) largestAsset = asset;
  }

  return {
    assets: orderedAssets,
    assetCount: orderedAssets.length,
    largestAsset,
    totalBytes
  };
}

export async function inspectAssetDirectory(directory: string): Promise<AssetReport> {
  const assets = await collectAssets(directory);
  if (assets.length === 0) {
    throw new Error(`Production asset directory contains no files: ${directory}`);
  }
  return summarizeAssets(assets);
}

export function findAssetBudgetViolations(
  report: AssetReport,
  budget: AssetBudget = PRODUCTION_ASSET_BUDGET
): AssetBudgetViolation[] {
  const violations: AssetBudgetViolation[] = [];

  if (report.assetCount > budget.maxAssetCount) {
    violations.push({
      kind: "asset-count",
      actual: report.assetCount,
      limit: budget.maxAssetCount
    });
  }

  for (const asset of report.assets) {
    if (asset.bytes > budget.maxAssetBytes) {
      violations.push({
        kind: "asset-size",
        path: asset.path,
        actual: asset.bytes,
        limit: budget.maxAssetBytes
      });
    }
  }

  return violations;
}

export function formatAssetReport(report: AssetReport): string {
  return [
    "Production asset report",
    `Asset count: ${report.assetCount}`,
    `Largest asset: ${report.largestAsset.path} (${report.largestAsset.bytes} bytes)`,
    `Total bytes: ${report.totalBytes}`
  ].join("\n");
}

export function formatAssetBudgetViolation(
  violation: AssetBudgetViolation
): string {
  if (violation.kind === "asset-count") {
    return `Asset count ${violation.actual} exceeds limit ${violation.limit}.`;
  }

  const limitLabel = violation.limit === MAX_ASSET_BYTES ? " (16 MiB)" : "";
  return `Asset ${violation.path} is ${violation.actual} bytes, exceeding limit ${violation.limit} bytes${limitLabel}.`;
}

export async function runAssetReport(
  directory: string = DEFAULT_DIST_DIRECTORY,
  budget: AssetBudget = PRODUCTION_ASSET_BUDGET,
  logger: AssetReportLogger = console
): Promise<number> {
  try {
    const report = await inspectAssetDirectory(directory);
    logger.log(formatAssetReport(report));

    const violations = findAssetBudgetViolations(report, budget);
    if (violations.length > 0) {
      for (const violation of violations) {
        logger.error(`Asset budget violation: ${formatAssetBudgetViolation(violation)}`);
      }
      return 1;
    }

    logger.log("Asset budget check passed.");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Asset report failed: ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  const requestedDirectory = process.argv[2];
  const directory = requestedDirectory
    ? resolve(process.cwd(), requestedDirectory)
    : DEFAULT_DIST_DIRECTORY;
  process.exitCode = await runAssetReport(directory);
}
