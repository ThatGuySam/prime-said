# Prime Said

Prime Said is a static-first, in-browser search engine for finding a timestamped source for something ThePrimeagen said. It combines exact transcript search with semantic retrieval, shows the quote before the embed, and links back to the longest available original source.

The first public demo is the playful claim that Prime is secretly a test-driven-development stan. The product is broader: search a creator's corpus, verify the words in context, save moments, and assemble shareable supercuts without a search server or per-query bill.

## Status

This repository currently contains the decision-ready product and engineering specification. Implementation starts with the vertical slice in [docs/implementation-plan.md](docs/implementation-plan.md).

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
bun run check
```

The root [`wrangler.jsonc`](wrangler.jsonc) is the production contract for a future Astro `dist/` build. Cloudflare's native Git integration should use `bun run build` and `bunx wrangler deploy` after the implementation adds the Astro build script and lockfile.

## Licensing

Code and original documentation are MIT licensed. Transcript data, thumbnails, names, and embedded media retain their source rights; see [DATA_NOTICE.md](DATA_NOTICE.md). This is an unofficial fan project and is not affiliated with ThePrimeagen, YouTube, Twitch, or Cloudflare.
