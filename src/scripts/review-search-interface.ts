import {
  formatTimestamp,
  normalizeSearchText,
  searchTranscriptCorpus,
  sourceTimestampUrl,
  tokenizeQuery,
  type RankedSearchWindow,
  type SearchCorpus,
} from "../lib/transcript-search.ts";

const form = document.querySelector<HTMLFormElement>("#search-form")!;
const input = document.querySelector<HTMLInputElement>("#transcript-search")!;
const clearSearch = document.querySelector<HTMLButtonElement>("#clear-search")!;
const title = document.querySelector<HTMLElement>("#results-title")!;
const status = document.querySelector<HTMLElement>("#result-status")!;
const resultList = document.querySelector<HTMLOListElement>("#results")!;
const sourceFilters = document.querySelector<HTMLElement>("#source-filters")!;
const dataCount = document.querySelector<HTMLElement>("#data-count")!;
const playerDock = document.querySelector<HTMLElement>("#player-dock")!;
const playerFrame = document.querySelector<HTMLElement>("#player-frame")!;
const playerTitle = document.querySelector<HTMLElement>("#player-title")!;
const playerSource = document.querySelector<HTMLAnchorElement>("#player-source")!;
const closePlayer = document.querySelector<HTMLButtonElement>("#close-player")!;

let corpus: SearchCorpus | null = null;
let activeQuery = input.value;
let activeSource = "all";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appendHighlighted(parent: HTMLElement, text: string, query: string): void {
  const tokens = tokenizeQuery(query).sort((left, right) => right.length - left.length);
  if (tokens.length === 0) {
    parent.textContent = text;
    return;
  }

  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  const normalizedTokens = new Set(tokens);
  for (const part of parts) {
    if (normalizedTokens.has(normalizeSearchText(part))) {
      parent.append(element("mark", undefined, part));
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function screeningLabel(result: RankedSearchWindow): { label: string; detail: string } {
  const screening = result.screening;
  if (!screening) {
    return {
      label: "Origin unreviewed",
      detail: "No development screen overlaps this caption window.",
    };
  }

  if (
    screening.reviewStatus === "user-reviewed-window" &&
    (screening.label === "quoted-source" || screening.label === "mixed")
  ) {
    return {
      label: "Chat/response sequence",
      detail: "The sequence was user-reviewed; exact wording and boundary remain unreviewed.",
    };
  }
  if (screening.label === "quoted-source" || screening.label === "mixed") {
    return {
      label: "Possible source reading",
      detail: "A deterministic caption screen found quotation cues. Playback review is still required.",
    };
  }
  if (screening.label === "response") {
    return {
      label: "Possible response",
      detail: "The development screen marks a response window. Exact wording and origin remain unreviewed.",
    };
  }
  return {
    label: "Origin unreviewed",
    detail: "No source-reading cue won the development screen. That does not prove authorship.",
  };
}

function matchLabel(result: RankedSearchWindow): string {
  return normalizeSearchText(result.text).includes(normalizeSearchText(activeQuery))
    ? "Exact wording"
    : "Caption terms";
}

function closePlayback(): void {
  playerFrame.replaceChildren();
  playerDock.hidden = true;
}

function playResult(result: RankedSearchWindow): void {
  const seconds = Math.floor(result.startMs / 1_000);
  const iframe = document.createElement("iframe");
  iframe.title = `${result.source.title} at ${formatTimestamp(result.startMs)}`;
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(result.source.platformId)}?start=${seconds}&autoplay=1&playsinline=1&rel=0`;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allowFullscreen = true;

  playerFrame.replaceChildren(iframe);
  playerTitle.textContent = `${formatTimestamp(result.startMs)} · ${result.source.title}`;
  playerSource.href = sourceTimestampUrl(result.source, result.startMs);
  playerDock.hidden = false;
}

function createContext(result: RankedSearchWindow, originDetail: string): HTMLDetailsElement {
  const details = element("details", "context");
  const summary = element("summary", undefined, "Transcript context");
  const body = element("div", "context-body");
  const before = element("p");
  before.append(
    element("strong", undefined, "Before "),
    document.createTextNode(result.before || "No earlier caption context."),
  );
  const after = element("p");
  after.append(
    element("strong", undefined, "After "),
    document.createTextNode(result.after || "No later caption context."),
  );
  body.append(before, after, element("p", "origin-detail", originDetail));
  details.append(summary, body);
  return details;
}

function createResult(result: RankedSearchWindow): HTMLLIElement {
  const item = element("li", "result-card");
  item.dataset.resultId = result.windowId;
  const article = element("article");

  const metadata = element("div", "result-meta");
  const sourceMeta = element("div");
  sourceMeta.append(
    element("span", "timestamp", formatTimestamp(result.startMs)),
    element("span", undefined, result.source.title),
  );
  metadata.append(sourceMeta, element("span", "match-kind", matchLabel(result)));

  const quote = element("blockquote");
  appendHighlighted(quote, result.text, activeQuery);

  const screen = screeningLabel(result);
  const screening = element("p", "screening");
  screening.append(element("span", "screening-label", screen.label));

  const media = element("button", "thumbnail-button");
  media.type = "button";
  media.setAttribute(
    "aria-label",
    `Play ${result.source.title} at ${formatTimestamp(result.startMs)}`,
  );
  const image = element("img");
  image.src = `https://i.ytimg.com/vi/${encodeURIComponent(result.source.platformId)}/hqdefault.jpg`;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  media.append(
    image,
    element("span", "play-label", `▶ Play at ${formatTimestamp(result.startMs)}`),
  );
  media.addEventListener("click", () => playResult(result));

  const actions = element("div", "actions");
  const play = element("button", "primary-action", `Play at ${formatTimestamp(result.startMs)}`);
  play.type = "button";
  play.addEventListener("click", () => playResult(result));

  const sourceLink = element("a", undefined, `Open recording at ${formatTimestamp(result.startMs)}`);
  sourceLink.href = sourceTimestampUrl(result.source, result.startMs);
  sourceLink.target = "_blank";
  sourceLink.rel = "noreferrer";

  const copy = element("button", undefined, "Copy YouTube link");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(sourceLink.href);
      copy.textContent = "YouTube link copied";
    } catch {
      copy.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      copy.textContent = "Copy YouTube link";
    }, 1_500);
  });

  actions.append(play, sourceLink, copy);
  article.append(
    metadata,
    quote,
    screening,
    media,
    actions,
    createContext(result, screen.detail),
  );
  item.append(article);
  return item;
}

function updateClearControl(): void {
  clearSearch.hidden = input.value.length === 0;
}

function render(): void {
  if (!corpus) return;
  const results = searchTranscriptCorpus(corpus, activeQuery, activeSource);
  resultList.replaceChildren();
  title.textContent = activeQuery ? `“${activeQuery}”` : "Search the caption tracks";
  status.textContent = activeQuery ? `${results.length} matching windows` : "Ready";
  resultList.setAttribute("aria-busy", "false");

  if (!activeQuery) {
    const item = element("li", "empty");
    item.append(
      element("h3", undefined, "Search for a phrase or idea."),
      element("p", undefined, "Try one of the examples above, or enter words from your notes."),
    );
    resultList.append(item);
    return;
  }

  if (results.length === 0) {
    const item = element("li", "empty");
    item.append(
      element("h3", undefined, "No caption match."),
      element("p", undefined, "Try fewer or more concrete words. This preview only searches caption text."),
    );
    resultList.append(item);
    return;
  }
  resultList.append(...results.map(createResult));
}

function runQuery(query: string): void {
  activeQuery = query.trim();
  input.value = activeQuery;
  updateClearControl();
  const url = new URL(window.location.href);
  if (activeQuery) url.searchParams.set("q", activeQuery);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
  render();
}

function renderSourceFilters(): void {
  if (!corpus) return;
  const choices = [
    { sourceId: "all", title: "All videos" },
    ...corpus.sources.map((source) => ({ sourceId: source.sourceId, title: source.title })),
  ];
  sourceFilters.replaceChildren(
    ...choices.map((choice) => {
      const button = element("button", choice.sourceId === activeSource ? "active" : "", choice.title);
      button.type = "button";
      button.setAttribute("aria-pressed", String(choice.sourceId === activeSource));
      button.addEventListener("click", () => {
        activeSource = choice.sourceId;
        renderSourceFilters();
        render();
      });
      return button;
    }),
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runQuery(input.value);
});

input.addEventListener("input", updateClearControl);

clearSearch.addEventListener("click", () => {
  runQuery("");
  input.focus();
});

closePlayer.addEventListener("click", closePlayback);

document.querySelectorAll<HTMLButtonElement>("[data-query]").forEach((button) => {
  button.addEventListener("click", () => runQuery(button.dataset.query ?? ""));
});

async function start(): Promise<void> {
  try {
    const response = await fetch("/review/captions.json");
    if (!response.ok) throw new Error(`Caption data returned ${response.status}`);
    corpus = await response.json() as SearchCorpus;
    const segmentCount = corpus.windows.length;
    dataCount.textContent = `${corpus.sources.length} real videos · ${segmentCount.toLocaleString()} timed caption windows`;
    renderSourceFilters();
    const initialQuery = new URL(window.location.href).searchParams.get("q") ?? activeQuery;
    runQuery(initialQuery);
  } catch (error) {
    resultList.setAttribute("aria-busy", "false");
    status.textContent = "Caption data unavailable";
    const message = error instanceof Error ? error.message : String(error);
    resultList.append(element("li", "empty", `Could not load caption data: ${message}`));
  }
}

void start();
