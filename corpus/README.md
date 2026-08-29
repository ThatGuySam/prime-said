# Corpus data

Canonical source, transcript, moment, and collection records live in the directories described by `docs/data-model.md`. JSON files in those directories must validate against the matching schema in `docs/schemas/`.

`fixtures/tdd-sources.json` is not canonical corpus data. It projects the
source clues and remembered search intent from
`evals/candidates/tdd-seed.json`. Its `candidate-unverified` status must remain
until a human checks the original recordings. Do not promote these entries
into `evals/gold/`, `sources/`, `transcripts/`, or `moments/` without bounded,
reviewed wording, timing, speaker, and word-origin evidence.
