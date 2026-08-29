# ADR 0005: Bun default with a Deno yt-dlp boundary

**Status:** Accepted  
**Date:** 2026-08-29

## Context

Bun is preferred for project simplicity and is available in Workers Builds. Current yt-dlp documentation recommends Deno for YouTube EJS challenges and deprecates newer Bun releases for that role.

## Decision

Use Bun for package management, Astro, scripts, tests, build, and deployment. Install a pinned Deno only for the isolated yt-dlp EJS subprocess, using bundled matching EJS scripts.

## Consequences

- The app has one main runtime.
- Ingestion carries a narrow second executable but follows supported yt-dlp behavior.
- Expanding Deno beyond extraction requires a new decision.
