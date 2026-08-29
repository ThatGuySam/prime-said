# ADR 0002: Browser-local hybrid search

**Status:** Accepted  
**Date:** 2026-08-29

## Context

The product needs exact and remembered-meaning retrieval with negligible recurring cost and fast repeat queries on mobile.

## Decision

Prebuild lexical/vector indexes and document embeddings. Run BM25, query embedding, semantic retrieval, and rank fusion in browser workers. Lexical search is immediately useful; semantic capability progressively activates. No runtime LLM, hosted vector store, or ordinary query endpoint.

## Consequences

- First visit includes a meaningful download and mobile memory work.
- Query privacy and repeat speed are strong.
- Asset/model choice is constrained by reference-iPhone evals.
- A server search fallback requires a superseding ADR.
