# TDD seed source screening

**Date:** 2026-08-29
**Status:** Metadata and auto-caption screening complete. Recording review still open.

## Method and limit

All three YouTube IDs resolve to public, embeddable videos on The PrimeTime channel, `UCUyeluBRhGPCW4rPe_UvBZQ`. Public metadata and YouTube's English auto-generated timed text were inspected. Audio and video playback did not initialize in the available browser, so these findings do not verify a quote or timestamp. The fixtures must remain `seed-unverified`.

## Findings

| Source | Seed | Auto-caption screening | Candidate recording review |
| --- | ---: | --- | --- |
| *The Lies Of 100% Code Coverage \| Prime Reacts* (`S_7SE_Uzk-I`) | 20:42 | Captions at 20:42 discuss "example testing" and "integration testing," not driving implementation. Captions near 19:41.520 say "tests that drive any difficult feature." The one-minute difference may be a timestamp typo. | Listen from 19:38 through 19:47 and again from 20:39 through 20:47. Confirm wording and which span, if either, belongs in the gold set. |
| *Lets Chat About Unit Tests* (`IInciWyU74U`) | 6:20 | Captions from 6:15.360 through 6:20.720 contain "love driving implementation via uh tests." This appears to match wording currently attached to the first seed source. | Listen from 6:14 through 6:22. Set the sentence and playback boundaries only after review. |
| *Fear And Software* (`20SkiBvylyM`) | 4:43 | The seed is a lead-in. Captions place "I usually use tests as a way to drive development" from 4:48.479 through 4:51.680. | Listen from 4:42 through 4:53. Decide whether 4:43 is the desired context lead-in or whether the citation should begin near 4:48. |

The first two rows are a material seed-data conflict. Do not tune retrieval against the current source-to-wording assignment until a person listens to both clips.

## Direct source links

- [Code coverage seed at 20:42](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1242s)
- [Code coverage candidate at 19:42](https://www.youtube.com/watch?v=S_7SE_Uzk-I&t=1182s)
- [Unit tests candidate at 6:15](https://www.youtube.com/watch?v=IInciWyU74U&t=375s)
- [Fear and Software seed at 4:43](https://www.youtube.com/watch?v=20SkiBvylyM&t=283s)
- [Fear and Software exact-wording candidate at 4:48](https://www.youtube.com/watch?v=20SkiBvylyM&t=288s)
