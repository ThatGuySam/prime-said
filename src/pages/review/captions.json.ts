import type { APIRoute } from "astro";

import fixtureData from "../../../corpus/fixtures/tdd-auto-caption-review.json";
import screeningData from "../../../evals/attribution/screening-corpus.json";
import {
  buildReviewSearchCorpus,
  type AttributionScreeningFixture,
  type ReviewCaptionFixture,
} from "../../lib/review-corpus.ts";

export const prerender = true;

const corpus = buildReviewSearchCorpus(
  fixtureData as ReviewCaptionFixture,
  screeningData as AttributionScreeningFixture,
);

export const GET: APIRoute = () =>
  new Response(JSON.stringify(corpus), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
