import {
  Check,
  Clipboard,
  ExternalLink,
  Play,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  formatTimestamp,
  normalizeSearchText,
  searchTranscriptCorpus,
  sourceTimestampUrl,
  tokenizeQuery,
  type RankedSearchWindow,
  type SearchCorpus,
} from "@/lib/transcript-search";
import { cn } from "@/lib/utils";

const DEFAULT_QUERY = "tests drive development";
const EXAMPLE_QUERIES = [
  { label: "driving implementation", query: "driving implementation" },
  { label: "reverse funnel", query: "reverse funnel" },
  { label: "100% code coverage", query: "100% code coverage means nothing" },
];

function highlightedText(text: string, query: string): ReactNode[] {
  const tokens = tokenizeQuery(query).sort((left, right) => right.length - left.length);
  if (tokens.length === 0) return [text];

  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  const normalizedTokens = new Set(tokens);

  return parts.map((part, index) =>
    normalizedTokens.has(normalizeSearchText(part)) ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}

function screeningLabel(result: RankedSearchWindow): { label: string; detail: string; risky: boolean } {
  const screening = result.screening;
  if (!screening) {
    return {
      label: "Origin unreviewed",
      detail: "No development screen overlaps this caption window.",
      risky: true,
    };
  }

  if (
    screening.reviewStatus === "user-reviewed-window" &&
    (screening.label === "quoted-source" || screening.label === "mixed")
  ) {
    return {
      label: "Chat/response sequence",
      detail: "The sequence was user-reviewed; exact wording and boundary remain unreviewed.",
      risky: true,
    };
  }
  if (screening.label === "quoted-source" || screening.label === "mixed") {
    return {
      label: "Possible source reading",
      detail: "A deterministic caption screen found quotation cues. Playback review is still required.",
      risky: true,
    };
  }
  if (screening.label === "response") {
    return {
      label: "Possible response",
      detail: "The development screen marks a response window. Exact wording and origin remain unreviewed.",
      risky: false,
    };
  }
  return {
    label: "Origin unreviewed",
    detail: "No source-reading cue won the development screen. That does not prove authorship.",
    risky: true,
  };
}

function matchLabel(result: RankedSearchWindow, query: string): string {
  if (result.matchReason === "response-to-source") return "Response to matched source";
  return normalizeSearchText(result.text).includes(normalizeSearchText(query))
    ? "Exact caption wording"
    : "Caption terms";
}

function ResultCard({
  result,
  query,
  afterContext,
  copied,
  onCopy,
  onPlay,
}: {
  result: RankedSearchWindow;
  query: string;
  afterContext: string;
  copied: boolean;
  onCopy: (result: RankedSearchWindow) => void;
  onPlay: (result: RankedSearchWindow) => void;
}) {
  const timestamp = formatTimestamp(result.startMs);
  const sourceUrl = sourceTimestampUrl(result.source, result.startMs);
  const screen = screeningLabel(result);

  return (
    <li className="min-w-0">
      <Card className="continuous-corner continuous-card h-full overflow-hidden shadow-[0.35rem_0.35rem_0_#050504]">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 font-mono text-[0.66rem] font-bold uppercase text-[#aaa198]">
            <div className="flex min-w-0 flex-wrap gap-2">
              <span className="text-[#7aa2ff]">{timestamp}</span>
              <span>{result.source.title}</span>
            </div>
            <Badge variant="outline">{matchLabel(result, query)}</Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col pt-1">
          <blockquote className="review-quote">{highlightedText(result.text, query)}</blockquote>
          <div className="mb-3 mt-auto">
            <Badge variant={screen.risky ? "warning" : "default"}>{screen.label}</Badge>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="continuous-corner continuous-control group relative h-auto w-full overflow-hidden rounded-xl border-0 p-0"
            aria-label={`Play ${result.source.title} at ${timestamp}`}
            onClick={() => onPlay(result)}
          >
            <img
              className="aspect-video w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
              src={`https://i.ytimg.com/vi/${encodeURIComponent(result.source.platformId)}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span className="continuous-corner continuous-control absolute bottom-3 left-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#171814] bg-[#d7ff36] px-3 text-xs font-black text-[#171814] shadow-[0.2rem_0.2rem_0_#171814]">
              <Play aria-hidden="true" /> Play at {timestamp}
            </span>
          </Button>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => onPlay(result)}>
              <Play aria-hidden="true" /> Play at {timestamp}
            </Button>
            <a
              className={cn(buttonVariants({ variant: "outline" }), "continuous-corner continuous-control")}
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink aria-hidden="true" /> Open recording
            </a>
            <Button type="button" variant="outline" onClick={() => onCopy(result)}>
              {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
              {copied ? "Link copied" : "Copy YouTube link"}
            </Button>
          </div>

          <details className="mt-3 border-t border-[#4d4841] text-sm text-[#c2bbb1]">
            <summary className="flex min-h-11 cursor-pointer items-center font-extrabold">
              Transcript context
            </summary>
            <div className="space-y-2 pb-3 text-xs leading-relaxed">
              <p><strong>Before </strong>{result.before || "No earlier caption context."}</p>
              <p><strong>After </strong>{afterContext || "No later caption context."}</p>
              <Separator />
              <p>{screen.detail}</p>
            </div>
          </details>
        </CardContent>
      </Card>
    </li>
  );
}

function PlayerDock({ result, onClose }: { result: RankedSearchWindow; onClose: () => void }) {
  const timestamp = formatTimestamp(result.startMs);
  const seconds = Math.floor(result.startMs / 1_000);

  return (
    <Card className="continuous-corner continuous-card fixed bottom-4 right-4 z-20 w-[min(28rem,calc(100%-2rem))] overflow-hidden border-2 shadow-[0.6rem_0.6rem_0_rgb(0_0_0_/_55%)] max-[480px]:bottom-0 max-[480px]:right-0 max-[480px]:w-full max-[480px]:rounded-b-none max-[480px]:border-x-0 max-[480px]:border-b-0">
      <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-4 border-b border-[#625d55] px-3 py-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.6rem] font-extrabold uppercase text-[#7aa2ff]">Playing source</p>
          <h2 className="truncate text-sm font-extrabold">{timestamp} · {result.source.title}</h2>
        </div>
        <Button type="button" size="icon" variant="outline" aria-label="Close video player" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </CardHeader>
      <div className="aspect-video bg-[#171814]">
        <iframe
          key={result.windowId}
          className="block h-full w-full border-0"
          title={`${result.source.title} at ${timestamp}`}
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(result.source.platformId)}?start=${seconds}&autoplay=1&playsinline=1&rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <CardFooter className="p-0">
        <a
          className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start rounded-none")}
          href={sourceTimestampUrl(result.source, result.startMs)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink aria-hidden="true" /> Open on YouTube
        </a>
      </CardFooter>
    </Card>
  );
}

export function ReviewApp() {
  const [corpus, setCorpus] = useState<SearchCorpus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftQuery, setDraftQuery] = useState(DEFAULT_QUERY);
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [activeSource, setActiveSource] = useState("all");
  const [activeResult, setActiveResult] = useState<RankedSearchWindow | null>(null);
  const [copiedWindowId, setCopiedWindowId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCorpus() {
      try {
        const response = await fetch("/review/captions.json", { signal: controller.signal });
        if (!response.ok) throw new Error(`Caption data returned ${response.status}`);
        const loadedCorpus = (await response.json()) as SearchCorpus;
        const initialQuery = new URL(window.location.href).searchParams.get("q") ?? DEFAULT_QUERY;
        setCorpus(loadedCorpus);
        setDraftQuery(initialQuery);
        setActiveQuery(initialQuery);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    }

    void loadCorpus();
    return () => controller.abort();
  }, []);

  const results = useMemo(
    () => (corpus ? searchTranscriptCorpus(corpus, activeQuery, activeSource) : []),
    [activeQuery, activeSource, corpus],
  );

  function extendedAfter(result: RankedSearchWindow): string {
    if (!corpus) return result.after;
    const continuation = corpus.windows.find(
      (candidate) =>
        candidate.sourceId === result.sourceId &&
        candidate.startMs >= result.endMs,
    );
    return continuation?.text ?? result.after;
  }

  function commitQuery(query: string) {
    const normalizedQuery = query.trim();
    setDraftQuery(normalizedQuery);
    setActiveQuery(normalizedQuery);
    setActiveResult(null);

    const url = new URL(window.location.href);
    if (normalizedQuery) url.searchParams.set("q", normalizedQuery);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }

  async function copyResult(result: RankedSearchWindow) {
    try {
      await navigator.clipboard.writeText(sourceTimestampUrl(result.source, result.startMs));
      setCopiedWindowId(result.windowId);
    } catch {
      setCopiedWindowId(null);
    }
    window.setTimeout(() => setCopiedWindowId(null), 1_500);
  }

  const sources = corpus
    ? [{ sourceId: "all", title: "All videos" }, ...corpus.sources.map((source) => ({ sourceId: source.sourceId, title: source.title }))]
    : [];
  const status = loadError
    ? "Caption data unavailable"
    : !corpus
      ? "Loading…"
      : activeQuery
        ? `${results.length} matching windows`
        : "Ready";

  return (
    <>
      <main className="mx-auto w-[min(78rem,calc(100%-2rem))] max-[760px]:w-[min(44rem,calc(100%-1.25rem))]">
        <header className="flex min-h-18 items-center justify-between gap-4 border-b-2 border-[#625d55]">
          <a className="flex gap-1 text-xs font-black tracking-[0.12em] text-[#f7f1e8] no-underline" href="/" aria-label="Prime Said home">
            <span className="border-2 border-[#f7f1e8] p-2">PRIME</span>
            <span className="border-2 border-[#d7ff36] bg-[#d7ff36] p-2 text-[#11100f]">SAID</span>
          </a>
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#aaa198]">Caption review</p>
        </header>

        <section className="grid grid-cols-[minmax(14rem,0.75fr)_minmax(26rem,1.25fr)] items-end gap-x-[clamp(2rem,6vw,6rem)] gap-y-6 pb-9 pt-[clamp(2.5rem,6vw,4.5rem)] max-[760px]:grid-cols-1" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Search real caption tracks</p>
            <h1 id="page-title" className="text-[clamp(2.8rem,6vw,5.5rem)] font-black leading-[0.9] tracking-[-0.065em]">Find the moment.</h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-[#c2bbb1]">Search caption words, then play the recording at the matching time.</p>
          </div>

          <Card className="continuous-corner continuous-card border-2 shadow-[0.5rem_0.5rem_0_#050504]">
            <CardContent className="p-4">
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  commitQuery(draftQuery);
                }}
              >
                <label className="mb-2 block text-sm font-extrabold" htmlFor="transcript-search">Caption words</label>
                <div className="flex gap-2 max-[480px]:flex-wrap">
                  <div className="relative flex min-w-0 flex-1">
                    <Input
                      ref={inputRef}
                      id="transcript-search"
                      name="q"
                      type="search"
                      value={draftQuery}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setDraftQuery(event.target.value)}
                    />
                    {draftQuery ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        aria-label="Clear search"
                        onClick={() => {
                          commitQuery("");
                          inputRef.current?.focus();
                        }}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                  <Button type="submit" className="max-[480px]:w-full"><Search aria-hidden="true" /> Search</Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Example searches">
                  <span className="font-mono text-[0.66rem] uppercase text-[#aaa198]">Try</span>
                  {EXAMPLE_QUERIES.map((example) => (
                    <Button key={example.query} type="button" size="sm" variant="outline" onClick={() => commitQuery(example.query)}>
                      {example.label}
                    </Button>
                  ))}
                </div>
              </form>
            </CardContent>
          </Card>

          <Alert variant="warning" className="continuous-corner continuous-control col-span-full max-[760px]:col-span-1">
            <ShieldAlert className="absolute left-4 top-4 size-5" aria-hidden="true" />
            <div className="pl-7">
              <AlertTitle>A caption match is not an authorship or endorsement claim.</AlertTitle>
              <AlertDescription>
                Prime may be reading Twitch chat, an article, or another source, and a topical match may oppose the query. Listen and inspect the screen before quoting or characterizing his view.
              </AlertDescription>
            </div>
          </Alert>
        </section>

        <section className="pb-12" aria-labelledby="results-title">
          <header className="flex items-end justify-between gap-8 border-b-2 border-[#625d55] py-4 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-2">
            <div>
              <p className="eyebrow">Caption matches</p>
              <h2 id="results-title" className="max-w-[30ch] text-[clamp(1.55rem,3vw,2.6rem)] font-black leading-none tracking-[-0.045em]">
                {activeQuery ? `“${activeQuery}”` : "Search the caption tracks"}
              </h2>
            </div>
            <p role="status" aria-live="polite" className="font-mono text-xs uppercase text-[#aaa198]">{status}</p>
          </header>

          {corpus ? (
            <div className="flex gap-2 overflow-x-auto border-b border-[#4d4841] py-3" role="group" aria-label="Filter by source">
              {sources.map((source) => (
                <Button
                  key={source.sourceId}
                  type="button"
                  size="sm"
                  variant={activeSource === source.sourceId ? "default" : "outline"}
                  aria-pressed={activeSource === source.sourceId}
                  onClick={() => setActiveSource(source.sourceId)}
                >
                  {source.title}
                </Button>
              ))}
            </div>
          ) : null}

          <ol className="grid grid-cols-2 gap-4 pt-4 max-[760px]:grid-cols-1" aria-busy={!corpus && !loadError}>
            {loadError ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center">
                <h3 className="font-black">Caption data unavailable.</h3>
                <p className="mt-2 text-[#aaa198]">Could not load caption data: {loadError}</p>
              </li>
            ) : !corpus ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center text-[#aaa198]">Loading real caption tracks…</li>
            ) : !activeQuery ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center">
                <h3 className="font-black">Search for a phrase or idea.</h3>
                <p className="mt-2 text-[#aaa198]">Try one of the examples above, or enter words from your notes.</p>
              </li>
            ) : results.length === 0 ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center">
                <h3 className="font-black">No caption match.</h3>
                <p className="mt-2 text-[#aaa198]">Try fewer or more concrete words. This preview only searches caption text.</p>
              </li>
            ) : (
              results.map((result) => (
                <ResultCard
                  key={result.windowId}
                  result={result}
                  query={activeQuery}
                  afterContext={extendedAfter(result)}
                  copied={copiedWindowId === result.windowId}
                  onCopy={(copyTarget) => void copyResult(copyTarget)}
                  onPlay={setActiveResult}
                />
              ))
            )}
          </ol>
        </section>

        <details className="mb-12 border-y border-[#4d4841] text-sm leading-relaxed text-[#aaa198]">
          <summary className="flex min-h-14 cursor-pointer items-center font-extrabold text-[#f7f1e8]">About these results</summary>
          <div className="grid grid-cols-3 gap-6 pb-5 max-[760px]:grid-cols-1 max-[760px]:gap-3">
            <p>{corpus ? `${corpus.sources.length} real videos · ${corpus.windows.length.toLocaleString()} timed caption windows` : "Loading real caption tracks…"}</p>
            <p>YouTube English auto captions are normalized for literal browser-side search and are unreviewed for wording, vocal speaker, and word origin.</p>
            <p>This is bounded review tooling, not a verified quote library.</p>
          </div>
        </details>
      </main>

      {activeResult ? <PlayerDock result={activeResult} onClose={() => setActiveResult(null)} /> : null}
    </>
  );
}
