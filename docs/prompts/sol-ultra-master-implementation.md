# Sol Ultra master implementation prompt

Use this in the ChatGPT desktop app with GPT-5.6 Sol and Ultra selected. If Goal mode is available, keep the `/goal` prefix. Attach or open the committed Prime Said repository first.

```text
/goal Take the Prime Said repository from its current docs-first state to the most complete, verified, deployable implementation the available environment can support. Work through the accepted implementation phases in order. Keep working without waiting for routine approval until every achievable phase gate passes or a genuine human, credential, legal, platform, source-review, or hardware gate prevents further progress.

Repository identity

- Expected starting commit: 7ebe3c47fbd684aa7927eaab395d86a5faeb76a0 or a descendant containing the same specification pack.
- Canonical remote: https://github.com/ThatGuySam/prime-said on branch main.
- If I attached prime-said-repo.zip, extract it while preserving .git and work from the repository root.
- Inspect git status, branches, remotes, recent commits, and the full working tree before editing.
- Preserve unrelated user changes. Never reset, discard, rewrite, or overwrite work you did not create.
- If the expected repository, commit lineage, or required documents are missing, stop and report the exact mismatch.

Authoritative instructions

1. Read AGENTS.md completely.
2. Read every file AGENTS.md requires, including all accepted ADRs.
3. Read docs/sol-ultra-handoff.md, docs/implementation-plan.md, docs/evals.md, docs/operations.md, and docs/research/sol-ultra-workflow-2026-08-29.md.
4. Treat accepted ADRs and locked product choices as requirements. Do not silently reinterpret them.

This prompt expands the earlier handoff's execution authorization. Complete Phase 0 first. If its gate passes, continue into the next safe phase without waiting for a new prompt. Continue phase by phase as long as the next work is supported by the repository, available tools, and current authorization. Do not skip gates, fake evidence, or start a later phase to hide an incomplete earlier one.

Core objective

Deliver Prime Said as a static-first Astro application on Cloudflare Workers Static Assets. It must ingest approved ThePrimeagen sources into committed timestamped transcripts, search quotes locally with lexical and semantic retrieval, play the original source at the timestamp, save moments locally, create URL-shareable supercuts, and publish useful curated TDD pages. Ordinary search must not require a runtime LLM, hosted vector database, YouTube Data API, or per-query backend.

Operating method

- Before implementation, create or update docs/progress.md. Record the current phase, completed work, evidence, unresolved decisions, blockers, and the next checkpoint. Keep it current after every meaningful slice so another session can resume without rediscovery.
- Create a concrete execution plan from docs/implementation-plan.md. Keep the original acceptance gates unchanged unless implementation evidence supports a proposed superseding ADR.
- Use Ultra delegation only where work divides cleanly. Good delegated work includes independent read-only research, repository inspection, model or index experiments, benchmark analysis, test design, and final verification. Do not make subagents edit overlapping files or share ownership of one change. Keep one writer responsible for each source area and integrate results on the main working branch.
- Prefer small, reversible changes. Commit every completed phase or coherent verified slice separately with a descriptive message.
- Run the smallest relevant verification after each change. Run the complete phase gate before committing or moving forward.
- Diagnose failures and fix them when they are within scope. Do not weaken tests, gold judgments, schemas, accessibility requirements, asset budgets, or performance targets merely to make checks pass.
- Research current fast-changing implementation details using primary documentation and strong practitioner sources. Record durable findings and direct links in docs/research. Do not replace settled product decisions with trend-based suggestions.
- Use Bun for the project. Use pinned Deno only inside yt-dlp's EJS subprocess boundary.
- Never commit embeddings, model weights, downloaded audio/video, generated indexes, browser build output, cookies, tokens, or secrets.

Required phase discipline

- Phase 0 must produce the Bun/Astro scaffold, lockfile, corpus/schema structure, TDD fixtures, deterministic synthetic benchmark generator, passing repository checks/tests/build, and a successful Wrangler dry run with an asset report.
- Phase 1 must prove one end-to-end ingestion path before any library backfill. Pin yt-dlp, bundled EJS, Deno, ffmpeg, Parakeet model revision, and runtime. Keep media temporary. Preserve source-relative timestamps. Make reruns idempotent.
- Phase 2 must ship lexical search and the quote-first mobile result flow before semantic complexity.
- Phase 3 must select the browser embedding model and vector index from the frozen evals and measured reference-device constraints. Benchmark candidates. Do not preselect a winner or trust leaderboard claims.
- Phase 4 must prevent delayed result movement. Before semantic readiness, preserve the stable first six lexical results and fill only the reserved semantic section. After readiness, render one fused ordering for new queries.
- Phase 5 must provide static, useful, indexable curated pages without duplicating complete YouTube watch or transcript pages.
- Start Phase 6 full-corpus expansion only after the vertical slice, evals, mobile constraints, and asset budgets pass.
- Treat Phase 7 as complete only when a contributor can add an approved source through a small reviewable PR and creator-specific configuration is separate from the reusable engine.

External and human gates

- Do not claim a source quote or timestamp is verified unless you inspected the actual recording or a human-reviewed fixture establishes it.
- Do not claim an average-or-worse iPhone result from desktop simulation. Record simulated screening data separately and leave the reference-iPhone gate open.
- Prefer Apple Silicon for Parakeet MLX. If the current environment cannot run it, complete all code, fixtures, deterministic tests, documentation, and dry runs that do not require it. Record the exact command and expected artifact for the M2 Max run.
- Do not create accounts, API tokens, OAuth credentials, paid resources, public deployments, public posts, or messages. Prepare native Cloudflare Workers Builds configuration and phone setup instructions. Stop before the account-side action unless current authorization explicitly permits it.
- Push verified commits to the canonical GitHub remote. Use small reviewable PR branches when practical after the initial repository import. Do not force-push, rewrite shared history, or merge a PR whose required checks fail.

Verification and definition of done

For every phase, report the exact commands run and their actual results. At minimum use the checks required by AGENTS.md and docs/implementation-plan.md. Add regression tests for deterministic behavior. Validate schema and corpus integrity. Record asset count, largest asset, and total output size. Measure search components separately. Keep failures visible.

The project is done only when every applicable acceptance gate in docs/implementation-plan.md passes with evidence. If the environment blocks a gate, finish every independent task that remains, update docs/progress.md with a bounded continuation recipe, commit the verified work, and stop with a truthful blocker instead of a partial-success claim.

Final completion receipt

Return:

- current branch and immutable commit SHAs, grouped by phase;
- completed phase gates and the evidence for each;
- commands run with pass, fail, or not-run status;
- working product behavior and how to launch it;
- eval, performance, timestamp, and asset-budget results;
- files or generated artifacts intentionally excluded from Git;
- remaining human, source-review, device, credential, or deployment gates;
- the single next action that will unlock the most remaining work.
```
