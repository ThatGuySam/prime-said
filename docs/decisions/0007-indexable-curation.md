# ADR 0007: Index unique curated pages, not thin searches

**Status:** Accepted  
**Date:** 2026-08-29

## Context

Client search should not depend on crawler JavaScript support, but generating pages for every query or video risks thin content and unnecessary competition with original hosts.

## Decision

Pre-render reviewed moment, topic, and supercut pages with unique editorial value and source links. Ordinary search remains client-only. Arbitrary query pages are `noindex`; a Worker may first-render/cache only manifest-approved topics with identical crawler/user content.

## Consequences

- SEO work is curation work, not page-count work.
- Complete transcript/video pages are out of scope.
- Structured data must match visible content and original hosting reality.
