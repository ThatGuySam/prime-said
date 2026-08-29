# Implementation progress

**Updated:** 2026-08-29 18:26 UTC
**Branch:** `main`
**Starting commit:** `7da26ba09eca71816a3ff077579f62f8c849036b`
**Published Phase 0 slice:** `f7ebba6aa6c347e1a38137689d460e9a013d3b3c`
**Published attribution research:** `44ac8354c73226949aac88324bc2928fa345402c`
**Published candidate-data correction:** `bf83640d1e7c39da6116642c920a41a20daad35a`
**Published attribution screening gate:** `cb54db16bf7c92441b0d439b6023671eebc64f83`
**Review-caption data slice:** `24e6d64c882495fda72bdd62c5e219c468ab33de`
**Transcript-review interface slice:** `171b470a1fe4253950c5a879e94fe291994b0f15`
**Published compact review interface:** `820a738950296b3557c283ca9ab5198271b7f597`
**Published retrieval regressions:** `25802c62091f5eabe89b8ea26322c35b729d992f`
**Published shadcn review interface:** `899f5e3821a898360ae1d54b7e3819df2b729e24`
**ChatGPT Sites preview:** <https://prime-said-search.thatguysam.chatgpt.site> (version 2 deployment succeeded)
**Required ancestor:** `4fb87576370a6228549751c91478d4f6b4a5158b`, verified with `git merge-base --is-ancestor`

## Current phase

Phase 0 remains blocked on recording-reviewed wording, vocal speaker, word
origin, and response boundaries. The bounded review locator searches all three
complete, hash-locked auto-caption tracks, but it does not promote those
captions to canonical transcripts or verified quotations.

Later-phase ingestion implementation has also landed on `main`: the backfill
runner and three source/transcript pairs now produce six canonical files that
pass schema and corpus validation. This is implementation progress, not a
Phase 0 or Phase 1 gate claim. This turn did not run Apple Silicon
transcription or measure timestamp drift against recording-reviewed spans.

The deployed review interface is now a React island assembled from local
shadcn primitives. It preserves native search and URL state, source filtering,
origin warnings, context, clipboard links, and the single-player invariant.
Continuous curves use CSS `corner-shape: superellipse(2)` where supported and
retain ordinary `border-radius` as the fallback.

A deterministic retrieval development screen now captures topic, stance,
word-origin, morphology, no-result, and duplicate-neighborhood regressions.
The strongest experimental ranker passed all 20 explicit constraints, up from
15/20 for the deployed ranker. It remains an offline, same-set-tuned experiment:
the production ranker was not changed because the frozen recording-reviewed
gold set and reference-iPhone latency gate are still open.

## Completed work

- Added a static Astro 7.2.9 scaffold with Bun 1.2.15, a frozen lockfile, and Wrangler 4.127.1.
- Kept `wrangler.jsonc` as an assets-only Workers contract for `dist/`. No Cloudflare adapter or Worker handler was added.
- Added the canonical corpus directory layout and a source-clue projection from
  `evals/candidates/tdd-seed.json`. Remembered text is explicitly paraphrase or
  topic intent; it carries no exact-match or relevance claim.
- Added JSON Schema validation, duplicate-ID and source-ID composition checks, timestamp integrity checks, transcript-backed moment-quote and availability checks, and fixture drift detection.
- Added a deterministic streaming generator for 25k, 100k, 225k, and 450k corpora of 384-dimensional float32 vectors. Output names the corpus schema and source revision, is sharded below 16 MiB, and stays under ignored `corpus/generated/embeddings/`.
- Added production asset reporting for count, largest file, total bytes, the 16 MiB file ceiling, and the 5,000-file ceiling.
- Updated CI to use immutable action revisions, pin Node 24.18.0 and Bun 1.2.15, install from the frozen lockfile, check, test, build, and run the Wrangler dry run.
- Recorded current runtime pins, Phase 1 toolchain candidates, and the TDD auto-caption screening in `docs/research/`.
- Recorded a deterministic quoted-source attribution design in `docs/research/quoted-source-attribution-2026-08-29.md`. It separates vocal speaker from word origin, treats the user's remembered wording as search intent rather than transcript evidence, and recommends build-time OCR/ASR alignment with abstention.
- Ran independent Sol Ultra full-caption passes over all three seed videos and
  a separate detector-design pass. The committed development corpus contains
  37 caption-screened cases across Twitch-chat readings, article/source
  readings, responses, creator-position candidates, and a mixed boundary.
- Added a deterministic cue scorer and short quote-state detector. It returns
  explainable rule matches and a `screening-candidate` status; it does not
  establish publishable authorship.
- Upgraded the canonical moment contract to require separate reviewed vocal
  speaker and word-origin fields. Non-removed quotations now fail validation
  unless wording, timing, speaker, and word origin have all been reviewed;
  search-normalized transcript text no longer counts as quote evidence.
- Added an attribution evaluator and JSON Schema. The tuned development smoke
  result is 34/37 exact labels, 34/37 coverage, 14/14 quoted-source precision,
  14/16 quoted-source recall, and zero unsafe own-word attributions. These are
  not held-out or recording-reviewed accuracy measurements.
- Added a separate, non-canonical review fixture containing 1,753 timed segments
  from the three complete `en-orig` YouTube auto-caption tracks: 617, 410, and
  726 segments. The builder verifies the screened caption hashes and pinned
  source metadata before producing byte-identical output.
- Added a static `/review/` caption locator with deterministic browser-side
  ranking, source filters, timestamp links, context expansion, copyable source
  links, explicit empty states, and persistent word-origin warnings. The route
  is `noindex` and remains separate from canonical Phase 2 search.
- Added a deterministic export used by the ChatGPT Sites preview. The checked-in
  GIF and still were captured from the functional preview and are review aids,
  not source-verification evidence.
- Added 13 caption-derived development queries plus one synthetic boundary
  case, an executable three-variant retrieval evaluator, and regressions for
  whole-token aliases, proximity, prompt/response routing, no-result behavior,
  and neighborhood deduplication.
- Rebuilt `/review/` as one React island using source-owned shadcn Button,
  Input, Card, Badge, Alert, and Separator components. The real caption corpus
  remains a separately fetched static asset rather than entering the client
  JavaScript bundle.
- Added progressive superellipse styling with a baseline rounded-corner
  fallback and documented both the browser-support boundary and retrieval
  experiment in dated research memos.

## Automated Phase 0 evidence

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Pass. 304 installs across 420 packages, no changes. |
| `bun run check` | Pass. Repository and corpus checks pass; Astro reports 0 errors, 0 warnings, and 0 hints across 11 files. |
| `bun run test` | Pass. 29 tests, 0 failures, 98 assertions. |
| `bun run build` | Pass. One static page and one asset. Largest asset `index.html`, 1,508 bytes. Total output 1,508 bytes. |
| `bun run deploy:dry-run` | Pass with Wrangler 4.127.1. It read one static asset; generated Worker upload is 0.31 KiB, 0.22 KiB gzip; no bindings. |
| `bun run benchmark:generate -- --count 25k --seed phase0-gate-v1` | Pass. 25,000 rows, 384 dimensions, four shards, 38,400,000 bytes. Largest shard 12,582,912 bytes. Aggregate SHA-256 `97a2622d54e8dd1a4b4707c4f7705cb39b15dc3c1ae89c82515e804e37735f51`. Shard and aggregate hashes verified. |
| `git check-ignore` on the generated manifest | Pass. `.gitignore` excludes `corpus/generated/`. The verification corpus was moved out of the generated tree after the check and will not be committed. |
| `git diff --check` | Pass. |

Wrangler's `Total Upload` number is the generated Worker bundle, not the static-asset byte total. The asset report above is the deployable output measurement.

Install, check, test, build, and the 25k benchmark were rerun against local verification revision `95b356398e147e036d6a6859d5df81cfe28b03d1`. Its implementation tree is published in `f7ebba6aa6c347e1a38137689d460e9a013d3b3c`. The benchmark manifest records the local revision with a clean source state. The Wrangler dry run passed on the staged candidate; its deployment inputs did not change before publication. A later retry was stopped by the execution environment's network-approval layer before Wrangler returned output, so the earlier successful dry run remains the recorded evidence.

The benchmark generator also demonstrated its no-overwrite guard when an ignored corpus directory already existed. After that artifact was moved aside, the explicit benchmark rerun passed with the same aggregate hash.

## Attribution slice evidence

| Command | Result |
| --- | --- |
| `bun run check` | Pass. Repository and corpus checks pass; Astro reports 0 errors, 0 warnings, and 0 hints across 14 files. |
| `bun run test` | Pass. 40 tests, 0 failures, 121 assertions. |
| `bun run eval:attribution` | Pass. Descriptive development result: 34/37 exact labels, 34/37 coverage, 14/14 quoted-source precision, 14/16 quoted-source recall, zero unsafe own-word attributions. |
| `ASTRO_TELEMETRY_DISABLED=1 CI=1 astro build` plus asset report | Pass. One static page, one asset, 1,508 total bytes. |
| `wrangler deploy --dry-run` | Not rerun. The execution environment stopped both attempts at its network-approval layer before Wrangler returned output. The earlier Phase 0 dry run remains the last completed result. |

The detector numbers are tuned, cue-enriched development measurements. They
are not recording-reviewed, held out, or estimates of full-corpus accuracy.

## Transcript review preview evidence

| Check | Result |
| --- | --- |
| Caption fixture rebuild and byte comparison | Pass. 1,753 segments reproduced byte-for-byte from the three hash-matching JSON3 tracks. Fixture SHA-256 `b8b67c530db2131ac5f55a71c9b7efadf45f992e9b27aee3456281da2bd4e085`. |
| Review-search export and byte comparison | Pass. 1,753 windows across three sources; the repository export and Sites data are identical. SHA-256 `21583d0dff63d017507f7a4bc92a1b00eeba1d08b95b4335b992a5048dc862fd`. |
| `bun run check` | Pass. Repository and corpus checks pass; Astro reports 0 errors, 0 warnings, and 0 hints across 24 files. |
| `bun run test` | Pass. 53 tests, 0 failures, 144 assertions. |
| `bun run build` | Pass. Two static pages and five assets. Largest asset `review/captions.json`, 908,967 bytes. Total output 924,787 bytes. |
| `bun run deploy:dry-run` | Pass with Wrangler 4.127.1. It read seven files; generated Worker upload is 0.31 KiB, 0.22 KiB gzip; no bindings. |
| Sites build and deployment | Pass. The final Vinext build completed; Sites version 2 reached `succeeded` at <https://prime-said-search.thatguysam.chatgpt.site>. The build warns that the bundled real-corpus client chunk exceeds 500 KiB. |
| Functional browser flow | Pass on the desktop preview. `tests drive development` returned 12 windows; `reverse funnel` surfaced the conservative quoted-source warning at 20:42; `purple aardvark compiler` returned zero; `driving implementation` returned the 6:14 unit-test window and the correct `IInciWyU74U&t=374s` link. Context expansion and copy-source behavior worked. No app-origin browser errors or horizontal overflow were observed at a 1,348-pixel viewport. |
| Review GIF | Seven browser-captured frames, 1,000 × 687, 532 KiB. SHA-256 `b18ac1c8b3d82bcce8dbf33159fb092d877ea3604e468a5c73aefc9b5c93a334`. |
| Review still | Desktop preview, 112 KiB. SHA-256 `dd0c87ea3ffb50043417c7ed85b226371f37d3779d2683899f9bdf1b92958790`. |

The browser flow verifies the interface against real machine captions. It does
not verify exact recording words, vocal speaker, word origin, or relevance.
The GIF is assembled from screenshots of the running preview, not a continuous
screen recording.

## Published compact review interface

| Check | Result |
| --- | --- |
| `bun run check` | Pass. Repository and corpus checks pass; Astro reports 0 errors, 0 warnings, and 0 hints across 24 files. |
| `bun test` | Pass. 53 tests, 0 failures, 144 assertions. |
| `bun run build` | Pass. Two static pages and five assets. Largest asset `review/captions.json`, 908,967 bytes. Total output 930,149 bytes. |
| `wrangler deploy --dry-run` | Pass with Wrangler 4.127.1. It read seven files; generated Worker upload is 0.31 KiB, 0.22 KiB gzip; no bindings. |
| Cloudflare native Git deployment | Pass. The public page references `index.BzzRMnZx.css` and `index.astro_astro_type_script_index_0_lang.CYTBtMCT.js`, exactly matching the verified local build. |
| Public functional browser flow | Pass at a 1,348-pixel desktop viewport. The real corpus returned 12 windows for `tests drive development`; the two-column grid had no horizontal overflow; `reverse funnel` returned the 20:42 chat/response warning; context disclosed the unreviewed boundary; copy returned the timestamped YouTube URL; and clear removed the query, showed the reset state, and focused the empty field. No app-origin browser errors were observed. |
| Single-player invariant | Pass. Two result selections each left exactly one iframe; the second replaced the first source and timestamp. Closing the dock removed the iframe. The embed URL and start seconds were verified, but audiovisual playback was not confirmed because the cloud browser did not render YouTube media pixels. |

The published Cloudflare Workers static deployment is visible at
<https://prime-said.samcarlton.workers.dev/review/> and is connected to
`ThatGuySam/prime-said` `main`. GitHub accepted the commit as a one-commit
fast-forward from `1bc9bd3b54aefce8916fffed5a233c26b4aea206`; the live asset
names confirm that Cloudflare served its exact verified build output.

## Retrieval experiment and shadcn interface evidence

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Pass. 374 installs across 508 packages; the lockfile and worktree did not change. |
| `bun run check` | Pass. Repository checks, six canonical files, and two fixtures pass; Astro reports 0 errors, 0 warnings, and 0 hints across 36 files. |
| `bun test` | Pass. 69 tests, 0 failures, and 173 assertions across nine files. |
| `bun run eval:review-retrieval` | Pass as a descriptive development screen. The deployed ranker passed 7/8 required hits, 5/7 pairwise preferences, 3/3 literals, 0/1 no-result, and 0/1 whole-token constraints, with three origin-risk results and six duplicate neighborhoods. BM25 plus proximity passed 7/8, 4/7, 3/3, 1/1, and 1/1, with four origin-risk results and no duplicates. BM25 plus proximity and origin routing passed 8/8, 7/7, 3/3, 1/1, and 1/1, with one origin-risk result and no duplicates. |
| `bun run build` | Pass. Two static pages and seven assets. Largest asset `review/captions.json`, 908,967 bytes; total output 1,189,308 bytes. The review island is 53,100 bytes and its renderer is 180,598 bytes. |
| `bun run deploy:dry-run` | Not completed. The execution environment cancelled the network approval before Wrangler returned; no pass is claimed for this revision. |
| Cloudflare native Git deployment | Pass. The public page references `review-app.BfPBMODA.js`, `client.BApSHwD7.js`, and `index.Bp9tKl64.css`, exactly matching the verified build from published commit `899f5e3821a898360ae1d54b7e3819df2b729e24`. |
| Public functional browser flow | Pass in Chromium at a 1,363-pixel desktop viewport. The real corpus returned 12 windows for `tests drive development`; expanded context exposed the later “opposite of TDD” qualification. `reverse funnel` returned one 20:42 chat/response case. Copy produced the exact timestamped YouTube URL; clear removed query state and restored focus. No horizontal overflow or app-origin browser errors were observed. |
| Single-player invariant | Pass. Selecting 4:40 and then 0:04 kept exactly one iframe and replaced its source and start time. Closing the dock removed the iframe. Audiovisual playback was not claimed. |
| Superellipse progressive enhancement | Pass in the measured Chromium browser. A result card computed to `corner-shape: squircle` and `border-radius: 20px`. Other engines and devices were not measured. |

The retrieval figures were tuned and measured on the same caption-derived
development cases. They are not held-out relevance accuracy, recording-review
accuracy, authorship accuracy, or evidence that the experimental ranker meets
the mobile performance gate.

## Source screening and open gate

Public metadata confirms that all three IDs are available videos on The PrimeTime channel. YouTube's English auto-generated timed text exposed a conflict, but media playback was unavailable. These are screening findings, not verified quotes:

- `S_7SE_Uzk-I` at 20:42 discusses example and integration testing in the auto-captions. Captions near 19:41.520 contain a different "tests that drive" line. The seeded wording does not match 20:42.
- `IInciWyU74U` contains "love driving implementation via uh tests" from about 6:15.360 through 6:20.720. This appears to be the wording currently attached to the first source.
- `20SkiBvylyM` uses 4:43 as a lead-in. The exact seeded sentence starts around 4:48.479 and ends around 4:51.680.

`docs/research/tdd-seed-screening-2026-08-29.md` has the exact review windows and links. A person must listen to the recordings, correct the source-to-wording assignment, and approve citation/playback boundaries. Until then, Phase 0 is not fully complete and no timestamp-drift claim is valid.

The user then reviewed the 20:42 code-coverage recording and identified Prime reading Twitch chat before responding. That origin judgment makes the span a valuable hard negative, not a creator-authored quotation. The exact quoted wording and response boundary remain unverified. Independent Sol Ultra passes also confirmed that ASR alone cannot resolve this authorship distinction and found additional source-reading candidates for the future attribution eval.

The full-caption passes found the likely Prime testing-preference material the
user remembered elsewhere in the same videos:

- code coverage, about 19:17–19:51: a response arguing that tests should be
  easier to run than the project and should drive difficult features;
- unit tests, about 6:13–6:56: “yeah, absolutely” begins a response about
  driving implementation via tests, followed by a Harpoon example;
- fear and software, about 4:41–5:12: a personal test-writing heuristic followed
  by an explicit “opposite of TDD” qualification.

These are auto-caption screening windows. No exact quote, voice attribution, or
playback boundary has been approved from them.

## Other gates not run

- No Apple Silicon Parakeet transcription or timestamp drift measurement.
- No reference-iPhone or Android measurement.
- Cloudflare's native Git integration deployed the exact published shadcn
  build. The direct Wrangler dry run for this revision was interrupted by the
  execution environment before Wrangler returned output; no direct account/API
  deployment or paid resource operation was performed.
- A ChatGPT Sites preview was deployed. No source outreach or account/token
  handoff was performed.

## Next checkpoint

The highest-leverage next action is human recording review of the three
testing-preference windows plus a balanced sample of chat, article, response,
mixed, and uncued cases. Record bounded wording, vocal speaker, word origin,
and response boundaries; retain 20:42 as a quoted-chat hard negative.

After that review, freeze at least 50 general-purpose retrieval queries, pool
judgments across the deployed and experimental rankers, and hold out complete
sources for evaluation. Benchmark only the resulting candidate on a reference
iPhone. If those gates pass, move the deterministic ranker into production and
continue the ordered phase gates without treating caption-screened examples as
verified quotations.
