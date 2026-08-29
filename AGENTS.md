# Agent operating guide

Prime Said is intentionally constrained. Before implementation, read these files in order:

1. `docs/prd.md`
2. `docs/architecture.md`
3. `docs/data-model.md`
4. `docs/ingestion.md`
5. `docs/search.md`
6. `docs/evals.md`
7. `docs/ux.md`
8. `docs/seo-attribution-takedown.md`
9. `docs/implementation-plan.md`
10. every accepted ADR in `docs/decisions/`

## Working rules

- Use Bun for package management, scripts, tests, and the Astro build.
- Use Deno only when invoking yt-dlp's EJS challenge solver. Do not expand Deno into a second application runtime.
- Keep the hosted app static-first. A Worker request handler is allowed only for canonical share routes, first-request rendering, or tiny routing concerns that add unique value.
- Never add a runtime LLM, hosted vector database, YouTube Data API dependency, or per-query backend without a new ADR and an explicit product decision.
- Do not commit embeddings, downloaded audio, downloaded video, model weights, or browser build output.
- Do commit normalized transcripts, source manifests, hand-reviewed corrections, and golden eval cases.
- Preserve stable IDs. A moment is independent from any one upload; an appearance represents a particular source copy.
- A result must expose the transcript quote, source title, timestamp, and direct original-platform link before or beside the embed.
- Search ranking changes require the golden eval suite and mobile latency benchmark.
- Prefer the smallest implementation that meets the acceptance criteria. Experimental indexes must live behind benchmarkable interfaces.
- Treat accepted ADRs as constraints. Supersede them with a new ADR; do not silently rewrite history.

## Verification before committing implementation

- `bun run check`
- unit tests for changed deterministic code
- golden retrieval evals for ranking/chunking/model changes
- corpus integrity checks for ingestion/schema changes
- an average-or-worse iPhone smoke test for browser model/index changes
- `wrangler deploy --dry-run` and static asset limit checks for deployment changes
