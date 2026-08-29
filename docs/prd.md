# Product requirements document

**Product:** Prime Said  
**Status:** Decision-ready  
**Date:** 2026-08-29  
**Primary job:** Find a timestamped video source for something ThePrimeagen said  
**Secondary job:** Save moments and assemble shareable supercuts

## Product thesis

People remember the idea of a quote more often than its exact words. Searching YouTube titles or a web search rarely finds the point inside a long video. Prime Said turns a creator's public video corpus into a fast, playful evidence finder: enter remembered words or an idea, scan transcript excerpts, click to verify the actual recording, and copy a timestamped source link.

The interaction should feel like emoji search: the useful surface appears immediately, deeper semantic capability arrives locally, and subsequent searches are instant. The product is a search and citation layer over original video platforms, not a replacement video platform.

## Audience and launch

The launch audience is ThePrimeagen's Reddit community and adjacent software communities. The initial tone may be playful, but every result must preserve context and make verification easy.

### Primary user

A fan or chat participant who remembers a phrase, concept, opinion, joke, or contradiction and wants the relevant clip within seconds.

### Secondary users

- A curator assembling a thematic supercut.
- A contributor correcting transcripts or adding an allowed source.
- A researcher exploring how a topic appears across a creator's body of work.
- A future engine adopter creating the same experience for another consenting or public-interest creator corpus.

## Jobs to be done

1. When I remember roughly what Prime said, help me find likely moments even if my words differ from his.
2. When I see a likely result, show the quote and enough source context to judge it before loading the player.
3. When I need proof, start the original video at the right timestamp and give me a shareable deep link.
4. When several moments make the point, let me save, reorder, and share them as a collection or supercut.
5. When I do not know what to search, let me pivot through related words, phrases, people, and topics as in *Her Story*.

## Canonical launch story

“Prime is secretly a test-driven-development stan” is the seed demonstration. It should produce moments such as:

| Source | Seed timestamp | Known wording or intent |
| --- | ---: | --- |
| *The Lies Of 100% Code Coverage \| Prime Reacts* | 20:42 | “Loves driving implementation via test” |
| *Lets Chat About Unit Tests* | 6:20 | A related unit-test / development-driving moment to verify from the generated transcript |
| *Fear And Software* | 4:43 | “I usually use tests as a way to Drive Development” |

The joke is a curation layer, not a promise that a broad natural-language claim will always resolve magically. The product must teach discoverable query paths such as `tests drive development`, `testing first`, `implementation via test`, and pivots surfaced from matching excerpts.

## Experience principles

- **Quote first.** A result begins with the transcript excerpt, not a thumbnail wall.
- **Verify in one action.** The player starts at the moment; the source link includes the timestamp.
- **Fast before fancy.** Lexical search is useful before the embedding model is ready.
- **No result jumping.** Async semantic results never replace an item under the user's pointer or thumb.
- **Original source first.** Prefer the longest, least-edited, most official available appearance.
- **Context is close.** More transcript context is always available, though it is secondary to playback.
- **Local by default.** Queries, history, collections, and ranking stay in the browser unless explicitly shared.
- **Static is durable.** Ordinary traffic does not require database or search compute.

## Functional requirements

### Search

- Accept one or more words, an exact phrase, or a short natural-language description.
- Search normalized transcript text immediately with BM25-style lexical ranking, phrase boosts, and field boosts.
- Embed the query locally once the selected browser model is available.
- Merge lexical and semantic candidates deterministically.
- Support quoted phrases, excluded words, and lightweight filters without making operators necessary.
- Display lexical-only state honestly while semantic capability downloads.
- Preserve search history in local storage with clear/delete controls.
- Provide pivot phrases, related terms, entities, and adjacent moments generated at build time without a runtime LLM.

### Results and verification

- Show an excerpt aligned to complete sentences where possible; use ellipses for necessary truncation.
- Highlight lexical matches without implying semantic terms were spoken.
- Show source title, platform, channel, publication date, timestamp, duration of the moment, and transcript confidence when relevant.
- Default to the canonical appearance while offering alternate appearances when duplicates exist.
- Lazily instantiate YouTube embeds and begin at the timestamp.
- Provide Copy timestamped link, Open original, Save, More context, and Alternate sources actions.
- Never autoplay with sound before an explicit user action.

### Collections and supercuts

- Save moments locally with optional collection titles.
- Reorder and remove moments.
- Encode a compact, versioned collection payload in a URL when it fits a conservative URL budget.
- Fall back to a static or Worker-cached collection manifest for payloads too large for a URL only after the simple URL prototype is measured.
- Play a collection sequentially with explicit user initiation, graceful handling of embeds that block autoplay, and a visible “next” control.
- Always expose the underlying source list and timestamps.

### Indexable pages

- Pre-render curated moment pages and curated supercut pages with unique explanatory copy.
- Pre-render a bounded set of useful topic pages from an explicit manifest.
- A Worker may create and cache an approved topic/query page on first request, but arbitrary thin search-result pages must be `noindex`.
- Search results inside the app remain client-side. SEO does not justify a server search API.

### Corpus operations

- Ingest the allow-listed `ThePrimeTimeagen` channel first.
- Discover the newest window daily without the YouTube Data API.
- Backfill in small, resumable batches.
- Download source media only when needed and delete it after a verified transcript artifact is written.
- Commit normalized transcript data and metadata; build embeddings and search indexes from them.
- Support contributor-proposed interviews or guest appearances through a structured PR.
- Detect duplicate and excerpted appearances while retaining independent source health.

## MVP

The MVP is a public, mobile-usable vertical slice that:

1. ingests enough official videos to contain the three TDD seed moments;
2. returns useful lexical and semantic results for the seed queries;
3. shows a scannable quote above a timestamped YouTube embed;
4. copies the original timestamped YouTube URL;
5. saves moments to a local collection;
6. publishes one curated TDD supercut and several curated moment/topic pages;
7. runs from Cloudflare Workers Static Assets with no runtime search service;
8. passes the performance and relevance gates in `docs/evals.md`.

## Explicit non-goals for MVP

- Perfect answer generation or claim verification.
- Runtime LLM interpretation.
- Complete Twitch archive coverage.
- Hosting, clipping, transcoding, or redistributing video.
- User accounts, cloud-synced collections, comments, votes, or moderation feeds.
- Automatic discovery of every third-party appearance on the web.
- A page for every video or every arbitrary query.
- An official integration with the YouTube Data API.

## Success metrics

The product is a fun public-source utility, not an ad business. Metrics should prove usefulness and durability without invasive analytics.

| Metric | MVP target |
| --- | ---: |
| Seed query success | Relevant known moment in top 5 for at least 80% of golden queries |
| Exact quote success | Correct moment in top 3 for at least 95% of exact/near-exact golden queries |
| Search responsiveness | Lexical p95 under 100 ms after the lexical index is ready on the reference iPhone |
| Semantic-ready query | Query embedding plus ANN plus merge p95 under 750 ms on the reference iPhone |
| Repeat query | Visible stable results p95 under 250 ms when model and indexes are cached |
| Layout stability | Search interaction CLS at or below 0.05; no card changes position after pointer-down |
| Verification | Timestamp drift median at or below 1.0 s and p95 at or below 2.5 s on hand-checked moments |
| Runtime cost | Zero origin/search compute for normal static searches; Worker dynamic routes remain within free/near-free budget |
| Asset safety | Every deployed asset at or below 16 MiB and asset count below 5,000 for the first full corpus |

Privacy-respecting aggregate analytics are optional. Search text must not be collected by default.

## Launch acceptance criteria

- A new user on a typical cellular connection can begin a lexical search without waiting for the semantic model.
- The semantic model downloads in the background with understandable progress and is persisted for later visits.
- The three seed sources are represented as independent appearances and deduplicated where their content overlaps.
- Deleting or losing one source does not erase a surviving alternate appearance.
- Result ordering is stable while the user's pointer is active and while the visible first result grid is being scanned.
- All curated pages contain a transcript excerpt, editorial context, source attribution, timestamp link, canonical metadata, and appropriate structured data.
- A takedown or correction can remove a moment/source by stable ID and rebuild all affected pages and indexes.
- The repository can be built from documented inputs with no private API key.
- A Cloudflare account owner can connect the GitHub repository in the dashboard and deploy it using native Workers Builds without adding a Cloudflare token to GitHub Actions.

## Open implementation questions resolved by measurement

These are experiments, not missing product decisions:

- Which browser embedding model wins the golden relevance, memory, and latency eval.
- Whether pure TypeScript exact scan, a pure TypeScript ANN index, or a narrowly scoped WASM ANN library gives the best corpus-size tradeoff.
- Exact chunk length/overlap after timestamp and retrieval evals.
- Whether URL-only supercuts cover normal use before a manifest service is necessary.
- Whether selected topic pages should be entirely pre-rendered or first-request rendered and long-cached.

Each decision has a default and a gate in the implementation plan; none requires a runtime LLM or hosted search database.
