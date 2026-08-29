# Implementation plan and acceptance gates

## Strategy

Build one end-to-end slice before backfilling the channel. The first slice proves ingestion, timestamp fidelity, committed transcript shape, browser retrieval, quote-first playback, static deployment, and one curated TDD supercut. Only then scale corpus volume and optimize indexes.

## Phase 0 — repository and fixtures

**Deliverables**

- Astro/Bun project scaffold and lockfile.
- Root `wrangler.jsonc` retained as the Workers Static Assets deployment contract.
- Schema validation and corpus directory layout.
- Three TDD source metadata fixtures and manually verified timestamp spans.
- Benchmark harness that can generate synthetic 25k/100k/225k/450k vector corpora.

**Gate**

- `bun run check`, unit tests, and `wrangler deploy --dry-run` pass.
- Cloudflare build output contains no asset over 16 MiB.

## Phase 1 — ingestion vertical slice

**Deliverables**

- Pinned yt-dlp + bundled EJS + isolated Deno command wrapper.
- Source metadata discovery without YouTube Data API.
- Temporary audio download, ffmpeg normalization, Parakeet MLX segmentation, timestamp reconciliation, and transcript JSON.
- Normalization dictionary and correction patch format.
- Source health and run manifest.
- Deduplication proposal report for the three seed sources.

**Gate**

- Each TDD moment appears in committed transcript data at the verified time.
- Timestamp drift p95 ≤2.5 seconds on the seed fixtures.
- Rerun is idempotent and skips unchanged work.
- No media/model/embedding blob is staged by Git.

## Phase 2 — baseline browser search

**Deliverables**

- Sentence-aware chunk generator.
- TypeScript BM25 index and sharded manifest.
- Web Worker query execution.
- Mobile quote-first result list with highlight, more context, and timestamp link.
- Search history in local storage.

**Gate**

- Exact/near-exact TDD queries find the known moments in top 3.
- Lexical p95 <100 ms after readiness on the reference iPhone.
- App remains responsive and works offline for cached text/search.

## Phase 3 — semantic model bake-off

**Deliverables**

- Frozen 50+ query development suite and held-out split.
- Model download/build adapters for Snowflake and Ternlight candidates plus controls.
- Browser query benchmark page and automated results JSON.
- Int8 vector build, exact scan benchmark, centroid prefilter, pure TypeScript HNSW experiment, and optional small WASM control.
- RRF fusion and duplicate/diversity pass.

**Gate**

- Selected model/index passes all selection gates in `docs/evals.md`.
- Full-size 225k and projected 450k benchmark estimates are replaced by measured results.
- First semantic package stays ≤100 MB unless an ADR accepts a larger tier.
- Exact/near-exact retrieval does not regress materially.

## Phase 4 — stable progressive UX

**Deliverables**

- Background model download with progress, persistence, versioned atomic activation, and delete-data control.
- Fixed lexical first grid and reserved semantic-discovery section before readiness.
- Unified fused result rendering after readiness.
- Lazy embeds and failure fallback.
- Local collection editor and URL-encoded collection prototype.

**Gate**

- Search interaction CLS ≤0.05.
- No element under pointer/touch moves during delayed semantic completion tests.
- Repeat query p95 <250 ms when assets are cached; semantic-ready p95 <750 ms.
- One unavailable collection item does not block the rest.

## Phase 5 — curated public demo and SEO

**Deliverables**

- TDD topic page, three reviewed moment pages, and curated TDD supercut.
- Unique editorial copy, canonical URLs, sitemap, robots directives, Open Graph metadata, and eligible `VideoObject`/`Clip` JSON-LD.
- Methods, data notice, correction, takedown, and source proposal pages.
- Cloudflare native Git integration runbook and mobile setup checklist.

**Gate**

- Static HTML contains the meaningful quote/context without JavaScript.
- Structured data validates and matches visible content.
- No full transcript/video page competes with the original host.
- Native Workers Build succeeds from GitHub using Bun and no GitHub-held Cloudflare token.

## Phase 6 — controlled corpus expansion

**Deliverables**

- Initial official-channel backfill, resumable in batches.
- Daily newest-window discovery and 10-ID incremental historical backfill.
- Corpus/source health report, asset budget report, and golden-set expansion proposal.
- Content-addressed shard upgrade/resume behavior.

**Gate**

- Full first-channel corpus passes schema, eval, mobile memory/latency, and asset budgets.
- A no-change discovery run creates no commit/deploy.
- A deleted source rebuild promotes a valid alternate or removes the result.

## Phase 7 — community-ready open source

**Deliverables**

- Contributor source proposal template and generated transcript PR format.
- Reproducible local Mac ingestion guide.
- Trusted-cache GitHub workflows with controlled model cache cardinality.
- Engine/creator configuration boundary documented.
- One proof-of-concept second creator only after the engine boundary is real.

**Gate**

- A contributor can add an approved source without learning internal IDs manually.
- A maintainer can understand and approve a generated transcript PR in minutes.
- Creator-specific names, sources, examples, and curation are configuration/data rather than search-engine forks.

## Work that must not sneak into early phases

- server-side vector search;
- user accounts or cloud sync;
- full Twitch coverage;
- arbitrary topic page generation;
- a URL short-code database before URL payload measurements;
- multiple ASR production models in Actions cache;
- a generic multi-creator admin panel;
- runtime generative AI.

## First Sol Ultra session

Give Sol Ultra `docs/sol-ultra-handoff.md` and ask it to execute Phase 0 only. Require a commit with verification output, no speculative Phase 1 implementation, and a concise list of any conflicts with accepted ADRs. The next session handles Phase 1 after the fixtures and scaffold are reviewed.

## Definition of project done

Prime Said is never “finished,” but the initial project is done when a user on the reference iPhone can search the full approved channel corpus, scan and verify a timestamped quote, save/share a collection, explore the curated TDD supercut, and repeat searches instantly—while normal operation has no search backend bill and a maintainer can ignore the pipeline for a month without the deployed app failing.
