# UX behavior specification

## Primary mobile flow

1. The static page opens with one focused search field, a short example, and immediately useful curated entries.
2. Lexical and semantic assets begin loading without blocking typing.
3. The user searches.
4. A stable list of quote-first result cards appears.
5. The user scans the words, taps Play to verify, then copies the original timestamp link or saves the moment.
6. Pivots support another search without returning to a blank state.

## Search states

| State | UI behavior |
| --- | --- |
| No query | Search field, TDD example, curated topics/cuts, local recent searches if present |
| Lexical loading | Fixed-height progress region; query remains editable; no fake results |
| Lexical ready / semantic downloading | Stable top six lexical cards; reserved “semantic discoveries” region below with progress |
| Fully ready | One fused ordering per new query; short stable loader while both lanes finish |
| Semantic unavailable | Lexical results plus a small explanation/retry; no broken empty region |
| No strong results | Exact/near matches if any, spelling/pivot suggestions, explain that no source was verified |
| Offline return | Use cached corpus/model and label corpus version; original playback may require network |

## Result card anatomy

Order matters:

1. explicit collection selection;
2. linked source/timestamp metadata;
3. transcript excerpt in readable type;
4. one Play action;
5. a Details disclosure for context, provenance, and secondary source actions.

The excerpt should normally contain one to three complete sentences. If a sentence is long, center the matched span and use typographic ellipses at omitted boundaries. Highlight exact lexical matches only. A semantic match may show a label such as “related meaning,” not fabricated highlighted words.

The player is created only after Play. Search cards do not carry a thumbnail or
duplicate play affordance. If playback fails, the linked source/timestamp row
remains the primary recovery path.

## Preventing delayed layout shifts

The frustration to prevent is a target moving just before it is tapped. The design uses several layers:

- reserve the first result grid's full dimensions before cards render;
- reserve a separate semantic section below that grid;
- never insert a semantic card above a rendered lexical card for the same query;
- never reorder a rendered list while pointer/touch is active;
- give thumbnails/embed placeholders explicit aspect ratio and cards a stable minimum block size;
- use `content-visibility: auto` and `contain-intrinsic-size` for offscreen cards where testing supports it;
- cancel stale results by query sequence number;
- announce result count/readiness in `role=status`, not by stealing focus.

When the model is already ready, wait briefly and render one fused list. When it is not, progressive enhancement fills a separate reserved lane. This is simpler and safer than attempting a live in-place merge.

## Playback and context

- Explicit Play loads the YouTube iframe and seeks to the appearance start.
- Include 1–3 seconds of lead-in by default while the displayed timestamp remains the citation point.
- “More context” expands transcript text before and after the moment with clickable sentence timestamps.
- Text context is secondary, but useful for accessibility, precise navigation, and cases where scrubbing is awkward.
- Transcript text never replaces listening for definitive verification.

## Collections and supercuts

Save is local-first and instantaneous. The collection drawer shows ordered quote snippets and durations. Users can rename, reorder, remove, play from an item, copy individual sources, and create a share URL.

Supercut playback is an orchestrated playlist of original embeds, not a rendered derivative video:

- one user gesture starts the sequence;
- the review-only prototype may keep one active iframe and one warm standby
  after that gesture; reduced-data preference disables the standby;
- the standby loads the embed shell and cues the next range, but this is not a
  claim that YouTube media bytes are buffered;
- attempt permitted autoplay for the next item, but always show a large Next button;
- mark unavailable items and continue;
- expose total and per-source attribution;
- do not promise gapless playback.

Canonical collections use a compressed, checksummed, versioned URL payload
containing stable moment IDs and optional trims. Until recording-reviewed
moments exist, the `/review/` prototype uses a distinct `r1` fragment payload
containing ordered corpus source IDs plus start/end milliseconds. It is a
review range snapshot, not the canonical collection format. If normal
collections exceed a 1,800-character URL target, add a manifest-backed code
later.

## Search history and privacy

- Store recent queries locally with timestamps and optional result IDs.
- Show recent history only on the device that created it.
- Offer individual remove and Clear all.
- Do not sync or transmit query text by default.
- Private browsing/storage denial degrades to session history.

## Pivots

Pivots appear as a small set of chips or linked phrases under the query summary and on expanded results:

- exact phrase elsewhere;
- related technical terms;
- people/projects mentioned nearby;
- previous/next topic in the same discussion;
- curated suggested query.

Each pivot clearly changes the query and is undoable through browser history/search history. Avoid a large tag cloud.

## Indexable pages

Curated moment/topic/supercut pages share the result card visual language but add unique editorial value: what the moment demonstrates, why clips are grouped, and related verified moments. They do not recreate a full YouTube watch page or publish entire transcripts.

## Accessibility

- WCAG 2.2 AA target.
- Search is a native form; results use a semantic list.
- Loading and result count changes use polite status messages.
- All actions are keyboard reachable and have visible focus.
- Touch targets meet 24×24 CSS px minimum, with 44×44 preferred on mobile.
- Player controls are not the only route to the source; timestamp links are ordinary links.
- Transcript corrections and low-confidence spans have accessible text labels, not color alone.
- Respect reduced motion and reduced data preferences.

## Responsive behavior

Mobile uses a single-column quote-first list, intermediate screens use two
columns, and wide desktop screens use three. The three-column layout omits
thumbnails and secondary actions so source/quote scanning order remains clear.

## UX acceptance tests

- Search while semantic model is 0%, 50%, and 100% ready.
- Tap the first card exactly as semantic results arrive; target remains unchanged.
- Rapidly issue three queries; only the newest result set renders.
- Disable storage, WebGPU, and WASM separately; lexical search still works.
- Simulate embed refusal and deleted video; timestamp/open-original affordances remain coherent.
- Navigate and save a result using only keyboard and screen-reader status output.
- Open a shared collection with one unavailable source; playback continues to the next item.
