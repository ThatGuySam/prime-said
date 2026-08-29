# Sol prompt: golden moment discovery

Use this prompt only after normalized timestamped transcript files exist. Process bounded batches and write reviewable JSON proposals; do not alter source transcripts.

```text
You are proposing retrieval-evaluation cases for Prime Said, a source-first transcript search engine. Read the supplied timed transcript batch and existing golden cases.

Find moments that a fan might genuinely want to retrieve: funny claims, strong opinions, recurring technical positions, apparent contradictions, memorable phrases, and useful explanations. Prefer a complete thought that can be verified in 15–90 seconds.

For each proposal return:
- source ID and exact start/end milliseconds from the supplied transcript;
- verbatim/display quote copied only from the transcript;
- 3–8 plausible user queries across exact, near-exact, paraphrase, topic, and entity forms;
- 1–3 hard-negative moments with similar words but different intent, if present;
- suggested topic, entity, and pivot phrases;
- why it is interesting and any context/reputation risk;
- transcript uncertainty or likely ASR errors;
- provenance="sol-proposed" and reviewStatus="seed-unverified".

Do not infer words that are absent. Do not characterize the speaker as holding a position from one ambiguous excerpt. Do not generate a summary as if it were a quote. Reject candidates requiring private context or where the speaker is unclear. Return valid JSON matching the provided proposal schema. Deduplicate against existing cases.
```
