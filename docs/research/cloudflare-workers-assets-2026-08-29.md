# Cloudflare Workers Static Assets research

> **Tease:** Workers Static Assets supports the desired static app and phone-friendly GitHub deployment, but every model/index file must be below 25 MiB.  
> **Lede:** Use native Workers Builds, root `wrangler.jsonc`, Bun, and 8–16 MiB immutable shards.  
> **Why it matters:** This removes GitHub deploy secrets and search compute while keeping the full corpus deployable.  
> **Go deeper:** Cloudflare's current Free limits are 20,000 assets, 25 MiB per asset, a 3 MB Worker script, and 128 MB Worker memory.

**Date:** 2026-08-29  
**Question:** Can Prime Said run as a static Astro app on Workers, deploy from Cloudflare's GitHub UI, and host a large client search payload safely?

## Findings

- Static asset matches are served without invoking Worker code. A Worker handler is optional for unmatched/dynamic routes.
- Native Git integration connects a GitHub repository from the Cloudflare dashboard, builds on pushes, and creates preview versions. The dashboard Worker name must equal `wrangler.jsonc` `name`.
- Workers Builds manages its deployment credential. This avoids a Cloudflare token in GitHub Actions and is compatible with phone setup.
- The build image includes Bun (default documented as 1.2.15 on the research date) and supports a `BUN_VERSION` override.
- Static assets are capped at 25 MiB each. Free includes 20,000 assets per version; Paid allows 100,000 with Wrangler 4.34.0 or newer. Worker script limits are 3 MB Free/10 MB Paid.
- Workers Builds build/deploy commands are dashboard configuration; do not assume Wrangler custom build configuration controls the remote build environment.

## Recommendation

- Internal file limit: 16 MiB; preferred shard 8–12 MiB.
- Internal asset-count limit: 5,000 until measured corpus output proves a need.
- Pin Bun in both `package.json` and dashboard build variable.
- Production commands: `bun run build`, then `bunx wrangler deploy`; preview `bunx wrangler versions upload`.
- Use content-addressed model/index shards with a small version manifest and atomic browser activation.
- Avoid Cloudflare Pages and deprecated Workers Sites for this repository. This memo does not claim all Pages service is deprecated; it records the selected Workers path.

## Source quality

All limit, build-image, and integration claims use current primary Cloudflare documentation. No community claim overrides those limits.

## Sources

- [Cloudflare Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Workers Builds build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Wrangler deprecations](https://developers.cloudflare.com/workers/wrangler/deprecations/)
- [Migrate from Pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
