# ADR 0001: Workers Static Assets with native Git integration

**Status:** Accepted  
**Date:** 2026-08-29

## Context

The app should be effectively static, cheap, durable, deployable from a phone, and free of a GitHub-held Cloudflare API token. Cloudflare Pages and deprecated Workers Sites are outside the chosen path.

## Decision

Astro builds `dist/`, deployed through Cloudflare Workers Static Assets using root `wrangler.jsonc`. Connect the GitHub repository through native Workers Builds. Use Bun build/deploy commands. Static matches bypass Worker execution; an optional tiny Worker may handle canonical share/topic routes.

Internal limits are 16 MiB per asset, 5,000 files, and 1 MiB compressed Worker script.

## Consequences

- Normal search traffic has no origin/search compute.
- Cloudflare manages build credentials; GitHub Actions does not deploy.
- Models/indexes require sharding below Cloudflare's 25 MiB asset maximum.
- Dashboard Worker name must match `prime-said`.
