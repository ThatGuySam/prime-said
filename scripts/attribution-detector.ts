export type AttributionLabel =
  | "creator-original"
  | "quoted-source"
  | "response"
  | "mixed"
  | "unknown";

export type WordOrigin = "speaker-original" | "quoted-source" | "mixed" | "unknown";

export interface AttributionInput {
  previousText?: string;
  text: string;
  nextText?: string;
}

export interface AttributionEvidence {
  ruleId: string;
  axis: "quote" | "response" | "original" | "mixed";
  score: number;
  field: "previousText" | "text" | "nextText";
  match: string;
}

export interface AttributionResult {
  status: "screening-candidate";
  label: AttributionLabel;
  wordOriginCandidate: WordOrigin;
  scores: {
    quote: number;
    response: number;
    original: number;
  };
  evidence: AttributionEvidence[];
}

interface CueRule {
  id: string;
  pattern: RegExp;
  score: number;
}

const STRONG_QUOTE_OPENERS: CueRule[] = [
  { id: "quote.explicit-source-report", pattern: /\b(?:chat|someone|somebody|[a-z0-9_]{2,})\s+(?:just\s+)?(?:said|says|asks|asked|wrote)\b/iu, score: 4 },
  { id: "quote.explicit-reading-action", pattern: /\b(?:let me (?:re)?read|i(?:'m| am) going to quote|here(?:'s| is) what (?:they|he|she) wrote)\b/iu, score: 4 },
  { id: "quote.deictic-source", pattern: /\b(?:i (?:love|like) this take right here|this (?:take|question|comment|message) right here|oh i like this)\b/iu, score: 4 },
  { id: "quote.named-thanks", pattern: /\bthank you\s+[a-z0-9_]+\b/iu, score: 4 },
];

const NEXT_RESPONSE_MARKERS: CueRule[] = [
  { id: "quote.followed-by-explicit-reply", pattern: /^(?:yeah(?:,? absolutely|,? see)?|yes\b|no\b|perfectly fair|fair\b|facts\b|i (?:agree|disagree|do like|know you didn(?:'|’)t|don(?:'|’)t know if i actually agree|don(?:'|’)t think)|i(?:'m| am) actually|see i(?: i)* think|again\b|the target should be)/iu, score: 4 },
  { id: "quote.followed-by-deictic-reply", pattern: /\b(?:that(?:'s| is) (?:fair|wrong|also|meaningless)|not necessarily opposed to that|reason why i don(?:'|’)t like this)\b/iu, score: 4 },
];

const STRONG_RESPONSE_MARKERS: CueRule[] = [
  { id: "response.explicit-agreement", pattern: /^(?:yeah,? absolutely|perfectly fair|fair,? absolutely|i agree|i disagree|facts\b)/iu, score: 4 },
  { id: "response.explicit-disagreement", pattern: /^(?:yeah,? see i(?: i)* think|see i(?: i)* think|i do like|i don(?:'|’)t know if i actually agree|i don(?:'|’)t think|i know you didn(?:'|’)t|i(?:'m| am) actually not necessarily opposed|again\b)/iu, score: 4 },
  { id: "response.direct-answer", pattern: /^(?:yes\b|no\b|the target should be)/iu, score: 4 },
  { id: "response.deictic-judgment", pattern: /\b(?:that(?:'s| is) (?:fair|wrong|also)|not necessarily opposed to that|reason why i don(?:'|’)t like this)\b/iu, score: 4 },
];

const STRONG_ORIGINAL_MARKERS: CueRule[] = [
  { id: "original.stated-method", pattern: /\b(?:i usually|i prefer|i have a (?:very )?simple approach|my approach|my argument|in my experience|what i do|for me)\b/iu, score: 4 },
  { id: "original.workflow-rationale", pattern: /\b(?:this is why i|that(?:'s| is) why i|another reason why i|i use .{0,50} as a way to|i would much rather|i do like stable api testing)\b/iu, score: 4 },
  { id: "original.explicit-contrast", pattern: /\b(?:i don(?:'|’)t use|i don(?:'|’)t look at|opposite of tdd|that(?:'s| is) how i like building)\b/iu, score: 4 },
];

const MEDIUM_ORIGINAL_MARKERS: CueRule[] = [
  { id: "original.opinion", pattern: /\b(?:i think|i believe|my view|my take)\b/iu, score: 2 },
];

const READING_REPAIR = /\b(?:let(?:'s| us) see|hold on)\b/iu;

function normalize(text: string | undefined): string {
  return (text ?? "").normalize("NFKC").replace(/[\s\n]+/gu, " ").trim();
}

function applyRules(
  text: string,
  field: AttributionEvidence["field"],
  axis: AttributionEvidence["axis"],
  rules: readonly CueRule[],
  evidence: AttributionEvidence[],
): number {
  let total = 0;
  for (const rule of rules) {
    const match = text.match(rule.pattern)?.[0];
    if (!match) continue;
    total += rule.score;
    evidence.push({
      ruleId: rule.id,
      axis,
      score: rule.score,
      field,
      match,
    });
  }
  return total;
}

function applyPreviousQuoteState(
  previousText: string,
  evidence: AttributionEvidence[],
): { quote: number; response: number } {
  let quote = 0;
  let response = 0;
  for (const rule of STRONG_QUOTE_OPENERS) {
    const match = previousText.match(rule.pattern);
    if (!match?.[0]) continue;
    const trailingText = previousText.slice((match.index ?? 0) + match[0].length).trim();
    const trailingTokens = trailingText.split(/\s+/u).filter(Boolean).length;
    const axis = trailingTokens >= 3 ? "response" : "quote";
    if (axis === "response") response += rule.score;
    else quote += rule.score;
    evidence.push({
      ruleId: axis === "response" ? "response.after-completed-quote" : rule.id,
      axis,
      score: rule.score,
      field: "previousText",
      match: match[0],
    });
  }
  return { quote, response };
}

function originForLabel(label: AttributionLabel): WordOrigin {
  if (label === "creator-original" || label === "response") return "speaker-original";
  if (label === "quoted-source") return "quoted-source";
  return label;
}

/**
 * Conservative text-only screening. Scores route source review; they are not
 * probabilities and cannot establish authorship without recording evidence.
 */
export function detectAttribution(input: AttributionInput): AttributionResult {
  const previousText = normalize(input.previousText);
  const text = normalize(input.text);
  const nextText = normalize(input.nextText);
  const evidence: AttributionEvidence[] = [];

  const previousState = applyPreviousQuoteState(previousText, evidence);
  let quote = previousState.quote;
  quote += applyRules(text, "text", "quote", STRONG_QUOTE_OPENERS, evidence);
  quote += applyRules(nextText, "nextText", "quote", NEXT_RESPONSE_MARKERS, evidence);

  let response = previousState.response;
  response += applyRules(text, "text", "response", STRONG_RESPONSE_MARKERS, evidence);
  let original = applyRules(text, "text", "original", STRONG_ORIGINAL_MARKERS, evidence);
  original += applyRules(text, "text", "original", MEDIUM_ORIGINAL_MARKERS, evidence);

  const readingRepairMatches = text.match(new RegExp(READING_REPAIR.source, "giu")) ?? [];
  const containsStrongReadingRepair = /\bhold on\b/iu.test(text) || readingRepairMatches.length >= 2;
  if (containsStrongReadingRepair && quote >= 4 && /\b(?:i|my)\b/iu.test(text)) {
    evidence.push({
      ruleId: "mixed.reading-repair",
      axis: "mixed",
      score: 4,
      field: "text",
      match: text.match(READING_REPAIR)?.[0] ?? "reading repair",
    });
    return {
      status: "screening-candidate",
      label: "mixed",
      wordOriginCandidate: "mixed",
      scores: { quote, response, original },
      evidence,
    };
  }

  let label: AttributionLabel = "unknown";
  if (quote >= 4 && response < 4) {
    label = "quoted-source";
  } else if (response >= 4 && previousText.length > 0) {
    label = "response";
  } else if (original >= 4 && quote < 2 && (response < 4 || previousText.length === 0)) {
    label = "creator-original";
  }

  return {
    status: "screening-candidate",
    label,
    wordOriginCandidate: originForLabel(label),
    scores: { quote, response, original },
    evidence,
  };
}
