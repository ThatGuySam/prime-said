# ADR 0008: Local collections with URL-first sharing

**Status:** Accepted  
**Date:** 2026-08-29

## Context

Collections and supercuts are valuable, but accounts or a persistence backend would add maintenance and cost before demand is proven.

## Decision

Store history and collections locally. Share a versioned, checksummed compact URL payload of stable moment IDs first. Add a cached manifest/code service only if measured normal collections exceed the conservative URL budget.

## Consequences

- No account system or cloud sync is required.
- Shared URLs are public and must be treated as such.
- Embed autoplay remains best-effort; sequential playback includes a visible Next fallback.
