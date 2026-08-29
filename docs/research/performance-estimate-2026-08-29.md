# Browser search performance estimate

> **Tease:** A deliberately high full-corpus estimate is about 225,000 chunks today and 450,000 after doubling.  
> **Lede:** BM25 is comfortably browser-sized; 384-dimensional int8 vectors are about 82 MiB/165 MiB raw, so exact scan is the simplicity baseline but not the launch assumption.  
> **Why it matters:** The 300 MB one-time ceiling is technically plausible, but mobile latency and memory favor sharding, quantization, and ANN/prefiltering.  
> **Go deeper:** Benchmark 25k/100k/225k/450k on a reference iPhone and choose exact, centroid, or HNSW from measured p95 and Recall@10.

**Date:** 2026-08-29  
**Question:** What upper corpus size should the architecture support, and how fast can handwritten browser search plausibly be?

## Inputs and math

The channel page reports about 2,100 videos. Round up to 2,500 today and 5,000 for a doubled future. A liberal 45-minute average and 30-second stride produce:

- today: `2,500 × 45 × 60 ÷ 30 = 225,000 chunks`;
- doubled: `5,000 × 45 × 60 ÷ 30 = 450,000 chunks`.

At 384 dimensions:

- int8: 384 bytes/chunk → 82.4 MiB and 164.8 MiB;
- float16: 768 bytes/chunk → 164.8 MiB and 329.6 MiB;
- exact scan terms/query: 86.4 million and 172.8 million multiply-accumulate terms.

Metadata, lexical postings, ANN edges, manifests, and the query model add to that total. Compression may help transfer more than resident memory.

## Estimated ranges before implementation

| Component | 225k | 450k | Confidence |
| --- | ---: | ---: | --- |
| Lexical search | 10–80 ms | 20–150 ms | Medium; posting-dependent |
| Exact int8 vector scan | 250–1,200 ms | 500–2,400 ms | Low/medium; JS engine/device sensitive |
| Centroid + 5–20% scan | 60–350 ms | 90–600 ms | Low; recall/partition dependent |
| HNSW search | 15–150 ms | 20–220 ms | Low/medium; graph and implementation dependent |
| Small-model query embedding | 10–400 ms | same | Low; candidate-dependent |

These ranges are planning hypotheses, not promises. Network transfer is more variable: 100 MB is roughly 80 seconds at 10 Mbps before overhead and roughly 16 seconds at 50 Mbps. Background progressive loading must therefore keep lexical search useful.

## Memory budgets

Target the reference iPhone for less than roughly 250 MiB of additional settled search memory and avoid multiple full copies during decode. This is an engineering target, not a browser-guaranteed limit. Use transferable buffers, one active corpus version, int8 documents, lazy text shards, and model tensor cleanup.

At 450k chunks, a full int8 vector array plus a typical bidirectional 16-neighbor graph can approach or exceed 220 MiB before model/text overhead, so the doubled corpus likely needs partitioned graph/vector loading or fewer dimensions.

## Recommended decision tree

1. Measure typed-array exact scan; keep it if warm p95 is under 500 ms at 225k and memory is safe.
2. Otherwise try centroid partitioning with a global rescue sample; require ≥98% exact Recall@10.
3. If p95 or recall still fails, use serialized HNSW, tune `M`/`efSearch`, and shard by coarse centroid/source era.
4. Test a small Wasm ANN control only if pure TypeScript cannot meet the gate.
5. At 450k, allow a higher-performance index tier but do not double-download unnecessary text/model assets.

## Source quality and uncertainty

Video count comes from the current YouTube channel result. Duration and chunk rate are deliberately liberal assumptions. Practitioner microbenchmarks demonstrate feasibility but do not predict Safari/iPhone performance; the repo's benchmark is the decision source.

## Sources

- [The PrimeTime YouTube channel](https://www.youtube.com/@ThePrimeTimeagen)
- [HN: client-side HNSW](https://news.ycombinator.com/item?id=47533528)
- [HN: static HNSW in browser](https://news.ycombinator.com/item?id=43162995)
- [HN: local vector search at scale](https://news.ycombinator.com/item?id=42829552)
- [HN: sqlite-vec browser brute-force discussion](https://news.ycombinator.com/item?id=41140506)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
