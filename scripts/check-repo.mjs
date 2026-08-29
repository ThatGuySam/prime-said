import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const required = [
  "README.md",
  "DATA_NOTICE.md",
  "bun.lock",
  "astro.config.ts",
  "wrangler.jsonc",
  "src/pages/index.astro",
  "docs/prd.md",
  "docs/architecture.md",
  "docs/data-model.md",
  "docs/ingestion.md",
  "docs/search.md",
  "docs/evals.md",
  "docs/ux.md",
  "docs/seo-attribution-takedown.md",
  "docs/implementation-plan.md",
  "docs/sol-ultra-handoff.md",
  "docs/progress.md",
  "evals/candidates/tdd-seed.json",
  "evals/gold/README.md"
];

const errors = [];
for (const path of required) {
  try {
    await stat(join(root, path));
  } catch {
    errors.push(`Missing required file: ${path}`);
  }
}

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
).split("\0").filter(Boolean);

const forbiddenPaths = [
  /^\.astro\//,
  /^\.wrangler\//,
  /^artifacts\//,
  /^dist\//,
  /^downloads\//,
  /^models\//,
  /^corpus\/generated\//,
];
const forbiddenExtensions = /\.(?:aac|flac|m4a|mkv|mov|mp3|mp4|onnx|safetensors|wav|webm)$/i;

for (const name of repositoryFiles) {
  const path = join(root, name);
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (info.size > 16 * 1024 * 1024) {
    errors.push(`${name} is ${(info.size / 1024 / 1024).toFixed(1)} MiB; repository files must stay at or below 16 MiB.`);
  }
  if (forbiddenPaths.some((pattern) => pattern.test(name)) || forbiddenExtensions.test(name)) {
    errors.push(`Forbidden generated, model, or media artifact in repository: ${name}`);
  }
  if (name.endsWith(".json")) {
    try {
      JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      errors.push(`Invalid JSON in ${name}: ${error}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Prime Said repository checks passed.");
