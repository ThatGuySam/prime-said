# ADR 0003: Separate moments from appearances

**Status:** Accepted  
**Date:** 2026-08-29

## Context

The same speech can exist in a long official upload, a short clip, or another host. One copy may disappear while another survives.

## Decision

A stable moment represents spoken content; appearances map it to source-specific time ranges. Search groups appearances and prefers the available official source with the longest context and strongest originality evidence.

## Consequences

- URLs/collections survive canonical-source changes.
- Ingestion needs conservative transcript/audio alignment.
- False merges are more harmful than duplicate cards, so uncertain matches stay separate.
