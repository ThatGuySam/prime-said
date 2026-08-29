# Transcript search and exploration research

> **Tease:** The most robust browser transcript search is a pipeline, not a single vector score.  
> **Lede:** Combine BM25 and semantic ranks, preserve lexical dominance for literal/single-word queries, deduplicate moments, and expose build-time pivots.  
> **Why it matters:** The TDD joke is discoverable through several smaller searches even when one broad claim-style query is beyond a tiny embedding model.  
> **Go deeper:** RRF, sentence-aware overlap, stable semantic slots, and a golden corpus make the behavior tunable without a runtime LLM.

**Date:** 2026-08-29  
**Question:** How can a static browser app find exact, paraphrased, and exploratory moments in a large transcript corpus?

## Evidence patterns

- Practitioner discussions repeatedly treat BM25/full-text retrieval as a strong literal baseline and semantic retrieval as a complement, not a replacement.
- A current HN search discussion specifically warns that simple hybrid search can hurt single-word intent queries; literal-first routing is appropriate here.
- Browser client-side HNSW and serialized static indexes are practical at hundreds of thousands of vectors, but benchmark claims vary with dimensions, hardware, and Wasm/JS implementations.
- Static HNSW demonstrations and Ternlight's small local model show that query embedding + local ANN is feasible. Their reported latencies are screening evidence, not Prime Said acceptance data.
- Web performance guidance says to reserve space for late content or put it lower in the page. This supports a stable lexical grid plus a separate semantic lane before model readiness.
- Google can render JavaScript but documents limitations, while other engines may not; curated static HTML is the safer indexable surface.

## Product technique

1. Normalize technical terms while retaining verbatim/display text.
2. Use overlapping sentence-aware retrieval chunks.
3. Retrieve BM25 and semantic candidates independently.
4. Route query weights by shape: phrase/code/single-word → lexical; descriptive → semantic.
5. Merge ranks with weighted RRF and bounded exact/source/confidence boosts.
6. Collapse duplicate appearances and overlapping chunks into moments.
7. Diversify the top results across source/time neighborhoods.
8. Derive pivots from term co-occurrence, entities, phrases, transcript adjacency, and curated suggestions.
9. Show the exact transcript sentence before the player.

## Experiments

- exact int8 scan vs centroid-prefilter vs pure TypeScript HNSW;
- 256 vs 384 vs 768 dimensions where models support Matryoshka truncation;
- global semantic search vs lexical candidate semantic rerank plus a small global rescue lane;
- several chunk/overlap ranges;
- RRF weight grids by query class;
- precomputed phrase/entity pivots compared with manual gold exploration paths.

## Avoid

- vector-only ranking for exact technical/literal queries;
- overwriting visible lexical cards when semantic work completes;
- generated summaries presented as quotes;
- a full embedded SQL/database runtime before typed arrays fail measured needs;
- tuning against only the three TDD examples.

## Source quality

HN sources are practitioner signals and experiment leads. Platform/UX claims use primary Google, web.dev, MDN, and W3C guidance. Final decisions depend on Prime Said's own evals.

## Sources

- [HN: Ternlight 7 MB browser embedding model](https://news.ycombinator.com/item?id=48811644)
- [HN: client-side HNSW vector engine](https://news.ycombinator.com/item?id=47533528)
- [HN: USearch client-side serialization discussion](https://news.ycombinator.com/item?id=36942993)
- [HN: local-first RAG and vector scale discussion](https://news.ycombinator.com/item?id=42829552)
- [HN: static serialized HNSW discussion](https://news.ycombinator.com/item?id=43162995)
- [HN: single-word hybrid-search caution](https://news.ycombinator.com/item?id=49390099)
- [web.dev: optimize cumulative layout shift](https://web.dev/articles/optimize-cls)
- [MDN: content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility)
- [W3C: status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: dynamic rendering is a workaround](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
