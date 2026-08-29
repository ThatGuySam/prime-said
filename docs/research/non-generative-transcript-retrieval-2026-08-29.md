# Non-generative transcript retrieval and evidence safety

> **Tease:** Better search is not one score. Topic relevance, stance, and word origin fail in different ways.
> **Lede:** Use whole-token positional BM25 for candidates, pair quoted prompts with their response spans at build time, preserve literal sourced-word searches, and keep stance and origin as explicit metadata.
> **Why it matters:** A semantic match can be an article reading, a Twitch message, or the opposite of the proposition the user typed. Embeddings alone make those errors look more relevant.
> **Go deeper:** The review-tool ranker now passes 23/23 explicit development constraints, up from 16/23 for the legacy scorer. It was tuned on the same 14 queries and is not a gold, held-out, or general-corpus accuracy result.

**Date:** 2026-08-29
**Scope:** Static/build-time or browser-runtime search without a generative LLM.
**Local evidence:** Three complete YouTube auto-caption tracks, 1,753 overlapping search windows, and the existing 37-case attribution development screen.

## The failure modes are independent

The current `tests drive development` results mix four different outcomes:

1. a strong topical match that is later qualified as “opposite of TDD”;
2. an oppositional position that is still useful for a neutral topic query;
3. a likely chat or article reading that must not be treated as Prime's wording;
4. one-token or substring noise such as `drive` matching `driven` in the named talk *Fear Driven Development*.

These require three separate labels:

| Question | Output |
| --- | --- |
| Is the passage about the query? | graded topical relevance |
| What relationship does it have to a claim-like query? | supports, opposes, qualifies, mentions, unknown |
| Where did the words originate? | speaker-original, response, Twitch chat, screen source, mixed, unknown |

The same span can be relevant but unusable as evidence for a claim. The 4:48 *Fear And Software* span is relevant to `tests drive development`, but its wider context opposes `Prime supports TDD`. Literal queries such as `reverse funnel` should still find sourced words, with an origin warning.

## Manual transcript findings

The caption audit identified reusable challenge cases beyond the original TDD note:

- *Fear And Software*, 14:51–15:07: an unrelated transition repeats the talk title “Fear Driven Development.” It contains no testing discussion and must not satisfy `tests drive development` merely because two suffix terms match.
- *The Lies Of 100% Code Coverage*, 19:29–19:49: the early card boundary provides context, but the direct “tests that drive” wording begins in the raw caption track at about 19:41. The review result should link to the contributing caption, not the first context window.
- *Lets Chat About Unit Tests*, 10:10–10:23: names chat users, repeats “testing after development,” then responds.
- *Fear And Software*, 7:31–7:56: an article/source claim that testing builds confidence is followed by “I don't think testing is a way to build confidence.”
- *Lets Chat About Unit Tests*, 3:53–4:00: a chat merge-policy statement is followed by “I think that's wrong.”
- *Lets Chat About Unit Tests*, 8:09–8:43: “I need to test everything” is followed by an extended contrary response.
- *Lets Chat About Unit Tests*, 14:30–14:39: a chat question asks whether coverage should target 80%; the response says “no percent.”
- *Fear And Software*, 12:31–13:20: article prose about blameless postmortems is followed by a skeptical response.
- *Fear And Software*, 0:34: the uncued opening closely follows Julia Evans's article, so text-only discourse rules cannot prove origin.

These are caption-context observations, not recording verification.

## Recommended pipeline

### 1. Score atomic units; display wider context

Index clauses, conversational turns, or roughly 1–3 sentences. Keep a 35–55 second neighborhood for display. Wide overlapping windows are useful for reading but combine prompt and response, and can hide the decisive `but`, `wrong`, or `opposite` just beyond the card.

### 2. Use positional BM25F as the lexical baseline

Use whole-token postings, document frequency, field-length normalization, and positions. Require enough transcript-field anchors before title terms can boost a result. Add exact phrase and small-slop boosts. Use explicit lemma/alias families for ASR-friendly variants such as `test/tests/testing` and `drive/drives/driving/driven` instead of substring matching.

BM25 is a strong, inspectable baseline; BM25F extends the saturation and normalization treatment to weighted fields. Phrase positions add information that a bag of words lacks. See Robertson and Zaragoza's [BM25 survey](https://www.emerald.com/ftinr/article/4/1-2/1/1326508/The-Probabilistic-Relevance-Framework-BM25-and), the [BM25F paper](https://dl.acm.org/doi/10.1145/1031171.1031181), and Metzler and Croft's [term-dependency model](https://www-labs.iro.umontreal.ca/~nie/IFT6255/MetzlerCroft-2005.pdf).

### 3. Build source origin independently of the query

At ingestion time, align transcript shingles with linked source text, sampled-frame OCR, and any structured chat data. Use spoken usernames, “chat says,” “let me read,” pauses, and reading repairs as supporting cues. Split the source reading from the response and store both spans.

This remains a review router. ASR alone cannot establish authorship, and a text rule cannot catch an uncued article reading. The detailed cut line and OCR design remain in [quoted-source attribution](./quoted-source-attribution-2026-08-29.md).

### 4. Route claim-like queries through bounded stance rules

Neutral topic searches should include supportive, critical, and qualified discussion. For claim-like queries such as `Prime supports TDD`, scope cues to the same clause or turn: `not`, `don't buy`, `wrong`, `opposite`, `instead`, `rather than`, `prefer`, and `only when`. Abstain when cues conflict.

Simple lexical scope is a useful precision feature, not general language understanding. ConText is evidence that bounded surface cues can classify contextual properties in a constrained domain, while also documenting limits that require more knowledge; its domain is clinical text, so Prime Said must validate its own rules. See the [ConText paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC2757457/).

### 5. Collapse moments before adding diversity

Merge overlapping intervals and near-identical same-source windows before top-k. Then apply source caps or maximal marginal relevance if the results still repeat one discussion. Do not ask diversity scoring to repair raw duplicate chunks.

## Development experiment

`evals/development/caption-search-regressions.json` contains 14 retrieval queries plus one synthetic token-boundary case. Two constraints record the user's playback judgments about the unrelated 14:51 match and the later Code Coverage boundary. The rest remain caption-derived. The suite uses stable source/time spans and explicit constraints instead of pretending every unjudged result is irrelevant.

The evaluated variants were:

- `legacy`: the former OR-style substring scorer;
- `bm25-proximity`: whole-token aliases, stopword removal, BM25-style IDF/length normalization, transcript anchor coverage, phrase/proximity boosts, and 15-second duplicate collapse;
- `production`: the same candidate score plus build-time prompt-to-response routing, conservative origin weighting for creator-position queries, compound-query group coverage, and separate result-neighborhood/snippet selection.

| Development measure | Legacy | BM25 + proximity | Review production |
| --- | ---: | ---: | ---: |
| Required hit constraints | 8/9 | 9/9 | 9/9 |
| Response/direct-concept pairwise constraints | 5/8 | 4/8 | 8/8 |
| Protected literal sourced-word queries | 3/3 | 3/3 | 3/3 |
| Expected-no-result constraint | 0/1 | 1/1 | 1/1 |
| User-reviewed exclusion constraint | 0/1 | 1/1 | 1/1 |
| Whole-token boundary constraint | 0/1 | 1/1 | 1/1 |
| Explicit constraints passed | 16/23 | 19/23 | 23/23 |
| Quoted/mixed screening labels in creator-query top 3 | 3/21 | 5/18 | 2/19 |
| Duplicate source neighborhoods | 6 | 0 | 0 |

The final variant was tuned while these same failures were visible. The 23/23 result is a regression-screen result, not held-out accuracy. The cases are concentrated in three testing-themed videos. Most are not reviewed against recording audio or pixels, and the two user-reviewed cases cover only topical relevance and the rough playback boundary. The residual 2/19 origin-risk result also shows that prompt-to-response routing is incomplete.

## Tiny-model options

“No LLM” can mean either no neural language model at all, or no generative/hosted model. Keep that distinction explicit.

| Option | What it may improve | What it cannot establish | Recommendation |
| --- | --- | --- | --- |
| No neural model | exact, technical, phrase, and transparent topic search | paraphrase recall; uncued origin | production baseline after gold/device gates |
| Static embeddings such as Model2Vec | cheap build-time expansion or browser semantic rescue | word order, stance, authorship | experiment after the lexical baseline is frozen; [official repository](https://github.com/MinishLab/model2vec) |
| Ternlight Mini/Base | compact browser query embeddings and semantic candidates | source origin or reliable opposition | best small semantic bakeoff candidate; its repository reports 5.0/7.2 MB wire bundles, but Prime Said must measure its own phones and corpus; [official repository](https://github.com/soycaporal/ternlight) |
| TinyBERT MS MARCO cross-encoder | reranking a lexical top 20 | authorship; reliable stance without domain labels | optional control only; the model card is passage-ranking-specific and its published throughput is GPU-based; [model card](https://huggingface.co/cross-encoder/ms-marco-TinyBERT-L2-v2) |
| NLI classifier | query-relative support/opposition for declarative claims | topic fragments; source origin | later experiment, not a default ranker |

Dense semantic similarity often places opposites near each other because they share a topic. This is useful retrieval behavior for neutral exploration but unsafe evidence behavior for a claim. Hybrid search therefore needs separate stance and origin lanes rather than assuming a better embedding solves them.

## Decision and next gates

Use this deterministic ranker in the explicitly unverified `/review/` tool. Do not call it the canonical Phase 2 search or treat its scores as verified quotation evidence. A production-ranking gate still requires:

1. at least 50 frozen retrieval queries with recording-reviewed word origin and query-relative judgments;
2. pooled judgments across every candidate ranker rather than judging one system's top results;
3. a held-out split by video/source family;
4. reference-iPhone latency, memory, payload, and interaction measurements;
5. an unsafe-origin metric reported separately from topical nDCG.

Only after those gates should Prime Said declare the lexical ranker production-ready or choose lexical plus static embeddings or a tiny encoder/reranker. The deployed review ranker remains useful because it gives source reviewers fewer obvious collisions and more accurate playback starts without making unsupported quote claims.
