# SEO, attribution, source health, and takedown policy

## Search indexing strategy

Google can render JavaScript, but its own guidance notes limitations, and other crawlers may ignore client-rendered content. Prime Said therefore puts indexable value in static HTML. Client-side search is progressive application behavior, not the indexable content strategy.

### Indexable

- curated moment pages with a reviewed excerpt, explanation, timestamp, source attribution, and related moments;
- curated topic pages with a distinctive introduction and a selected set of verified moments;
- curated supercuts with editorial premise, ordered sources, and why each moment belongs;
- project/about, methods, data, and correction policy pages.

### Not indexable by default

- arbitrary query strings;
- raw client search results;
- thin pages generated only by swapping keywords;
- complete per-video transcript/watch pages;
- private/local collection payloads unless explicitly published and reviewed;
- unavailable/deleted moments without continuing unique value.

Canonical tags, sitemaps, and robots directives must reflect these classes. Dynamic rendering by user-agent detection is not used; Google describes it as a workaround with added complexity.

## Unique value test

Before publishing an indexable page, answer yes to all:

1. Does the page provide a reviewed quote or curated sequence unavailable as a simple YouTube title/result?
2. Does it explain why the moment matters or how several moments relate?
3. Can a user reach the original source at the exact timestamp?
4. Is the visible text consistent with structured data?
5. Would the page remain useful if it did not rank in search?

If not, keep it inside client search and use `noindex`.

## Video structured data

Where eligible, curated moment pages may use `VideoObject` with nested `Clip` markup:

- use the original embed/source URL and platform thumbnail as permitted;
- set the exact `startOffset` and `endOffset` represented on the page;
- give every clip a unique, accurate label;
- keep name/description/thumbnail consistent with visible page content;
- do not claim Prime Said hosts the video bytes;
- test with Google's Rich Results Test and treat eligibility as optional, not guaranteed.

For an ordered supercut of several source videos, use a visible source list and appropriate page/breadcrumb metadata. Do not force one misleading `VideoObject` over unrelated hosts.

## Topic page generation

Topic pages come from a reviewed manifest. A daily corpus build can invalidate and regenerate them. A first-request Worker cache is allowed only when:

- the topic slug is drawn from the reviewed manifest;
- all copy and moments are already build-generated or curator-authored;
- the response is cached by corpus version;
- it has the same content for users and crawlers;
- arbitrary phrases receive a client search redirect or `noindex` page.

Prefer pre-rendering when the topic list is known. The Worker option exists for build-size/operational convenience, not SEO cloaking.

## Attribution standard

Every result and indexable page names:

- speaker/creator as applicable;
- original video title;
- hosting channel and platform;
- publication date when known;
- exact timestamp and direct source URL;
- transcript/model provenance through a methods disclosure;
- that the transcript may contain errors and the recording is authoritative.

Alternate appearances are labeled. Do not imply a short clip is the original when a longer official appearance is available.

## Informal creator approval

The least burdensome approval approach is a short, concrete note through a public business/contact route or a trusted community moderator:

- link a working preview and the removal policy;
- state that videos remain on YouTube/Twitch and that search runs locally;
- explain the humorous TDD example without claiming endorsement;
- offer a simple opt-out, correction route, or repository issue;
- do not delay basic lawful public-source development indefinitely waiting for a reply;
- record any explicit permission, restriction, or request privately and translate it into repository policy where appropriate.

Avoid repeated direct messages or mobilizing users to demand a response.

## Takedown and correction process

Requests may arrive through a repository issue or published contact route. Required information: affected Prime Said URL or stable ID, source URL, request type, and a way to clarify scope.

Priority order:

1. credible creator/rights-holder safety, privacy, or rights request;
2. wrong-speaker, materially wrong quote, or wrong timestamp;
3. deleted/private source or platform restriction;
4. ordinary transcription correction;
5. preference/editorial disagreement.

Actions include correcting text, changing canonical appearance, removing a result/page, marking unavailable, or suppressing a source from future ingestion. The project need not retain or display the quote of a deleted video. Internal Git history cannot guarantee erasure from all forks, so sensitive material should not be committed unnecessarily.

## Source health

- Check direct source availability during ingestion/build, not on every user search.
- Store `available`, `private`, `deleted`, `region-limited`, `embed-disabled`, or `unknown` with last-checked time.
- When canonical source disappears, promote a verified allowed alternate.
- If no appearance survives, remove it from search and curated pages on the next build; a user-facing unavailable tombstone is optional only if it has useful context and no disputed quote.
- Do not retain or serve downloaded video/audio as a fallback.

## Contribution policy

Source proposals use an allow-list PR with source identity, official/host relationship, why it is relevant, and rights/context notes. Automated transcript PRs must be structured and small enough for quick review. Maintainers may decline scope without debating the truth of the creator's opinion.

## Disclaimers

Prime Said is unofficial, may contain transcription errors, and is designed for discovery and verification. It should never present a semantic match as a definitive characterization of a person. The recording in context is the evidence.
