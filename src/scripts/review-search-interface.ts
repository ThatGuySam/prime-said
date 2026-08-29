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
const title = document.querySelector<HTMLElement>("#results-title")!;
const status = document.querySelector<HTMLElement>("#result-status")!;
const resultList = document.querySelector<HTMLOListElement>("#results")!;
const sourceFilters = document.querySelector<HTMLElement>("#source-filters")!;
const dataCount = document.querySelector<HTMLElement>("#data-count")!;

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

  if (screening.reviewStatus === "user-reviewed-window") {
    return {
      label: "Chat/response sequence reviewed",
      detail: "The sequence was user-reviewed; exact wording and boundary remain unreviewed.",
    };
  }
  if (screening.label === "quoted-source" || screening.label === "mixed") {
    return {
      label: "Possible source reading",
      detail: "A deterministic caption screen found quotation cues. Playback review is still required.",
    };
  }
  return {
    label: "Origin unreviewed",
    detail: "No source-reading cue won the development screen. That does not prove authorship.",
  };
}

function createResult(result: RankedSearchWindow): HTMLLIElement {
  const item = element("li", "result-card");
  item.dataset.resultId = result.windowId;
  const article = element("article");
  const metadata = element("div", "result-meta");
  metadata.append(
    element("span", "timestamp", formatTimestamp(result.startMs)),
    element("span", undefined, result.source.title),
  );
  const quote = element("blockquote");
  appendHighlighted(quote, result.text, activeQuery);

  const screen = screeningLabel(result);
  const screening = element("div", "screening");
  screening.append(
    element("span", "screening-label", screen.label),
    element("span", "screening-detail", screen.detail),
  );

  const context = element("div", "context");
  context.hidden = true;
  const before = element("p");
  before.append(element("strong", undefined, "Before "), document.createTextNode(result.before || "No earlier caption context."));
  const after = element("p");
  after.append(element("strong", undefined, "After "), document.createTextNode(result.after || "No later caption context."));
  context.append(before, after);

  const actions = element("div", "actions");
  const sourceLink = element("a", "primary-action", `Open recording at ${formatTimestamp(result.startMs)}`);
  sourceLink.href = sourceTimestampUrl(result.source, result.startMs);
  sourceLink.target = "_blank";
  sourceLink.rel = "noreferrer";

  const copy = element("button", undefined, "Copy source");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(sourceLink.href);
    copy.textContent = "Copied";
    window.setTimeout(() => { copy.textContent = "Copy source"; }, 1_500);
  });

  const expand = element("button", undefined, "More context");
  expand.type = "button";
  expand.setAttribute("aria-expanded", "false");
  expand.addEventListener("click", () => {
    context.hidden = !context.hidden;
    expand.setAttribute("aria-expanded", String(!context.hidden));
    expand.textContent = context.hidden ? "More context" : "Less context";
  });

  actions.append(sourceLink, copy, expand);
  article.append(metadata, quote, screening, context, actions);
  item.append(article);
  return item;
}

function render(): void {
  if (!corpus) return;
  const results = searchTranscriptCorpus(corpus, activeQuery, activeSource);
  resultList.replaceChildren();
  title.textContent = `“${activeQuery || "No query"}”`;
  status.textContent = `${results.length} matching windows`;
  resultList.setAttribute("aria-busy", "false");

  if (results.length === 0) {
    const item = element("li", "empty");
    item.append(
      element("h3", undefined, "No literal caption match."),
      element("p", undefined, "Try fewer words. This review tool does not invent a semantic answer."),
    );
    resultList.append(item);
    return;
  }
  resultList.append(...results.map(createResult));
}

function runQuery(query: string): void {
  activeQuery = query.trim();
  input.value = activeQuery;
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
