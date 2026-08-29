# Review interface hierarchy audit

**Date:** 2026-08-29  
**Surface:** `/review/?q=tests+drive+development`  
**Viewport inspected:** 1,363 × 936 desktop

## Outcome

The previous screen was functional but overbuilt for quote scanning. It
exposed 72 interactive elements, five tab stops per result, two Play controls
per result, repeated match/origin badges, large thumbnails, a four-button
source filter, two eyebrows, helper copy, and an oversized global warning.

The revised hierarchy is:

| Rank | Element | Treatment |
| --- | --- | --- |
| 1 | Caption excerpt and lexical highlighting | Keep visible |
| 2 | One Play-at-time action | Keep visible |
| 3 | Linked source title and timestamp | Keep visible |
| 4 | Search field and result count | Keep visible and compact |
| 5 | Native multi-select control | Keep visible for supercuts |
| 6 | Result-specific provenance | Show inside Details |
| 7 | Transcript context and copy link | Show inside Details |
| 8 | Global caption caveat | Compact disclosure |
| 9 | Source filters | Remove from the current surface |
| 10 | Example searches | Remove from active-query state |
| 11 | Match-type badges | Remove unless a later semantic exception needs one |
| 12 | Thumbnails and duplicate Play | Remove |
| 13 | Eyebrows and redundant helper copy | Remove |

## Revised card anatomy

Each collapsed card now has five visible parts: a native checkbox, linked
source/time, quote, one Play button, and one Details disclosure. Details holds
the word-origin screen, before/after transcript context, a YouTube link, and
copy-link action. Selection is conveyed by checked state, text, border, and
shadow rather than color alone.

The grid uses three columns above 1,020 CSS pixels, two columns between 681 and
1,020 pixels, and one column at 680 pixels or below. Removing thumbnails and
secondary action rows makes the three-column scan practical without clipping
quotes or adding horizontal card scrolling.

## Supercut prototype boundary

Selection order is stored immediately in a checksummed `r1` URL fragment with
corpus source IDs and exact start/end milliseconds. It does not contain quote
text, titles, or embed IDs, and it is intentionally distinct from the future
stable-moment collection format.

No player exists before an explicit Play Supercut gesture. Playback then uses
one active YouTube embed and, unless reduced-data is requested, one hidden warm
standby embed for the next range. The current frame remains the only accessible
player. A visible Next control remains available because autoplay and iframe
handoff are browser/platform dependent; the interface does not promise gapless
playback.

## Remaining evidence limits

The audit and implementation do not establish recording-reviewed quote
wording, word origin, playback boundary accuracy, audiovisual smoothness,
reference-phone behavior, or cross-browser superellipse support. Those remain
separate review and device gates.
