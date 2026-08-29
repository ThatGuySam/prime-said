# Implementation progress

**Updated:** 2026-08-29 14:09 UTC
**Branch:** `main`
**Starting commit:** `7da26ba09eca71816a3ff077579f62f8c849036b`
**Published Phase 0 slice:** `f7ebba6aa6c347e1a38137689d460e9a013d3b3c`
**Published attribution research:** `44ac8354c73226949aac88324bc2928fa345402c`
**Published candidate-data correction:** `bf83640d1e7c39da6116642c920a41a20daad35a`
**Published attribution screening gate:** `cb54db16bf7c92441b0d439b6023671eebc64f83`
**Review-caption data slice:** `24e6d64c882495fda72bdd62c5e219c468ab33de`
**Transcript-review interface slice:** `171b470a1fe4253950c5a879e94fe291994b0f15`
**ChatGPT Sites preview:** <https://prime-said-search.thatguysam.chatgpt.site> (version 2 deployment succeeded)
**Required ancestor:** `4fb87576370a6228549751c91478d4f6b4a5158b`, verified with `git merge-base --is-ancestor`

## Current phase

Phase 0: repository and fixtures. The note/gold separation and deterministic
attribution screening baseline are published on `main`. A bounded review
locator now searches all three complete, hash-locked auto-caption tracks, but
it does not promote those captions to canonical transcripts or quotations.
Recording review and the quoted-source attribution gate still block the
manually verified TDD-span deliverable, so Phase 1 has not started.

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
- No Cloudflare account deployment or native Workers Builds run.
- A ChatGPT Sites preview was deployed. No Cloudflare production deployment,
  paid resource, source outreach, or account/token handoff was performed.

## Next checkpoint

Review the three testing-preference windows plus a balanced sample of chat,
article, response, mixed, and uncued cases against recording audio and pixels.
Record bounded wording, vocal speaker, word origin, and response boundaries;
retain 20:42 as a quoted-chat hard negative. Then prototype OCR/source-text
alignment on the reviewed cases and rerun the full Phase 0 gate. Only after it
passes should Phase 1 begin with the typed command builders, binary/hash
preflight, temporary-directory isolation, and run-manifest schema described in
`docs/research/phase1-toolchain-pins-2026-08-29.md`.
