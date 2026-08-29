# Prime Said

Prime Said is a static-first, in-browser search engine for finding a timestamped source for something ThePrimeagen said. It combines exact transcript search with semantic retrieval, shows the quote before the embed, and links back to the longest available original source.

The first public demo is the playful claim that Prime is secretly a test-driven-development stan. The product is broader: search a creator's corpus, verify the words in context, save moments, and assemble shareable supercuts without a search server or per-query bill.

## Status

Phase 0 implementation is in progress. The repository contains the static Astro scaffold, decision-ready product and engineering specification, deterministic validation and benchmark tooling, and a bounded `/review/` locator over 1,753 real YouTube auto-caption segments. The locator is source-review tooling: its literal caption matches are not verified quotations, speaker claims, or Phase 2 product search. Canonical ingestion and retrieval have not started; progress and measured gates live in [docs/progress.md](docs/progress.md).

## Caption review preview

The `/review/` route searches the three complete, hash-locked English auto-caption tracks used by the TDD source investigation. Every result links to the recording timestamp and keeps the machine-caption, speaker, and word-origin warnings visible. Known chat or screen-reading windows are conservatively surfaced as possible quoted sources.

The checked-in [interaction GIF](docs/artifacts/prime-said-transcript-search-demo.gif) and [still preview](docs/artifacts/prime-said-transcript-search-preview.jpg) were captured from the functional review interface. They demonstrate deterministic browser search; they are not source-verification evidence.

## Non-negotiable constraints

- Astro produces static HTML and versioned search assets.
- Cloudflare Workers Static Assets hosts the app. Do not use Cloudflare Pages or deprecated Workers Sites.
- Search runs locally in a Web Worker. The server does not embed or rank ordinary queries.
- Lexical results work immediately; semantic retrieval joins after its model is ready without moving a result already under the user's thumb.
- Source transcripts and derived metadata are committed. Embeddings are reproducible build artifacts and are not committed.
- Bun is the default JavaScript runtime. Deno is allowed only as yt-dlp's supported EJS runtime.
- The original platform remains the video host. Prime Said embeds and deep-links; it does not redistribute video.

## Document map

| Start here | Purpose |
| --- | --- |
| [PRD](docs/prd.md) | Product, users, scope, success, and acceptance criteria |
| [Architecture](docs/architecture.md) | System boundaries, asset budgets, deployment, and caching |
| [Data model](docs/data-model.md) | Moments, appearances, transcripts, deduplication, and IDs |
| [Ingestion](docs/ingestion.md) | Discovery, yt-dlp policy, Parakeet, incremental updates, and failures |
| [Search](docs/search.md) | Chunking, indexes, ranking, pivots, and performance tiers |
| [Evals](docs/evals.md) | Golden sets and the model/ranker selection harness |
| [UX](docs/ux.md) | Mobile flow, progressive enhancement, quote-first cards, and collections |
| [SEO and policy](docs/seo-attribution-takedown.md) | Indexable pages, attribution, removals, and source health |
| [Operations](docs/operations.md) | Phone-friendly Cloudflare setup, cache keys, updates, and rollback |
| [Implementation plan](docs/implementation-plan.md) | Ordered work, gates, and definition of done |
| [Sol Ultra handoff](docs/sol-ultra-handoff.md) | Compact operating brief for a new coding session |
| [ADRs](docs/decisions/README.md) | Locked architectural decisions |
| [Research](docs/research/README.md) | Dated evidence and estimates |

## Quick checks

```sh
bun install --frozen-lockfile
bun run check
bun run test
bun run build
bun run deploy:dry-run
```

The root [`wrangler.jsonc`](wrangler.jsonc) publishes Astro's static `dist/` output through Workers Static Assets. Cloudflare's native Git integration uses `bun run build` and `bunx wrangler deploy`; GitHub Actions does not hold a Cloudflare deployment token.

## Licensing

Code and original documentation are MIT licensed. Transcript data, thumbnails, names, and embedded media retain their source rights; see [DATA_NOTICE.md](DATA_NOTICE.md). This is an unofficial fan project and is not affiliated with ThePrimeagen, YouTube, Twitch, or Cloudflare.
