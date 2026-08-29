import type {
  AttributionScreening,
  SearchCorpus,
  SearchSource,
  SearchWindow,
  ScreeningLabel,
} from "./transcript-search.ts";

export interface ReviewCaptionSegment {
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
  search: string;
}

export interface ReviewCaptionSource {
  sourceId: string;
  platformId: string;
  title: string;
  channel: string;
  durationMs: number;
  segments: ReviewCaptionSegment[];
}

export interface ReviewCaptionFixture {
  schemaVersion: 1;
  status: "screening-unverified";
  generatedAt: string;
  sources: ReviewCaptionSource[];
}

interface ScreeningCase {
  sourceId: string;
  startMs: number;
  endMs: number;
  screening: {
    label: ScreeningLabel;
    wordsFrom: string;
    reviewStatus: string;
    confidence: number;
    notes: string;
  };
}

export interface AttributionScreeningFixture {
  cases: ScreeningCase[];
}

const WINDOW_SEGMENT_COUNT = 5;
const CONTEXT_SEGMENT_COUNT = 2;

function bestScreening(
  sourceId: string,
  startMs: number,
  endMs: number,
  cases: ScreeningCase[],
): AttributionScreening | null {
  const riskPriority = (candidate: ScreeningCase): number => {
    const quotedRisk = candidate.screening.label === "quoted-source" || candidate.screening.label === "mixed";
    const userReviewed = candidate.screening.reviewStatus === "user-reviewed-window";
    return (quotedRisk ? 2 : 0) + (userReviewed ? 1 : 0);
  };
  const matches = cases
    .filter(
      (candidate) =>
        candidate.sourceId === sourceId && candidate.endMs > startMs && candidate.startMs < endMs,
    )
    .map((candidate) => ({
      candidate,
      overlap: Math.min(endMs, candidate.endMs) - Math.max(startMs, candidate.startMs),
    }))
    .sort(
      (left, right) =>
        riskPriority(right.candidate) - riskPriority(left.candidate) ||
        right.overlap - left.overlap ||
        right.candidate.screening.confidence - left.candidate.screening.confidence ||
        left.candidate.startMs - right.candidate.startMs,
    );

  return matches[0]?.candidate.screening ?? null;
}

function joinText(segments: ReviewCaptionSegment[]): string {
  return segments.map((segment) => segment.text).join(" ").replace(/\s+/gu, " ").trim();
}

export function buildReviewSearchCorpus(
  fixture: ReviewCaptionFixture,
  screeningFixture: AttributionScreeningFixture,
): SearchCorpus {
  const sources: SearchSource[] = fixture.sources.map((source) => ({
    sourceId: source.sourceId,
    platformId: source.platformId,
    title: source.title,
    channelName: source.channel,
    durationMs: source.durationMs,
  }));
  const windows: SearchWindow[] = [];

  for (const source of fixture.sources) {
    source.segments.forEach((segment, index) => {
      const windowSegments = source.segments.slice(index, index + WINDOW_SEGMENT_COUNT);
      if (windowSegments.length === 0) return;
      const endMs = windowSegments.at(-1)!.endMs;
      windows.push({
        windowId: `${source.platformId}:${segment.startMs}`,
        sourceId: source.sourceId,
        startMs: segment.startMs,
        endMs,
        text: joinText(windowSegments),
        before: joinText(
          source.segments.slice(Math.max(0, index - CONTEXT_SEGMENT_COUNT), index),
        ),
        after: joinText(
          source.segments.slice(
            index + WINDOW_SEGMENT_COUNT,
            index + WINDOW_SEGMENT_COUNT + CONTEXT_SEGMENT_COUNT,
          ),
        ),
        screening: bestScreening(
          source.sourceId,
          segment.startMs,
          endMs,
          screeningFixture.cases,
        ),
      });
    });
  }

  return {
    schemaVersion: 1,
    status: "youtube-auto-captions-unreviewed",
    generatedAt: fixture.generatedAt,
    sources,
    windows,
    screeningSpans: screeningFixture.cases.map((screeningCase) => ({
      sourceId: screeningCase.sourceId,
      startMs: screeningCase.startMs,
      endMs: screeningCase.endMs,
      label: screeningCase.screening.label,
    })),
  };
}
