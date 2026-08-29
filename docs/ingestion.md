# Ingestion and transcription specification

## Goals

The ingestion pipeline must be cheap, resumable, reproducible, and boring to maintain. It discovers only approved sources, produces timestamped transcripts without the YouTube Data API, survives ordinary extractor breakage, and never makes the public app depend on a daily job succeeding.

## Source policy

The first allow-list contains the official `ThePrimeTimeagen` YouTube channel. Later entries may include official channels, named interviews, or creator appearances approved through a structured pull request. Do not crawl arbitrary clip channels by keyword.

Each allow-list entry declares:

- stable channel/playlist URL and platform ID;
- ownership category (`creator-official`, `host-official`, `approved-third-party`);
- permitted discovery modes;
- whether the source may become canonical;
- optional date or playlist bounds;
- review owner and rationale.

## Two operating lanes

### Daily discovery lane

- Runs once daily or on manual dispatch.
- Uses yt-dlp flat-playlist extraction against the newest page/window (initially 24 items).
- Compares platform IDs to committed source records.
- Adds missing IDs to a deterministic queue.
- Does not rescan or re-transcribe the full library.
- If no IDs are new, exits without creating a commit or deployment.

The 24-item window comfortably exceeds expected daily uploads. A missed item can be proposed manually and the backfill lane will catch historical gaps.

### Backfill lane

- Runs manually or on a conservative schedule.
- Advances a durable cursor by up to 10 previously unseen source IDs per run.
- Uses playlist pagination only when yt-dlp exposes a verified, stable continuation behavior.
- If reliable pagination cannot be confirmed, scans the flat ID list, hashes it, and performs only metadata work needed to select the next 10; it never downloads the whole library on every run.
- Backs off on HTTP 429/403 and stops rather than escalating request pressure.

Durability beats completeness speed. The initial library can be transcribed from a Mac in larger resumable batches.

## yt-dlp runtime policy

Bun is the project runtime, but it is not the yt-dlp EJS runtime. Current yt-dlp guidance recommends Deno and deprecates newer Bun versions for EJS challenges. Therefore:

- install yt-dlp with its default extras so the matching `yt-dlp-ejs` scripts are bundled;
- invoke yt-dlp with a pinned Deno runtime for EJS only;
- do not enable arbitrary remote EJS components by default;
- run yt-dlp/Deno in an isolated temporary work directory with only required write paths;
- record yt-dlp, EJS package, Deno, ffmpeg, extractor arguments, and cookies/auth mode in the run manifest;
- never commit cookies or browser profiles.

### Version fallback

The normal path uses the last verified official nightly pin. This matches yt-dlp's own recommendation that nightly is the normal channel while preserving reproducibility.

On a classified extraction failure:

1. retry the same pin with exponential backoff for transient network/server errors;
2. if the signature matches known YouTube extraction/challenge failures, fetch the latest official nightly and retry once;
3. if still broken, retry the official `master` build once;
4. validate source ID, duration, title, audio decodability, and a short transcript smoke segment;
5. promote the new pin only through a commit after validation;
6. otherwise open a failure report and leave the existing public corpus untouched.

Never cycle through untrusted forks or silently fetch a new executable on every successful run.

## Media acquisition

- Fetch metadata first.
- Reuse a previously verified transcript when the source media fingerprint and pipeline revision match.
- Download the lowest-bandwidth audio that preserves speech quality, not full video.
- Download thumbnail only when needed and permitted; prefer source-hosted thumbnail references.
- Verify duration and decodability before transcription.
- Delete temporary audio after transcript, fingerprints, and integrity reports are durably written.
- A local operator may retain a bounded recoverable cache outside Git when storage permits; the canonical pipeline does not depend on it.

## ASR default

Preferred Apple Silicon path:

- model: `mlx-community/parakeet-tdt-0.6b-v3`;
- base model lineage: `nvidia/parakeet-tdt-0.6b-v3`;
- runtime: the latest verified stable `parakeet-mlx` combination pinned after the first successful fixture;
- output: word or segment timestamps, punctuation, capitalization, language, and confidence when available.

Parakeet TDT 0.6B v3 is the starting point because it supports punctuation/capitalization, timestamps, long audio handling, and Apple Silicon acceleration. It is not permanently privileged: a replacement must beat it on the transcript and timestamp evals.

### Long audio

Process long audio in bounded segments (initially 20–30 minutes) with 10–20 seconds of overlap. Reconcile duplicate overlap tokens using timestamp proximity and normalized text alignment. A failed segment can retry without redoing the video. Preserve source-relative time through every conversion.

## Normalization and enrichment

The deterministic pass:

1. fixes encoding and whitespace;
2. normalizes punctuation/casing for display without deleting the raw ASR form;
3. applies versioned technical-term corrections only when context and confidence rules pass;
4. extracts candidates for people, products, programming languages, libraries, phrases, and topics;
5. creates sentence boundaries and pause features;
6. computes text shingles and acoustic fingerprints for duplicate proposals;
7. validates timestamp monotonicity and duration bounds.

A one-time ChatGPT Sol run may propose additional corrections, entities, golden moments, topics, and query phrasings. Its output is a reviewable patch with evidence and timestamps. No LLM is part of the recurring pipeline.

## GitHub Actions budget and caching

GitHub-hosted Actions is appropriate for daily discovery, metadata, schema checks, and small incremental transcription experiments. It is not guaranteed to transcribe a long upload within a five-minute daily budget on CPU. The design supports three modes:

| Mode | Best use | Tradeoff |
| --- | --- | --- |
| Apple Silicon local runner | Initial backfill and reliable Parakeet MLX transcription | Requires maintainer machine when new audio needs transcription |
| GitHub-hosted CPU | Discovery, short clips, validation, fallback ASR benchmarks | Slow for 0.6B full-length videos; minutes budget may be exceeded |
| Self-hosted Mac Actions runner | Automatic incremental Parakeet MLX with GitHub queue | Machine availability and security maintenance |

Cloudflare Workers AI is not the default because model availability, billing, transcript fidelity, and timestamp behavior would become platform dependencies. It can be benchmarked later behind the transcript interface.

### Cache design

GitHub's default cache budget is 10 GB per repository and unused entries expire after seven days. The Parakeet MLX model is roughly 2.5 GB, so cache cardinality must be controlled.

- Cache one production ASR model revision, not every candidate.
- Key: `asr-${runner.os}-${runner.arch}-${model-id}-${model-revision}-${runtime-lock-hash}`.
- Restore prefix only within the same model ID; never accept an unverified model revision from a broad prefix.
- Cache model/runtime downloads, yt-dlp binary/package, Deno, and ffmpeg when licensing and action tooling allow.
- Cache writes only on trusted `main`/manual workflows. Pull requests restore but do not populate executable caches.
- Do not cache media, transcripts awaiting review, cookies, secrets, or arbitrary EJS code.
- Keep embedding-model eval caches separate and manually prunable; run candidates in batches to avoid cache thrashing.
- A weekly trusted discovery run touches the production model cache if GitHub-hosted transcription remains enabled.

Caching saves download time, not ASR compute. Cache reports must show hit/miss and total estimated footprint.

## Idempotency and commits

Every job writes to a temporary run directory and produces a run manifest. Committed changes are created only after validation. Rerunning the same source with the same media fingerprint and pipeline revision yields the same normalized transcript IDs.

Automated PRs should be small and reviewer-friendly:

- one summary with new/changed/failed sources;
- generated schema and integrity report;
- transcript diffs collapsed by source;
- no unrelated regenerated corpus files;
- clear eval impact;
- a maintainer can approve without running local media processing.

## Failure classification

| Class | Retry | Escalation |
| --- | --- | --- |
| Network timeout / 5xx | Exponential backoff with jitter, capped | Stop after bounded attempts |
| 429 / rate limit | Long backoff; stop batch | Resume next scheduled run |
| Extractor/EJS signature failure | Version fallback policy | Pin validated update or open issue |
| Source private/deleted | No repeated download attempts | Mark unavailable and rebuild source health |
| Copyright/region block | No circumvention | Mark limited/unavailable |
| Audio decode | Retry alternate official audio format once | Record failure fixture |
| ASR segment crash/OOM | Smaller segments, one retry | Local Mac queue or model fallback |
| Schema/timestamp integrity | Never publish | Quarantine artifact for review |

## Acceptance criteria

- A daily run examining no more than the configured newest window finds a new official upload and queues it.
- A rerun does not redownload/retranscribe unchanged sources.
- A known extractor fixture exercises stable pin → latest nightly → master fallback without promoting an invalid version.
- Transcript word/segment times remain source-relative after segmentation.
- No downloaded media, model weight, cookie, token, or embedding enters Git.
- A source failure cannot break the currently deployed corpus.
- The cache plan remains below the default 10 GB GitHub repository cache budget in steady state.
