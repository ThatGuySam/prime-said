# Corpus data

Canonical source, transcript, moment, and collection records live in the directories described by `docs/data-model.md`. JSON files in those directories must validate against the matching schema in `docs/schemas/`.

`fixtures/tdd-sources.json` is not canonical corpus data. It projects the
source clues and remembered search intent from
`evals/candidates/tdd-seed.json`. Its `candidate-unverified` status must remain
until a human checks the original recordings. Do not promote these entries
into `evals/gold/`, `sources/`, `transcripts/`, or `moments/` without bounded,
reviewed wording, timing, speaker, and word-origin evidence.

`fixtures/tdd-auto-caption-review.json` is also non-canonical. It contains the
three complete English YouTube auto-caption tracks used by the bounded review
locator: 1,753 timed, machine-generated segments. The source JSON3 byte hashes
must match `evals/attribution/screening-corpus.json`. All wording is
machine-generated and unreviewed; vocal speaker and word origin remain unknown.
A search hit therefore locates caption text near a recording timestamp but
does not prove that Prime spoke or originated the words.

Rebuild the fixture only from the matching `.en.json3` and `.info.json` files,
using the actual acquisition timestamp:

```sh
bun run fixture:review-captions -- \
  --raw-dir /path/to/hash-matching-caption-files \
  --generated-at 2026-08-29T13:27:06Z
```

The builder stops if a video ID, title, or caption hash differs from the
screened sources. Raw caption downloads and media remain uncommitted.
