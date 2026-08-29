# Sol Ultra implementation workflow research

> **Tease:** Ultra helps most when independent work can run in parallel, but a large autonomous implementation still needs one objective, phase gates, and evidence on disk.  
> **Lede:** Use Sol Ultra with a durable goal, the existing specification, one writer per area, logical commits, continuous checks, and a progress log that survives context compaction.  
> **Why it matters:** "Build everything" invites broad rewrites and false completion. Prime Said has hardware, source-review, credential, and deployment gates that an agent must report rather than invent.  
> **Go deeper:** Authorize progress across phases, but require each phase to pass its acceptance gate before the next begins. Let subagents do independent research, inspection, benchmarks, and review without sharing write ownership.

**Date:** 2026-08-29  
**Scope:** Current guidance for handing the Prime Said repository to GPT-5.6 Sol in Ultra mode for long-running implementation.

## Short answer

Use Sol Ultra because Prime Said contains separable research, implementation, benchmark, and review work. Do not rely on Ultra itself as the control system. The repository already has the important pieces: `AGENTS.md`, accepted ADRs, a phase plan, measurable gates, and a focused first implementation task. Add one master goal that resolves scope conflicts, requires a persistent progress file, limits overlapping writes, and defines when to stop.

## Evidence

OpenAI's current model guidance says Ultra uses automatic subagent delegation and is useful for work that divides into independent tasks. OpenAI's long-running-work guidance says a goal needs an outcome, constraints, and verification. It recommends `/goal` for a durable objective and says a good goal is smaller than a loose backlog.

OpenAI's published long-horizon run used a specification, checkpointed plan, operating runbook, continuous tests/lint/typecheck/build, and a live audit log. Its conclusion is useful here: the reliability came from those files and checks, not one clever prompt.

Practitioner reports on Hacker News and OpenAI's GitHub discussions largely agree that detailed design docs, `AGENTS.md`, file-backed plans, and logical commits help long sessions stay focused. The counterpoint matters too. Experienced users report that unconstrained agents can solve the wrong problem aggressively, and that long runs magnify the cost of a wrong decision. This supports phase gates and reversible commits, not a single giant change.

## What works

- Start from the repository and exact commit, not a pasted restatement of the whole design.
- Give one verifiable project objective and point at the authoritative files.
- Resolve conflicts explicitly. The original handoff says Phase 0 only; the master goal may authorize later phases only after each gate passes.
- Keep `docs/progress.md` current with completed work, evidence, decisions, blockers, and next checkpoint.
- Use Ultra delegation for independent read-only research, codebase inspection, benchmark design, and final review.
- Give one agent ownership of overlapping source files during a phase.
- Commit each completed phase or coherent slice separately.
- Run the smallest relevant check after each change and the full phase gate before committing.
- Report commands and actual output. Do not count an unrun check as passing.

## What to avoid

- A fixed number of subagents or forced delegation where the work is sequential.
- Parallel branches editing the same files.
- Treating compilation as proof of product behavior.
- Retuning tests or gold data to make an implementation pass.
- Silent changes to ADRs, source policy, legal policy, or performance gates.
- Uploading, deploying, creating credentials, or contacting people without current authorization.
- Pretending an iPhone benchmark, source listening review, or Apple Silicon ASR run happened when the environment cannot perform it.
- Continuing into full-corpus backfill before the vertical slice proves the data and search path.

## Recommendation

Run the master prompt in the ChatGPT desktop app with GPT-5.6 Sol and Ultra selected. Use `/goal` when available. Attach or open the committed repository, then keep the work in the same chat. The goal should advance through every safe, verifiable phase, but leave explicit gates for GitHub repository creation, Cloudflare account setup, source listening, M2 Max transcription, and reference-iPhone measurements when those capabilities are absent.

## Sources

- [OpenAI: models and Ultra mode](https://learn.chatgpt.com/docs/models)
- [OpenAI: long-running work](https://learn.chatgpt.com/docs/long-running-work)
- [OpenAI: follow a goal](https://learn.chatgpt.com/use-cases/follow-goals)
- [OpenAI: prompting Codex](https://learn.chatgpt.com/docs/prompting)
- [OpenAI: run long-horizon tasks with Codex](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex)
- [OpenAI Cookbook: ExecPlans and PLANS.md](https://github.com/openai/openai-cookbook/blob/main/articles/codex_exec_plans.md)
- [HN: design docs, AGENTS.md, and long `/goal` runs](https://news.ycombinator.com/item?id=48965850)
- [HN: logical commits and the case against unchecked long runs](https://news.ycombinator.com/item?id=48947776)
- [HN: Codex works best for hard tasks with strong verification](https://news.ycombinator.com/item?id=45983533)
- [OpenAI Codex discussion: plan and spec modes](https://github.com/openai/codex/discussions/7355)
