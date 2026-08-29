# ADR 0006: Select models and indexes through product evals

**Status:** Accepted  
**Date:** 2026-08-29

## Context

Leaderboard quality, browser package size, iPhone memory, query latency, and transcript-corpus relevance do not move together.

## Decision

Benchmark Snowflake, Ternlight, and other deployable candidates against the same golden corpus. Choose the smallest model within 1.5 nDCG points of the best deployable candidate and require latency, memory, literal-relevance, and asset gates. Benchmark exact scan before ANN; add centroid/HNSW/WASM only when measurements justify it.

## Consequences

- No embedding model is hard-coded in the product spec.
- Evals and mobile benchmark results become release artifacts.
- Changing the production model changes the corpus version and browser cache key.
