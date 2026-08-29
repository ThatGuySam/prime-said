# Quoted-source attribution for Prime Said

**Date:** 2026-08-29
**Status:** Text-only screening baseline implemented. Recording review and visual/source alignment remain open.

## SBC4 decision block

**Summary:** Prime Said needs two independent span-level facts: who vocalized the words and where the proposition originated. The 20:42 code-coverage seed is the motivating counterexample: Prime vocalizes words that the user identified, from direct playback, as a Twitch-chat message before responding.

**Best case:** A build-time detector aligns word-timed ASR with text visible in a chat, article, tweet, comment, or code-review region. High-confidence matches are marked as quoted-source candidates, the response boundary is retained separately, and reviewed examples become regression data.

**Counterevidence:** ASR alone has no authorship signal. Structured VOD chat is unavailable for many edited uploads and Twitch does not provide a documented historical VOD-chat API. OCR can miss stylized, scrolling, occluded, or briefly visible text. Audio-only quotations and paraphrases may have no deterministic high-confidence signal.

**Constraints:** No runtime LLM; no attribution claim from ASR text alone; no browser OCR of cross-origin video pixels; no automatic promotion to creator-authored gold; uncertain spans abstain.

**Confidence:** High that build-time OCR/chat-log alignment will catch many near-verbatim readings. Medium that discourse and timing rules will place the response boundary reliably. Low that any deterministic system can recall every quotation, especially audio-only or paraphrased sources.

**Cut line:** Do not publish a default “Prime said” quotation unless a human-reviewed span has `spokenBy=theprimeagen` and `wordsFrom=speaker-original`. Machine labels may route review or suppress candidates, but cannot establish gold authorship.

**Next step:** Review the screened spans against recording audio and pixels, promote only bounded reviewed cases, and use them to calibrate build-time OCR/source-text alignment.

## Implemented development baseline

The first implementation is intentionally a review router, not an authorship
judge:

- `evals/candidates/tdd-seed.json` stores the user's notes as paraphrase or
  topic clues. It contains no exact-match claim or relevance grade.
- `evals/attribution/screening-corpus.json` contains 37 word-timed development
  cases from full-caption Sol Ultra passes over the three seed videos: 15
  quoted-source, 14 response, seven creator-original, and one mixed case.
- `scripts/attribution-detector.ts` scores explicit source reports, read cues,
  reply boundaries, stated-method cues, and reading repairs. Quote state
  outranks first-person wording. Weak spans abstain.
- `scripts/evaluate-attribution.ts` reports coverage, unsafe-attribution count,
  quoted-source precision/recall, per-source results, and individual failures.
- Canonical moment validation now rejects non-removed quotes without reviewed
  `theprimeagen` vocal-speaker attribution, reviewed `speaker-original` word
  origin, and all four human-review scopes. Search-normalized transcript text
  cannot substantiate display wording.

The rules were built and revised against this same cue-enriched corpus. The
result is therefore descriptive development evidence only:

| Measure | Development result |
| --- | ---: |
| Exact five-class labels | 34/37 (91.9%) |
| Non-abstained coverage | 34/37 (91.9%) |
| Quoted-source precision | 14/14 (100%) |
| Quoted-source recall | 14/16 (87.5%) |
| Unsafe own-word attributions | 0 |

The three abstentions are all from *Fear And Software*: an uncued Julia Evans
article opening, a first-person article blockquote, and Prime's response at an
inferred word-level boundary. Those misses are useful. They show why text cues
alone cannot replace source-text alignment or frame review. The 100% precision
number is 14 tuned development predictions, not a population estimate, a
held-out result, or permission to publish quotes automatically.

All dataset text comes from YouTube's English-original auto-generated JSON3
captions acquired with yt-dlp 2026.08.19. The corpus records the SHA-256 of each
temporary caption artifact. Raw caption artifacts, video, and audio are not
committed.

## Full-caption findings

The same-video search requested by the user found stronger testing-preference
candidates than the approximate note locations:

| Video | Caption-screened Prime response or position | Important context |
| --- | --- | --- |
| [Code coverage, 19:17–19:51](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1157s) | Tests should be easier to run than the project, and difficult features should have tests that drive them. | This begins as a response to article text. The remembered 20:42 clue instead points at a chat fragment and an integration-testing response. |
| [Unit tests, 6:13–6:56](https://www.youtube.com/watch?v=IInciWyU74U&t=373s) | He says he loves driving implementation via tests, then gives the Harpoon development cycle as the reason. | The preceding first-person passage is a likely chat message. The boundary is the initial “yeah, absolutely.” |
| [Fear and Software, 4:41–5:12](https://www.youtube.com/watch?v=20SkiBvylyM&t=281s) | He describes a simple heuristic and says he uses tests to drive development when a task will require a long manual cycle. | He immediately calls the method “opposite of TDD,” so the isolated phrase must not become a TDD-endorsement claim. |

The passes also found high-value sourced-word examples:

- [*Fear And Software*, 0:34](https://www.youtube.com/watch?v=20SkiBvylyM&t=34s)
  closely tracks the first-person opening of Julia Evans's article. No spoken
  read cue appears in the detector input; only external source alignment catches
  it.
- [*Fear And Software*, 8:40](https://www.youtube.com/watch?v=20SkiBvylyM&t=520s)
  introduces “this tweet from Uncle Bob Martin,” reads it, then begins “I
  disagree.”
- [Code coverage, 15:45](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=945s)
  reads the Code4IT case list, then begins “yes, so this is where the 100% gets
  so dangerous.”
- [Unit tests, 7:50](https://www.youtube.com/watch?v=IInciWyU74U&t=470s)
  names a chat user, refers to what the person typed, rereads the proposition,
  then responds “exactly.”

Two additional official-upload leads have explicit “I know you're in the chat”
and “let me reread that” cues. They remain research leads because the snippets
were not retained as hashed word-timed artifacts and one upload contains
multiple voices.

## Evidence from the seed videos

The user's notes are retrieval memories, not transcripts. They must be stored as search intent and may not supply quote text, exact-match labels, or recording timestamps.

| Source window | Evidence | Current conclusion |
| --- | --- | --- |
| [Code coverage, 20:42](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1242s) | User reviewed the recording and identified Prime reading Twitch chat, then responding. Auto-captions place discussion of example and integration testing here but cannot identify word origin. | Preserve as a quoted-chat hard negative. Exact quoted text and response boundary still need recording transcription. |
| [Code coverage, 19:38–19:49](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1178s) | Auto-captions include “always have tests that drive any difficult feature” around 19:41. | Candidate Prime-authored TDD thought; ASR screening only, not verified wording or attribution. |
| [Unit tests, 6:14–6:22](https://www.youtube.com/watch?v=IInciWyU74U&t=374s) | Auto-captions include “love driving implementation via uh tests” around 6:15–6:20. | Candidate source for the remembered “driving implementation via tests” idea; recording review remains open. |
| [Fear and Software, 4:42–4:53](https://www.youtube.com/watch?v=20SkiBvylyM&t=282s) | Auto-captions put “I usually use tests as a way to drive development” around 4:48–4:52; 4:43 is a lead-in. | Candidate near-verbatim span; recording review remains open. The wider context says this is opposite to TDD, so it must not be labeled TDD endorsement. |

The current 20:42 association is unsafe in two independent ways: its remembered wording is absent from that caption window, and the user has identified the nearby utterance as chat-originated.

## Counterexample candidates

These examples are useful for building the attribution eval, but only the first has direct human playback evidence. The rest are ASR-and-context screening candidates that still require frame/audio review.

| Window | Pattern to test | Evidence state |
| --- | --- | --- |
| [20:42–21:03](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1242s) | Read Twitch chat, then respond | User-reviewed origin; exact boundary open |
| [17:53–18:03](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1073s) | “I never said…” / “I know you didn't say that…” dialogue-repair cue | ASR candidate |
| [0:00–0:15](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=0s) | Introduce and read an article title, then joke | ASR plus linked-article context |
| [0:35–0:59](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=35s) | Read article prose, then transition into commentary | ASR plus linked-article context |
| [19:09–19:19](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1149s) | Read article conclusion, then reject it | ASR plus reaction-video context |
| [Unit tests, 6:04–6:21](https://www.youtube.com/watch?v=IInciWyU74U&t=364s) | Likely read-chat span followed by “yeah, absolutely” and a first-person response | ASR/discourse candidate |
| [Unit tests, 7:21–7:30](https://www.youtube.com/watch?v=IInciWyU74U&t=441s) | “I love this take right here” before reading it | ASR/deictic-cue candidate |

## Options

### 1. Structured chat-log alignment

Fetch timestamped chat replay when a supported source exposes it, normalize messages, and align them to ASR words in a causal time window.

- Strength: cheapest and strongest evidence when the exact message and timestamp exist.
- Weakness: edited YouTube uploads may have originated on Twitch; historical Twitch VOD chat has no documented API and third-party downloaders are brittle.
- Use: optional high-confidence evidence, never the only detector.

YouTube tooling can expose `live_chat` as a subtitle-like track when it exists. Twitch's supported interfaces cover live chat; its developer forum confirms there is no documented VOD-chat endpoint. See [yt-dlp's live-chat behavior](https://github.com/yt-dlp/yt-dlp/issues/6010), [Twitch chat documentation](https://dev.twitch.tv/docs/chat/send-receive-messages/), and [Twitch's VOD-chat API discussion](https://discuss.dev.twitch.com/t/get-vod-chat-log-using-api/46251).

### 2. Build-time video OCR aligned to ASR — recommended

For likely reaction windows, transiently fetch only the needed media range, sample one or two frames per second, crop stable chat/article/source regions, skip unchanged crops, and run OCR. Reconstruct each visible text interval and align its normalized token sequence with word-timed ASR.

- Strength: works for burned-in Twitch chat and visible articles even when no structured log survives.
- Weakness: costs build time and can miss scrolling, stylized, small, or occluded text.
- Use: primary deterministic detector, with high-precision thresholds and abstention.

FFmpeg supplies deterministic frame sampling, while Tesseract or PaddleOCR can extract text and bounding boxes. RapidFuzz-style partial and token similarity can align OCR text with ASR without an LLM. Primary references: [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), [Tesseract command-line OCR](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), and [RapidFuzz similarity](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html).

### 3. Discourse, layout, and prosody rules

Use phrases such as “chat says,” “someone asks,” “let me read this,” a spoken username, a stable chat/source UI region, a pause, and a change in cadence as supporting features.

- Strength: cheap and useful for routing borderline cases.
- Weakness: “chat” often appears while addressing chat rather than quoting it; prosody varies; neither proves authorship.
- Use: evidence that raises or lowers review priority, never a standalone positive attribution.

Speaker diarization only identifies vocal speakers; it does not establish who authored words that one speaker reads. This is why the model must separate `spokenBy` from `wordsFrom`. See [NVIDIA NeMo's diarization scope](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/speaker_diarization/intro.html).

### 4. Browser-runtime OCR

Run OCR while the user searches or watches.

- Strength: can inspect media that was unavailable at build time.
- Weakness: slow on phones, nondeterministic, duplicates work per user, increases application weight, and cannot read pixels from a cross-origin video without compatible CORS access.
- Recommendation: reject for the MVP. Ship build-time attribution labels and expose them as filters/badges instead. See [MDN's cross-origin canvas rules](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image).

## Recommended detector

1. Generate candidate windows from transcript matches and reaction-video metadata.
2. Prefer a structured chat or source-text log when available.
3. Otherwise sample frames and OCR stable text regions at build time.
4. Reconstruct text visibility intervals; a source must be visible before or while the matching words are spoken.
5. Align OCR/source tokens against word-timed ASR with weighted token recall plus normalized edit similarity.
6. Use usernames, chat/source UI layout, explicit reading cues, pauses, and prosody only as secondary evidence.
7. Emit one of `speaker-original`, `twitch-chat`, `quoted-person`, `played-media`, `mixed`, or `unknown`.
8. Split a quote-then-response sequence into separate spans. The response may be a valid Prime quotation even when the preceding quoted text is excluded.
9. Mark strong matches as machine-flagged candidates; route borderline cases to review; abstain on everything else.
10. Publish only precomputed labels. The browser defaults to creator-original spans and may offer an explicit “include quoted sources” control.

Initial experiment thresholds, to be calibrated rather than treated as truth:

- High-confidence machine flag: at least eight normalized tokens, or six tokens containing two uncommon trigrams; weighted token recall at least 0.80; normalized edit similarity at least 0.85; mean OCR confidence at least 0.80; no competing source match within 0.05; valid temporal overlap.
- Review-only: at least five tokens, weighted recall at least 0.65, similarity at least 0.75, plus an explicit reading cue or stable source-text region.
- Otherwise: `unknown` and excluded from creator-original results.

The thresholds are starting hypotheses. Tune them against reviewed positive, quoted-source, boundary, and abstention cases rather than against the current unverified seeds. Before using automatic flags beyond review routing, require at least 0.98 quoted-source precision on a held-out video/layout set.

## Data-model correction

Store search memory, transcript evidence, vocal speaker, and word origin separately:

```json
{
  "intent": {
    "rememberedText": "I usually use tests as a way to drive development",
    "fidelity": "paraphrase",
    "provenance": "user-note"
  },
  "anchor": {
    "sourceId": "youtube:20SkiBvylyM",
    "approximateStartMs": 283000
  },
  "verifiedTranscriptSpan": null,
  "spokenBy": {
    "speakerId": null,
    "status": "pending"
  },
  "wordsFrom": {
    "kind": "unknown",
    "status": "pending"
  },
  "humanReview": {
    "status": "pending",
    "scopes": []
  }
}
```

Only a reviewed bounded span may provide display quote text. ASR `search` text must never count as quote evidence. A source's channel owner is not proof that every utterance originated with that person.

Move memory-derived seeds to `evals/candidates/`; reserve `evals/gold/` for bounded spans reviewed for wording, timing, vocal speaker, word origin, and relevance. The 20:42 chat reading belongs in gold only as a relevance-zero hard negative for queries seeking Prime's own position.

## Required regression cases

- Prime states his own view.
- Prime reads chat verbatim, then responds.
- Prime reads an article or tweet, then responds.
- Prime paraphrases a source rather than reading it exactly.
- A played clip contains another vocal speaker.
- The source text is visible but unrelated to the spoken sentence.
- A short/common phrase produces multiple OCR matches.
- OCR or timestamps are too weak, requiring abstention.

Measure quoted-source precision first. A false creator-attribution is worse than omitting a usable moment, so recall should be expanded only after the high-precision lane is stable.
