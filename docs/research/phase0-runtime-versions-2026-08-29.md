# Phase 0 runtime versions

**Date:** 2026-08-29
**Scope:** Astro, Bun, Wrangler, and the static Workers deployment boundary.

## Decision

- Pin Astro `7.2.9`, released 2026-08-27. Astro supports the current and previous major, so the earlier Astro 5 candidate is no longer suitable.
- Pin Wrangler `4.127.1`, released 2026-08-28.
- Keep Bun `1.2.15`. It is the repository contract and the current default in the Cloudflare Workers Builds image.
- Pin CI to Node `24.18.0`, the current Workers Builds default, because Astro 7 requires Node 22.12 or newer even when Bun owns package management and scripts.
- Do not install `@astrojs/cloudflare` for the static build. Astro writes `dist/`; Wrangler publishes that directory through `assets.directory`.
- Keep Astro and Wrangler commands on their normal Node shebang path. Do not force them through Bun's runtime with `--bun`.

The frozen install, Astro check, build, and Wrangler dry run remain the compatibility test. The vendors do not publish a formal guarantee for every Astro and Bun version pair.

## Dry-run limits

`wrangler deploy --dry-run` walks and hashes `dist`, checks Cloudflare's per-asset rules, builds the local upload form, and exits before upload. It does not check account-plan quotas, compare files with a remote deployment, produce a preview URL, or enforce Prime Said's lower 16 MiB and 5,000-file limits. `scripts/report-assets.ts` owns those project limits.

Wrangler's `Total Upload` line describes the generated Worker bundle. It is not the total byte count of Static Assets. The project asset report is the source for count, largest file, and total bytes.

## Sources

- [Astro 7.2.9 release](https://github.com/withastro/astro/releases/tag/astro%407.2.9)
- [Astro upgrade and support guidance](https://docs.astro.build/en/upgrade-astro/)
- [Astro Cloudflare deployment guide](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [Astro's Bun recipe](https://docs.astro.build/en/recipes/bun/)
- [Wrangler 4.127.1 release](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.127.1)
- [Cloudflare Workers Builds image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Bun 1.2.15 release](https://bun.sh/blog/bun-v1.2.15)
