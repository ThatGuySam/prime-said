# Operations runbook

## Cloudflare setup from a phone

This is a one-time dashboard task after Phase 0 adds a working Astro build and lockfile.

1. Make the GitHub repository public and ensure `main` builds in GitHub Actions.
2. Sign in to Cloudflare on the phone.
3. Open **Workers & Pages** → **Create application** → **Import a repository**.
4. Connect GitHub and grant Cloudflare access only to the Prime Said repository if possible.
5. Select the repository and production branch `main`.
6. Confirm the Worker/project name is exactly `prime-said`, matching `wrangler.jsonc`.
7. Configure build command `bun run build`.
8. Configure production deploy command `bunx wrangler deploy`.
9. Configure preview deploy command `bunx wrangler versions upload`.
10. Add build variables `BUN_VERSION=1.2.15` and `NODE_VERSION=24.18.0` until the repository intentionally upgrades them.
11. Save and deploy; open the generated `workers.dev` URL and verify the build details/version preview.

Do not add a Cloudflare API token to GitHub Actions. Native Workers Builds manages Cloudflare deployment authorization.

## Release checks

- `bun run check`
- unit tests and retrieval evals appropriate to the change
- `bun run build`
- production asset report: count, largest file, total compressed/uncompressed bytes
- `bunx wrangler deploy --dry-run`
- reference-iPhone search/player smoke test for model/index/UI changes
- inspect Cloudflare preview version before production promotion when risk is material

## Static cache policy

| Route | Intended header |
| --- | --- |
| HTML and root corpus manifest | `Cache-Control: public, max-age=0, must-revalidate` |
| Content-addressed JS/CSS/model/index/corpus shards | `Cache-Control: public, max-age=31536000, immutable` |
| Reviewed topic page | Revalidated per deployment or keyed by corpus version |
| Arbitrary query/search state | Client-side; not a cacheable generated page |

The service worker activates a corpus only after verifying every required shard hash. Keep the previous active version until then.

## GitHub Actions cache layout

Steady state should stay comfortably below GitHub's default 10 GB repository cache allowance:

| Cache | Approximate target | Key shape |
| --- | ---: | --- |
| Production Parakeet MLX model | 2.5–3.0 GB | `asr-<os>-<arch>-<model>-<revision>-<lockhash>` |
| yt-dlp + bundled EJS + Deno + ffmpeg tools | <500 MB | `ingest-tools-<os>-<arch>-<versionshash>` |
| Bun packages | <1 GB | `bun-<os>-<arch>-<bunver>-<lockhash>` |
| One embedding eval batch | 1–3 GB | `embed-eval-<modelsethash>-<lockhash>` |

Rules:

- Main/manual trusted workflows may save caches. Pull requests use restore-only for executable/model caches.
- Use exact model revision in the primary key. Restore prefixes may omit only the runtime lock hash, never model identity/revision.
- Do not cache audio/video, cookies, secrets, generated transcript patches, or build output intended for review.
- Delete superseded embedding-eval caches after model selection; do not retain every candidate/OS combination.
- If cache churn begins, keep the production ASR cache and drop candidate eval caches first.
- Cache hits are an optimization. Every job can repopulate from authenticated-free public sources without secret state.

## yt-dlp update incident

1. Classify the failure from logs and a small known source fixture.
2. Do not change versions for 429, 5xx, regional, private, or deleted-source classes.
3. For extractor/EJS failure, execute the documented fallback: current pin → latest official nightly → official master.
4. Validate metadata identity/duration, audio decode, and a short timestamped transcript.
5. Commit the new exact pin and fixture result; do not leave “latest” as a production dependency.
6. Resume the failed queue. Never rebuild unaffected transcript history solely because yt-dlp changed.

## Parakeet update

- A scheduled/manual check may propose a newer stable model/runtime.
- Download it under a new exact revision key; never overwrite the production model cache.
- Run transcript/timestamp evals and one long-video seam test.
- Promote only if quality is no worse, runtime is stable, and licenses remain compatible with the pipeline.
- Model promotion changes the pipeline revision; existing transcripts are not automatically regenerated unless the measured gain justifies a bounded migration.

## Rollback

If an app build regresses, promote the previous Cloudflare Worker version. If a corpus/model manifest regresses, point the root manifest/build back to the previous immutable version and redeploy. Never mutate content-addressed shards in place.

## Monthly maintenance expectation

The deployed static app continues to work if ingestion stops. A maintainer may review failures when convenient. Only source deletion, upstream embed changes, or browser incompatibility can affect existing behavior; all have graceful fallback to direct original links or lexical search.
