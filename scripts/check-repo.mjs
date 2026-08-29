import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const required = [
  "README.md",
  "DATA_NOTICE.md",
  "wrangler.jsonc",
  "docs/prd.md",
  "docs/architecture.md",
  "docs/data-model.md",
  "docs/ingestion.md",
  "docs/search.md",
  "docs/evals.md",
  "docs/ux.md",
  "docs/seo-attribution-takedown.md",
  "docs/implementation-plan.md",
  "docs/sol-ultra-handoff.md"
];

const errors = [];
for (const path of required) {
  try {
    await stat(join(root, path));
  } catch {
    errors.push(`Missing required file: ${path}`);
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "dist", ".cache"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

for (const path of await walk(root)) {
  const name = relative(root, path);
  const info = await stat(path);
  if (info.size > 16 * 1024 * 1024) {
    errors.push(`${name} is ${(info.size / 1024 / 1024).toFixed(1)} MiB; hosted assets must be sharded to 16 MiB or less.`);
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
