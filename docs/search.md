# Hybrid transcript search specification

## Search promise

Prime Said retrieves evidence, not generated answers. A query returns transcript moments with the words Prime said, a confidence-exposing excerpt, and a playable source. Lexical search handles literals and rare technical terms. Semantic search handles remembered meaning. Build-time pivots help users refine when neither query is precise enough.

## Corpus preparation

### Retrieval chunks

Start with sentence-aware 35–55 second windows and 12–18 seconds of overlap. Index both the normalized chunk and a short context-enriched form containing the source title, nearby entities, and build-time key phrases. Do not contaminate the displayed quote with enrichment text.

Generate multiple candidate chunk configurations for eval:

- 20–35 seconds / 8–12 seconds overlap;
- 35–55 seconds / 12–18 seconds overlap (default);
- 60–90 seconds / 20–30 seconds overlap;
- sentence-grouped adaptive windows with a 320-token cap.

### Lexical index

Implement a compact BM25-style inverted index in TypeScript using typed arrays and front-coded term dictionaries. Store:

- document frequency and field length statistics;
- delta-encoded posting IDs;
- compact term frequencies and optional positions for phrase/highlight support;
- separate fields for transcript, source title, entities, and curated key phrases;
- a normalization dictionary for technical spellings and aliases.

Partition by hashed or prefix term ranges so a query fetches only necessary shards. A tiny lexicon manifest maps terms to shards.

### Semantic index

Build embeddings from the exact selected browser query model and normalization path. L2-normalize document vectors at build time. Evaluate:

1. int8 exact dot-product scan over a candidate subset;
2. pure TypeScript HNSW or compact navigable graph;
3. centroid/IVF prefilter plus exact scan;
4. narrowly scoped serializable WASM ANN as a fallback experiment.

The product preference is simple TypeScript and Web Workers, but the eval chooses the smallest design that meets latency, memory, size, and recall. No embedded SQL database is needed for MVP.

## Query interpretation without an LLM

The query parser detects:

- quoted phrases;
- negated terms;
- exact-looking code/identifier tokens;
- query length and vocabulary rarity;
- filters (`source:`, `before:`, `after:`, optional later);
- whether the query is a single literal/intent word.

Routing weights:

| Query shape | Lexical behavior | Semantic behavior |
| --- | --- | --- |
| Quoted phrase / code token | Dominant; phrase and exact boosts | Small rescue weight |
| One common word | Dominant by default | Semantic suggestions separated or lightly weighted |
| Two–five content terms | Balanced hybrid | Normal |
| Descriptive sentence | Candidate lexical anchors | Dominant semantic |
| Unknown/ASR-like spelling | Fuzzy/alias candidates | Normal semantic |

Users never need to understand these classes. An optional advanced disclosure can show why a result matched.

## Candidate retrieval and fusion

Retrieve top lexical and semantic lists independently. Merge with weighted reciprocal-rank fusion (RRF), then apply bounded deterministic boosts.

Initial score:

\[
S(d) = \frac{w_L}{k+r_L(d)} + \frac{w_S}{k+r_S(d)} + B(d)
\]

Where `r` is rank, missing ranks contribute zero, `k` begins at 60, and query-shape weights set `w_L`/`w_S`. `B(d)` is capped and may include:

- exact phrase/rare-term presence;
- complete-sentence boundary quality;
- canonical official appearance;
- transcript confidence;
- diversity penalty for near-duplicate moments from the same source neighborhood.

RRF is the baseline because rank distributions from BM25 and embeddings are not directly comparable. Weighted raw-score fusion may be benchmarked only after calibration.

## Result grouping

- Collapse high-confidence duplicate appearances into one moment card.
- Default to the canonical appearance and list alternates.
- Avoid returning overlapping chunks from the same moment as separate cards.
- Apply maximal marginal relevance or a simple source/time diversity pass to the top 20 so one long discussion does not crowd out useful distinct moments.
- Display the sentence-complete excerpt around the highest-scoring matched span, not the entire retrieval chunk.

## Pivots and exploration

Build-time tools produce non-generative exploration aids:

- high-PMI neighboring terms and bigrams;
- entities and technical terms co-occurring within a time window;
- source-local adjacent phrases;
- nearest centroid/topic labels from curated vocabulary;
- “also said near this” moments from transcript adjacency;
- “same phrase elsewhere” links from the lexical index;
- curator-authored related queries on golden pages.

The search result page shows a restrained set of pivots derived from top results. Selecting a pivot appends or replaces query terms and records the step in local history. This creates a *Her Story*-like exploration loop without pretending to understand arbitrary claims.

## Progressive semantic readiness

### Before model readiness

- Return a stable first grid/list of 6 lexical results.
- Reserve a semantic section immediately below it with a fixed minimum size and status text.
- When semantic retrieval becomes ready for that same query, fill only the reserved section with semantic-only discoveries; do not reorder or replace the visible lexical six.
- Defer duplicate semantic candidates rather than showing repeats.

### After model readiness

- Show a short fixed-size search progress state.
- Run lexical and semantic retrieval concurrently off main thread.
- Render one fused ordering when both complete or the semantic deadline expires.
- If semantic times out, render lexical ordering and put later semantic additions only in the reserved section.

No card may move after pointer-down/touchstart until pointer-up/cancel. New queries cancel obsolete rendering work by query ID.

## Model selection

The build and browser must use the same text normalization, tokenizer, model, pooling, and quantization. Candidate models include:

- Snowflake Arctic Embed XS/S browser-compatible exports;
- Snowflake Arctic Embed M v1.5 if size/memory still fit;
- Ternlight Mini and Base;
- other English retrieval models with reproducible browser packaging under the asset/device budget;
- one larger control model to measure the quality ceiling.

Do not choose from leaderboard claims alone. `docs/evals.md` defines the selection gate.

## Performance strategies to benchmark

The following experiments come from the corpus shape and practitioner evidence, including HN reports of client-side HNSW, static serialized indexes, and fast brute-force search:

1. L2-normalize once so cosine becomes dot product.
2. Quantize document vectors to int8; keep query float or quantize per query.
3. Use lexical top-N as one semantic candidate set while retaining a small global semantic lane for vocabulary-mismatch discoveries.
4. Partition vectors by semantic centroids/source era and fetch only winning shards.
5. Benchmark exact scan before adopting ANN; local QPS is one and sequential typed-array access is efficient.
6. Benchmark HNSW with serialized graph and tunable `efSearch` if exact scan misses the latency target.
7. Keep dimensions at the smallest eval-passing Matryoshka size when supported.
8. Transfer ArrayBuffers to workers instead of cloning.
9. Decompress once and persist parsed version state.
10. Hydrate text only for top IDs and virtualize offscreen result cards.

## Relevance failure analysis

Every failed golden query is assigned at least one cause:

- transcript error;
- timestamp/chunk boundary error;
- lexical normalization/alias gap;
- embedding model gap;
- ANN recall loss;
- fusion weight issue;
- duplicate/diversity issue;
- gold case ambiguity;
- impossible claim-style query requiring unsupported inference.

Fix the earliest causal layer. Do not tune fusion to hide incorrect transcripts.

## Search acceptance criteria

- Exact and near-exact quotes preserve lexical dominance.
- A descriptive TDD query can discover at least one nonliteral seed moment in top 5 after semantic readiness.
- A single-word query such as `testing` remains predictable and exposes semantic exploration without drowning literal matches.
- Search results contain only words derivable from committed transcript text.
- Model/index version mismatch is detected and cannot return results.
- Stable first-grid behavior passes automated DOM ordering tests and manual iPhone touch testing.
- Selected model and index meet the eval and performance budgets before full-corpus launch.
