# Corpus data

Canonical source, transcript, moment, and collection records live in the directories described by `docs/data-model.md`. JSON files in those directories must validate against the matching schema in `docs/schemas/`.

`fixtures/tdd-sources.json` is not canonical corpus data. It copies the user-supplied source IDs, titles, timestamps, and known wording from `evals/gold/tdd-seed.json`. Its `seed-unverified` status must remain until a human checks the original sources. Do not promote these entries into `sources/`, `transcripts/`, or `moments/` without verified source metadata and timestamp spans.
