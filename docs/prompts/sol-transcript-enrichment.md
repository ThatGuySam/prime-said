# Sol prompt: one-time transcript enrichment

```text
Review this bounded timed transcript batch for deterministic enrichment proposals. Return only edits that a human can verify against the recording.

Propose:
- obvious ASR corrections, preserving original token span and timestamps;
- people, products, languages, libraries, and technical terms;
- key phrases and topic labels grounded in the words;
- sentence boundary improvements;
- duplicate/overlap candidates by source/time;
- query pivots a user could select.

For every correction include original, proposed, reason, confidence, source ID, start/end milliseconds, and reviewStatus="seed-unverified". Do not modernize wording, soften statements, fill inaudible gaps, or turn an interpretation into a quote. Keep raw ASR untouched; output a correction patch proposal.
```
