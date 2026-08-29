import {
  Check,
  Clipboard,
  ExternalLink,
  Link,
  ListVideo,
  Play,
  Plus,
  Scissors,
  Search,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  decodeSupercut,
  encodeSupercut,
  MAX_SUPERCUT_CLIPS,
  SUPERCUT_PARAM,
} from "@/lib/supercut";
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
    return { label: "Origin unreviewed", detail: "No development screen overlaps this caption window.", risky: true };
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

function resolveSupercutReferences(
  corpus: SearchCorpus,
  references: ReturnType<typeof decodeSupercut>,
): RankedSearchWindow[] {
  return references.flatMap((reference) => {
    const source = corpus.sources.find((candidate) => candidate.sourceId === reference.sourceId);
    const windowMatch = source
      ? corpus.windows.find(
          (candidate) =>
            candidate.sourceId === source.sourceId &&
            candidate.startMs === reference.startMs &&
            candidate.endMs === reference.endMs,
        )
      : null;
    return source && windowMatch ? [{ ...windowMatch, source, score: 0 }] : [];
  });
}

function ResultCard({
  result,
  query,
  afterContext,
  copied,
  selected,
  onCopy,
  onPlay,
  onToggle,
}: {
  result: RankedSearchWindow;
  query: string;
  afterContext: string;
  copied: boolean;
  selected: boolean;
  onCopy: (result: RankedSearchWindow) => void;
  onPlay: (result: RankedSearchWindow) => void;
  onToggle: (result: RankedSearchWindow) => void;
}) {
  const timestamp = formatTimestamp(result.startMs);
  const sourceUrl = sourceTimestampUrl(result.source, result.startMs);
  const screen = screeningLabel(result);

  return (
    <li className="min-w-0">
      <Card
        className={cn(
          "continuous-corner continuous-card h-full overflow-hidden shadow-[0.3rem_0.3rem_0_#050504]",
          selected && "border-[#d7ff36] shadow-[0.3rem_0.3rem_0_#d7ff36]",
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-1">
          <h3 className="min-w-0 font-mono text-[0.64rem] font-bold uppercase leading-relaxed">
            <a
              className="text-[#aaa198] underline-offset-4 hover:underline focus-visible:underline"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span className="text-[#7aa2ff]">{timestamp}</span>
              <span aria-hidden="true"> · </span>
              <span>{result.source.title}</span>
            </a>
          </h3>
          <label className={cn(
            buttonVariants({ variant: selected ? "default" : "outline", size: "sm" }),
            "shrink-0 cursor-pointer has-[:focus-visible]:border-[#7aa2ff] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-[#7aa2ff]/35",
          )}>
            <input
              type="checkbox"
              className="sr-only"
              checked={selected}
              aria-label={`${selected ? "Remove" : "Add"} ${result.source.title} at ${timestamp} ${selected ? "from" : "to"} supercut`}
              onChange={() => onToggle(result)}
            />
            {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {selected ? "Added" : "Add"}
          </label>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col pt-0">
          <blockquote className="review-quote">{highlightedText(result.text, query)}</blockquote>

          <Button type="button" className="mt-auto w-full" onClick={() => onPlay(result)}>
            <Play aria-hidden="true" /> Play at {timestamp}
          </Button>

          <details className="mt-3 border-t border-[#4d4841] text-sm text-[#c2bbb1]">
            <summary className="flex min-h-11 cursor-pointer items-center font-extrabold text-[#f7f1e8]">Details</summary>
            <div className="space-y-3 pb-2 text-xs leading-relaxed">
              <div>
                <Badge variant={screen.risky ? "warning" : "default"}>{screen.label}</Badge>
                <p className="mt-2">{screen.detail}</p>
              </div>
              <Separator />
              <p><strong>Before </strong>{result.before || "No earlier caption context."}</p>
              <p><strong>After </strong>{afterContext || "No later caption context."}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "continuous-corner continuous-control")}
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink aria-hidden="true" /> YouTube
                </a>
                <Button type="button" size="sm" variant="outline" onClick={() => onCopy(result)}>
                  {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
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
    <Card className="continuous-corner continuous-card fixed bottom-4 right-4 z-30 w-[min(28rem,calc(100%-2rem))] overflow-hidden border-2 shadow-[0.6rem_0.6rem_0_rgb(0_0_0_/_55%)] max-[480px]:bottom-0 max-[480px]:right-0 max-[480px]:w-full max-[480px]:rounded-b-none max-[480px]:border-x-0 max-[480px]:border-b-0">
      <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-4 border-b border-[#625d55] px-3 py-2">
        <h2 className="truncate text-sm font-extrabold">{timestamp} · {result.source.title}</h2>
        <Button type="button" size="icon" variant="outline" aria-label="Close video player" onClick={onClose}><X aria-hidden="true" /></Button>
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
        <a className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start rounded-none")} href={sourceTimestampUrl(result.source, result.startMs)} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" /> Open on YouTube
        </a>
      </CardFooter>
    </Card>
  );
}

function iframeCommand(iframe: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  iframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

function SupercutPlayer({ clips, onClose }: { clips: RankedSearchWindow[]; onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const playerRefs = useRef<Array<HTMLIFrameElement | null>>([null, null]);
  const reduceData = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-data: reduce)").matches;
  const clipKey = clips.map((clip) => `${clip.source.platformId}:${clip.startMs}:${clip.endMs}`).join("|");

  useEffect(() => {
    setCurrentIndex(0);
    setEnded(false);
  }, [clipKey]);

  const advance = useCallback(() => {
    setCurrentIndex((index) => {
      if (index >= clips.length - 1) {
        setEnded(true);
        return index;
      }
      setEnded(false);
      return index + 1;
    });
  }, [clips.length]);

  const activeSlot = reduceData ? 0 : currentIndex % 2;
  const slotIndexes = reduceData
    ? [currentIndex]
    : currentIndex % 2 === 0
      ? [currentIndex, currentIndex + 1]
      : [currentIndex + 1, currentIndex];

  useEffect(() => {
    const previousSlot = activeSlot === 0 ? 1 : 0;
    iframeCommand(playerRefs.current[previousSlot], "pauseVideo");
    const current = clips[currentIndex];
    if (!current) return;
    iframeCommand(playerRefs.current[activeSlot], "seekTo", [current.startMs / 1_000, true]);
    iframeCommand(playerRefs.current[activeSlot], "unMute");
    iframeCommand(playerRefs.current[activeSlot], "playVideo");
  }, [activeSlot, clips, currentIndex]);

  useEffect(() => {
    function receivePlayerEvent(event: MessageEvent) {
      if (event.source !== playerRefs.current[activeSlot]?.contentWindow) return;
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) as { event?: string; info?: number } : null;
        if (message?.event === "onStateChange" && message.info === 0) advance();
      } catch {
        // Ignore unrelated postMessage traffic.
      }
    }
    window.addEventListener("message", receivePlayerEvent);
    return () => window.removeEventListener("message", receivePlayerEvent);
  }, [activeSlot, advance]);

  const current = clips[currentIndex];
  if (!current) return null;

  function embedUrl(clip: RankedSearchWindow, index: number): string {
    const params = new URLSearchParams({
      start: String(Math.floor(clip.startMs / 1_000)),
      end: String(Math.ceil(clip.endMs / 1_000)),
      autoplay: index === 0 ? "1" : "0",
      enablejsapi: "1",
      playsinline: "1",
      rel: "0",
    });
    if (typeof window !== "undefined") params.set("origin", window.location.origin);
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(clip.source.platformId)}?${params}`;
  }

  return (
    <Card className="continuous-corner continuous-card fixed bottom-4 right-4 z-40 w-[min(46rem,calc(100%-2rem))] overflow-hidden border-2 shadow-[0.7rem_0.7rem_0_rgb(0_0_0_/_60%)] max-[600px]:bottom-0 max-[600px]:right-0 max-[600px]:w-full max-[600px]:rounded-b-none max-[600px]:border-x-0 max-[600px]:border-b-0">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-[#625d55] px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] font-bold uppercase text-[#7aa2ff]">Supercut · clip {currentIndex + 1} of {clips.length}</p>
          <h2 className="truncate text-sm font-extrabold">{formatTimestamp(current.startMs)} · {current.source.title}</h2>
        </div>
        <Button type="button" size="icon" variant="outline" aria-label="Close supercut player" onClick={onClose}><X aria-hidden="true" /></Button>
      </CardHeader>

      <div className="relative aspect-video overflow-hidden bg-black">
        {slotIndexes.map((clipIndex, slotIndex) => {
          const clip = clips[clipIndex];
          if (!clip) return null;
          const active = slotIndex === activeSlot;
          return (
            <iframe
              key={`${slotIndex}:${clipIndex}:${clip.windowId}`}
              ref={(node) => { playerRefs.current[slotIndex] = node; }}
              className={cn("absolute inset-0 block h-full w-full border-0 transition-opacity duration-150", active ? "z-10 opacity-100" : "pointer-events-none opacity-0")}
              title={active ? `${clip.source.title} supercut clip` : `Preloaded next clip: ${clip.source.title}`}
              src={embedUrl(clip, clipIndex)}
              loading="eager"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen={active}
              aria-hidden={!active}
              onLoad={() => {
                playerRefs.current[slotIndex]?.contentWindow?.postMessage(JSON.stringify({ event: "listening" }), "*");
                if (active) iframeCommand(playerRefs.current[slotIndex], "playVideo");
              }}
            />
          );
        })}
        {ended ? (
          <div className="absolute inset-0 z-20 grid place-content-center bg-black/85 text-center">
            <p className="text-lg font-black">Supercut complete</p>
            <Button type="button" className="mt-4" onClick={() => { setEnded(false); setCurrentIndex(0); }}><Play aria-hidden="true" /> Replay</Button>
          </div>
        ) : null}
      </div>

      <CardFooter className="flex items-center justify-between gap-3 border-t border-[#625d55] p-3">
        <p className="text-xs text-[#aaa198]">
          {currentIndex < clips.length - 1
            ? reduceData
              ? "Data saver is on; the next clip loads at handoff."
              : "Next player is warmed; autoplay is best effort."
            : "Last clip."}
        </p>
        <div className="flex shrink-0 gap-2">
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={sourceTimestampUrl(current.source, current.startMs)} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Source</a>
          <Button type="button" size="sm" onClick={advance} disabled={currentIndex >= clips.length - 1}><SkipForward aria-hidden="true" /> Next</Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function SupercutBar({ clips, copied, onClear, onCopy, onPlay }: {
  clips: RankedSearchWindow[];
  copied: boolean;
  onClear: () => void;
  onCopy: () => void;
  onPlay: () => void;
}) {
  const durationMs = clips.reduce((total, clip) => total + (clip.endMs - clip.startMs), 0);
  const duration = `${Math.max(1, Math.round(durationMs / 1_000))} sec`;

  return (
    <Card className="continuous-corner continuous-card fixed bottom-4 left-1/2 z-30 w-[min(52rem,calc(100%-2rem))] -translate-x-1/2 border-2 shadow-[0.5rem_0.5rem_0_#050504]">
      <CardContent className="flex items-center justify-between gap-4 p-3 max-[640px]:flex-wrap">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-content-center rounded-full bg-[#d7ff36] text-[#11100f]"><Scissors aria-hidden="true" /></span>
          <div>
            <p className="font-extrabold">{clips.length} {clips.length === 1 ? "clip" : "clips"} · {duration}</p>
            <p className="text-xs text-[#aaa198]">Selection order is saved in this URL.</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 max-[420px]:w-full">
          <Button type="button" size="icon" variant="ghost" aria-label="Clear supercut" onClick={onClear}><Trash2 aria-hidden="true" /></Button>
          <Button type="button" variant="outline" onClick={onCopy}>{copied ? <Check aria-hidden="true" /> : <Link aria-hidden="true" />}{copied ? "Copied" : "Copy"}</Button>
          <Button type="button" className="max-[420px]:flex-1" onClick={onPlay}><ListVideo aria-hidden="true" /> Play supercut</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReviewApp() {
  const [corpus, setCorpus] = useState<SearchCorpus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftQuery, setDraftQuery] = useState(DEFAULT_QUERY);
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [activeResult, setActiveResult] = useState<RankedSearchWindow | null>(null);
  const [selectedClips, setSelectedClips] = useState<RankedSearchWindow[]>([]);
  const [supercutOpen, setSupercutOpen] = useState(false);
  const [copiedWindowId, setCopiedWindowId] = useState<string | null>(null);
  const [copiedSupercut, setCopiedSupercut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCorpus() {
      try {
        const response = await fetch("/review/captions.json", { signal: controller.signal });
        if (!response.ok) throw new Error(`Caption data returned ${response.status}`);
        const loadedCorpus = (await response.json()) as SearchCorpus;
        const url = new URL(window.location.href);
        const initialQuery = url.searchParams.get("q") ?? DEFAULT_QUERY;
        const references = decodeSupercut(new URLSearchParams(url.hash.slice(1)).get(SUPERCUT_PARAM));
        const hydratedClips = resolveSupercutReferences(loadedCorpus, references);
        setCorpus(loadedCorpus);
        setDraftQuery(initialQuery);
        setActiveQuery(initialQuery);
        setSelectedClips(hydratedClips);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    }
    void loadCorpus();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!corpus) return;

    function restoreSupercutFromUrl() {
      const references = decodeSupercut(new URLSearchParams(window.location.hash.slice(1)).get(SUPERCUT_PARAM));
      setSelectedClips(resolveSupercutReferences(corpus!, references));
      setSupercutOpen(false);
    }

    window.addEventListener("hashchange", restoreSupercutFromUrl);
    window.addEventListener("popstate", restoreSupercutFromUrl);
    return () => {
      window.removeEventListener("hashchange", restoreSupercutFromUrl);
      window.removeEventListener("popstate", restoreSupercutFromUrl);
    };
  }, [corpus]);

  const results = useMemo(() => (corpus ? searchTranscriptCorpus(corpus, activeQuery) : []), [activeQuery, corpus]);

  function extendedAfter(result: RankedSearchWindow): string {
    if (!corpus) return result.after;
    const continuation = corpus.windows.find((candidate) => candidate.sourceId === result.sourceId && candidate.startMs >= result.endMs);
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

  function writeSupercut(nextClips: RankedSearchWindow[]) {
    const url = new URL(window.location.href);
    const encoded = encodeSupercut(nextClips.map((clip) => ({ sourceId: clip.source.sourceId, startMs: clip.startMs, endMs: clip.endMs })));
    const hashParams = new URLSearchParams(url.hash.slice(1));
    if (encoded) hashParams.set(SUPERCUT_PARAM, encoded);
    else hashParams.delete(SUPERCUT_PARAM);
    url.hash = hashParams.toString();
    window.history.replaceState(null, "", url);
    setSelectedClips(nextClips);
  }

  function toggleClip(result: RankedSearchWindow) {
    const selected = selectedClips.some((clip) => clip.windowId === result.windowId);
    if (selected) {
      writeSupercut(selectedClips.filter((clip) => clip.windowId !== result.windowId));
      return;
    }
    if (selectedClips.length >= MAX_SUPERCUT_CLIPS) return;
    writeSupercut([...selectedClips, result]);
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

  async function copySupercut() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedSupercut(true);
    } catch {
      setCopiedSupercut(false);
    }
    window.setTimeout(() => setCopiedSupercut(false), 1_500);
  }

  const status = loadError ? "Caption data unavailable" : !corpus ? "Loading…" : activeQuery ? `${results.length} results` : "Ready";

  return (
    <>
      <main className={cn("mx-auto w-[min(82rem,calc(100%-2rem))] max-[760px]:w-[min(44rem,calc(100%-1.25rem))]", selectedClips.length > 0 && "pb-28")}>
        <header className="flex min-h-18 items-center border-b-2 border-[#625d55]">
          <a className="flex gap-1 text-xs font-black tracking-[0.12em] text-[#f7f1e8] no-underline" href="/" aria-label="Prime Said home">
            <span className="border-2 border-[#f7f1e8] p-2">PRIME</span>
            <span className="border-2 border-[#d7ff36] bg-[#d7ff36] p-2 text-[#11100f]">SAID</span>
          </a>
        </header>

        <section className="grid grid-cols-[minmax(14rem,0.7fr)_minmax(26rem,1.3fr)] items-center gap-x-[clamp(2rem,6vw,6rem)] gap-y-5 py-[clamp(2.25rem,5vw,4rem)] max-[760px]:grid-cols-1" aria-labelledby="page-title">
          <h1 id="page-title" className="text-[clamp(2.7rem,5.5vw,5rem)] font-black leading-[0.9] tracking-[-0.065em]">Find the moment.</h1>
          <div>
            <Card className="continuous-corner continuous-card border-2 shadow-[0.4rem_0.4rem_0_#050504]">
              <CardContent className="p-3">
                <form role="search" onSubmit={(event) => { event.preventDefault(); commitQuery(draftQuery); }}>
                  <label className="sr-only" htmlFor="transcript-search">Search caption words</label>
                  <div className="flex gap-2 max-[480px]:flex-wrap">
                    <div className="relative flex min-w-0 flex-1">
                      <Input ref={inputRef} id="transcript-search" name="q" type="search" value={draftQuery} placeholder="Search caption words" autoComplete="off" spellCheck={false} onChange={(event) => setDraftQuery(event.target.value)} />
                      {draftQuery ? (
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2" aria-label="Clear search" onClick={() => { commitQuery(""); inputRef.current?.focus(); }}><X aria-hidden="true" /></Button>
                      ) : null}
                    </div>
                    <Button type="submit" className="max-[480px]:w-full"><Search aria-hidden="true" /> Search</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            <details className="mt-3 text-xs leading-relaxed text-[#aaa198]">
              <summary className="min-h-8 cursor-pointer font-bold text-[#c2bbb1]">About caption accuracy</summary>
              <p className="max-w-3xl pb-1">Matches are not authorship or endorsement claims. Prime may be reading chat or another source, and auto captions can be wrong. Listen before quoting or characterizing his view.</p>
            </details>
          </div>
        </section>

        <section className="pb-12" aria-labelledby="results-title">
          <header className="flex items-end justify-between gap-8 border-b-2 border-[#625d55] py-4 max-[760px]:items-start max-[760px]:gap-2">
            <h2 id="results-title" className="max-w-[34ch] text-[clamp(1.45rem,2.5vw,2.35rem)] font-black leading-none tracking-[-0.045em]">{activeQuery ? `“${activeQuery}”` : "Search the caption tracks"}</h2>
            <p role="status" aria-live="polite" className="shrink-0 font-mono text-xs uppercase text-[#aaa198]">{status}</p>
          </header>

          <ol className="grid grid-cols-3 gap-4 pt-4 max-[1020px]:grid-cols-2 max-[680px]:grid-cols-1" aria-busy={!corpus && !loadError}>
            {loadError ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center"><h3 className="font-black">Caption data unavailable.</h3><p className="mt-2 text-[#aaa198]">Could not load caption data: {loadError}</p></li>
            ) : !corpus ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center text-[#aaa198]">Loading real caption tracks…</li>
            ) : !activeQuery ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center"><h3 className="font-black">Search for a phrase or idea.</h3></li>
            ) : results.length === 0 ? (
              <li className="col-span-full grid min-h-52 place-content-center text-center"><h3 className="font-black">No caption match.</h3><p className="mt-2 text-[#aaa198]">Try fewer or more concrete words.</p></li>
            ) : (
              results.map((result) => (
                <ResultCard
                  key={result.windowId}
                  result={result}
                  query={activeQuery}
                  afterContext={extendedAfter(result)}
                  copied={copiedWindowId === result.windowId}
                  selected={selectedClips.some((clip) => clip.windowId === result.windowId)}
                  onCopy={(copyTarget) => void copyResult(copyTarget)}
                  onPlay={(playTarget) => { setSupercutOpen(false); setActiveResult(playTarget); }}
                  onToggle={toggleClip}
                />
              ))
            )}
          </ol>
        </section>
      </main>

      {activeResult ? <PlayerDock result={activeResult} onClose={() => setActiveResult(null)} /> : null}
      {selectedClips.length > 0 && !supercutOpen ? (
        <SupercutBar clips={selectedClips} copied={copiedSupercut} onClear={() => writeSupercut([])} onCopy={() => void copySupercut()} onPlay={() => { setActiveResult(null); setSupercutOpen(true); }} />
      ) : null}
      {supercutOpen ? <SupercutPlayer clips={selectedClips} onClose={() => setSupercutOpen(false)} /> : null}
    </>
  );
}
