# ADR 0004: Commit transcripts, not embeddings or media

**Status:** Accepted  
**Date:** 2026-08-29

## Context

The public project needs reproducible source data and reviewable corrections without bloating Git or tying data to one embedding model.

## Decision

Commit normalized timestamped transcripts, source manifests, correction patches, stable moments, and golden eval data. Generate chunks, embeddings, indexes, model weights, audio, and video outside Git.

## Consequences

- Model/index changes are reproducible from public data.
- Repository size grows with text but not large binaries.
- Build/run manifests must record exact input commit and model revisions.
- Third-party data remains under the separate data notice.
