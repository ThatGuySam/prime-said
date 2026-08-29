# Evaluation plan

## Purpose

The eval suite chooses transcript settings, chunking, browser embedding model, vector representation, retrieval index, fusion weights, and display boundaries. The desired outcome is not the highest abstract embedding score; it is the best Prime Said experience within iPhone, asset, and latency budgets.

## Golden data layers

### Retrieval cases

Each case contains:

- query and query class;
- one or more relevant moment IDs or source/time ranges;
- graded relevance (`3` exact target, `2` strong alternative, `1` useful related, `0` irrelevant);
- whether literal wording is present;
- required/excluded concepts;
- notes explaining user intent;
- provenance (`human-seed`, `Sol-proposed`, `community`, `failure-regression`);
- human review status.

### Transcript cases

Hand-transcribed short spans measure word error rate, technical-term accuracy, punctuation readability, sentence segmentation, and timestamp drift. Include fast speech, code terms, crosstalk, music, clips, and long-video seams.

### UX cases

Scripted mobile interactions measure first useful results, model progress, no-result behavior, touch stability, player start accuracy, collection playback, and storage recovery.

## Seed TDD set

The initial fixture starts with the user-supplied moments:

| Gold label | Source | Time | Candidate queries |
| --- | --- | ---: | --- |
| implementation-via-test | *The Lies Of 100% Code Coverage \| Prime Reacts* | 20:42 | `driving implementation with tests`, `tests drive implementation`, `TDD`, exact known phrase |
| unit-test-discussion | *Lets Chat About Unit Tests* | 6:20 | `testing first`, `unit tests guide development`, `how he uses tests` |
| tests-drive-development | *Fear And Software* | 4:43 | `tests drive development`, `uses tests to develop`, `TDD without calling it TDD`, exact known phrase |

The broad joke query `Prime secretly is a test-driven development stan` is classified as a stretch query. It is useful to measure but is not a hard MVP gate unless a browser model retrieves the target without harming literal relevance.

Grow the suite before tuning:

- at least 50 retrieval queries for the vertical slice;
- at least 200 before full-corpus model selection;
- 30% literal/near-literal, 30% paraphrase, 20% topic/exploration, 10% entity/technical, 10% adversarial or expected-no-result;
- at least 25 hand-timed transcript spans across varied audio conditions.

## One-time Sol workflow

After transcripts exist, a ChatGPT Sol session may scan batches and propose:

- funny or high-value candidate moments;
- alternative phrasings a user might search;
- hard negatives with similar vocabulary but different meaning;
- topic and entity labels;
- obvious ASR corrections;
- candidate curated pages/supercuts.

Sol output is proposal data, not ground truth. A human reviews source video at the timestamp, accepts/rejects the moment, corrects the quote, and records provenance. Prompts live in `docs/prompts/`.

## Candidate matrix

Run the identical normalized corpus and query set against:

- lexical-only BM25 baseline;
- Snowflake Arctic Embed XS;
- Snowflake Arctic Embed S;
- Snowflake Arctic Embed M v1.5 at supported dimensions;
- Ternlight Mini;
- Ternlight Base;
- any new browser-compatible candidate admitted by the asset preflight;
- one larger offline control model.

For each model, test float32/float16/int8 document vectors where supported, exact scan and candidate ANN configurations, and the same fusion grid. Record model download size, total deployed size, peak memory, cold initialization, query embedding time, search time, and relevance.

## Metrics

### Retrieval

- nDCG@10 (primary quality metric)
- Recall@5 and Recall@10
- Mean Reciprocal Rank
- exact/near-exact top-3 success
- zero-result precision for expected-no-result cases
- duplicate rate in top 10
- source/moment diversity

### Transcript

- word error rate overall and on technical terms
- sentence boundary F1 or human acceptability rating
- absolute start timestamp error median/p95
- long-segment seam duplication/omission count

### Runtime

- compressed model/index/corpus bytes
- cold and warm load time
- peak and settled JS heap / model memory where observable
- lexical, embed, vector, fusion, hydration, and render latency p50/p95
- main-thread long tasks over 50 ms
- search interaction CLS and result reorder count
- storage persistence success and repeat-visit bytes

## Reference devices and networks

At minimum:

- an average-or-worse iPhone approximately two years old, current Safari;
- a recent low/mid Android device, Chrome;
- a normal desktop baseline;
- throttled 4G for first visit and offline/return visit.

Synthetic desktop benchmarks are screening tools, not the mobile acceptance result.

## Selection gates

A candidate is deployable only if:

- all its static files can be sharded to 16 MiB or less;
- first-visit semantic package is no more than 100 MB unless the quality gain justifies an explicit larger tier;
- peak memory does not crash or trigger repeated tab reloads on the reference iPhone;
- query embedding + vector search + merge p95 is under 750 ms warm;
- it beats lexical-only nDCG@10 by at least 8% relative on paraphrase/topic cases;
- it does not reduce exact/near-exact top-3 success by more than 1 percentage point;
- quantization/ANN retains at least 98% of the selected model's exact float retrieval Recall@10;
- the complete production payload remains within the architecture asset budgets.

Select the smallest candidate within 1.5 nDCG points of the best deployable candidate. This prevents a large model from winning on a negligible quality difference.

## Performance estimates to validate

The first channel currently reports roughly 2,100 videos. Use a liberal full-corpus design point of 2,500 videos at 45 minutes average and a doubled future point of 5,000 videos.

With a 45-second target window and 30-second stride:

\[
\text{chunks} = \text{videos} \times \frac{45 \times 60}{30}
\]

| Scenario | Videos | Audio hours | Chunks | 384-d int8 vectors | 384-d float16 vectors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Liberal full corpus | 2,500 | 1,875 | 225,000 | 82 MiB raw | 165 MiB raw |
| Doubled future | 5,000 | 3,750 | 450,000 | 165 MiB raw | 330 MiB raw |

These are deliberately high: actual average video duration and adaptive chunking may be lower.

Expected warm query ranges on an average-or-worse recent iPhone, to be replaced by measurements:

| Strategy | 225k chunks | 450k chunks | Notes |
| --- | ---: | ---: | --- |
| BM25 typed-array postings | 10–80 ms | 20–150 ms | Query-dependent posting lengths |
| Exact int8 scan, optimized worker | 250–1,200 ms | 500–2,400 ms | 86M / 173M dot-product terms; linear |
| Centroid-prefilter + exact scan | 60–350 ms | 90–600 ms | Assumes 5–20% candidates plus global rescue |
| Serialized HNSW | 15–150 ms | 20–220 ms | Excludes query embedding; recall/memory tuned by eval |
| Query embedding | 10–400 ms | same | Model-dependent, not corpus-dependent |

The launch plan should not rely on exact full scan meeting 750 ms. Benchmark it because its simplicity is valuable, then use centroid filtering or HNSW if the measured p95 fails.

## Experiment order

1. Validate transcript/timestamp fixtures.
2. Lock a chunking shortlist.
3. Run lexical baseline.
4. Benchmark model quality and query encoding without ANN approximation.
5. Quantize and measure quality loss.
6. Benchmark exact scan at 25k, 100k, 225k, and 450k synthetic/real vectors.
7. Add centroid prefilter.
8. Add pure TypeScript HNSW.
9. Benchmark a small WASM ANN control only if TypeScript misses the gate.
10. Tune fusion and diversity on a frozen development split.
11. Report once on the held-out split and reference phones.

## Anti-overfitting rules

- Separate development and held-out queries by moment/source family.
- Do not add a query to the golden set and tune its ranking in the same commit without labeling it a regression case.
- Report per-query-class results, not only one aggregate.
- Freeze the MVP seed suite before final model selection.
- Preserve failed expectations as regression tests.
- Require a human source check before promoting Sol-proposed gold data.
