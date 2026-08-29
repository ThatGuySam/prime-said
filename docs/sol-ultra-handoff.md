# Sol Ultra handoff

## Mission

Build Prime Said: a static-first Astro app that lets a user find a timestamped original video source for something ThePrimeagen said. Search transcript quotes locally with lexical + semantic retrieval, verify by playing the original YouTube embed at the timestamp, save moments, and assemble URL-shareable supercuts.

## Read first

Read `AGENTS.md`, then every document it lists. Accepted ADRs are constraints. If implementation evidence conflicts with one, stop and propose a superseding ADR with measurements.

## Locked choices

- Cloudflare **Workers Static Assets**, not Cloudflare Pages or deprecated Workers Sites.
- Native Cloudflare GitHub integration / Workers Builds. Production build `bun run build`; deploy `bunx wrangler deploy`; preview `bunx wrangler versions upload`. No Cloudflare token in GitHub Actions.
- `wrangler.jsonc` at repo root; dashboard Worker name must be `prime-said`.
- Bun for the project. Deno only as yt-dlp's supported EJS subprocess runtime.
- Astro static HTML for app shell and curated pages.
- Browser-side search in Web Workers; no runtime LLM/vector database/search API.
- Lexical search before model readiness; stable first six lexical cards plus a reserved semantic section. Once ready, new queries render one fused order.
- Committed normalized transcripts/manifests/corrections/gold data. Never commit embeddings, models, audio, or video.
- Original platform hosts playback. Show quote + original timestamp link; lazy-load embeds.
- A moment is stable content identity; appearances are source copies. Prefer available official longest-context appearance.
- MIT code/docs with separate third-party data/media notice.

## Technical defaults

- ASR: `mlx-community/parakeet-tdt-0.6b-v3` on Apple Silicon; pin exact model revision/runtime after first verified fixture.
- yt-dlp: last verified official nightly with bundled EJS; classified failure retries latest official nightly then official master, validates, and only then updates the pin.
- Chunking experiment default: sentence-aware 35–55 seconds, 12–18 seconds overlap.
- Lexical: compact BM25 typed-array inverted index.
- Fusion: weighted reciprocal-rank fusion plus capped exact/canonical/confidence/diversity boosts.
- Semantic model: do not preselect. Benchmark Snowflake Arctic Embed XS/S/M and Ternlight Mini/Base plus deployable controls against the golden suite.
- Document vectors: try int8; exact scan baseline, then centroid filtering and pure TypeScript HNSW. A small WASM control is allowed if it wins materially.
- Static assets: fail build over 16 MiB per file or 5,000 production files. Target semantic first download ≤100 MB; hard product tolerance 300 MB only with explicit UX.

## Phase 0 task

Implement only Phase 0 from `docs/implementation-plan.md`:

1. Scaffold Astro with Bun and a committed lockfile.
2. Preserve and validate root `wrangler.jsonc` for `dist/` Workers Static Assets.
3. Add corpus directories, schema validator, unit-test setup, and build asset-limit check.
4. Materialize the three TDD source clues from `evals/candidates/tdd-seed.json` without treating remembered intent as transcript text.
5. Add a deterministic synthetic benchmark generator for 25k/100k/225k/450k 384-dimensional vectors; do not commit generated vectors.
6. Make `bun run check`, tests, Astro build, and Wrangler dry-run pass.
7. Update documentation only where implementation facts require it.

## Completion receipt

Return:

- immutable commit SHA;
- files/behavior added;
- commands run and results;
- asset count/largest asset from dry run;
- known blockers and exact next Phase 1 slice;
- any proposed ADR supersession, with evidence.

Do not start ingestion or app UI beyond the minimum scaffold in the same change.
