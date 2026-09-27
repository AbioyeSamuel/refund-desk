import { SecuritySignals } from "../domain";

/**
 * Layer 1 of prompt-injection defence: cheap, deterministic screening that runs
 * before any model sees the text. It is intentionally conservative — a hit does
 * not block the request, it routes it to a human (policy R11). The real guarantee
 * comes from the architecture: the model never makes the decision.
 */

export const MAX_MESSAGE_CHARS = 2000;

interface Pattern {
  id: string;
  re: RegExp;
  weight: number;
}

const PATTERNS: Pattern[] = [
  { id: "ignore_instructions", re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(instruction|rule|polic(y|ies)|prompt|guideline|restriction)s?/i, weight: 0.6 },
  { id: "system_prompt_probe", re: /\b(system|developer|hidden|initial)\s+(prompt|message|instruction)s?\b/i, weight: 0.5 },
  { id: "role_reassignment", re: /\b(you are now|act as|pretend (to be|you are)|roleplay as|from now on you)\b/i, weight: 0.5 },
  { id: "mode_switch", re: /\b(developer|debug|admin|god|jailbreak|dan)\s+mode\b/i, weight: 0.6 },
  { id: "forced_decision", re: /\b(you (must|have to|will|are required to)|always)\s+(approve|authori[sz]e|grant|issue)\b/i, weight: 0.5 },
  { id: "decision_injection", re: /(\bdecision\b|\bstatus\b|\boutcome\b)\s*[:=]\s*["']?(approved?|accept(ed)?)/i, weight: 0.7 },
  { id: "staff_impersonation", re: /\b(i am|i'm|this is)\s+(an?\s+)?(admin|administrator|manager|supervisor|developer|staff|employee|agent)\b/i, weight: 0.4 },
  { id: "authorization_claim", re: /\b(pre-?approved|already approved|authori[sz]ed by|manager\b.{0,20}\b(said|approved|authori[sz]ed|agreed)|override code|approval code)\b/i, weight: 0.5 },
  { id: "markup_injection", re: /<\/?\s*(system|assistant|user|instructions?|tool|customer_message)\b|\[\/?(INST|SYS)\]|<\|im_(start|end)\|>/i, weight: 0.7 },
  { id: "policy_rewrite", re: /\b(new|updated|revised) (refund )?polic(y|ies)\b.*\b(says|allows|states)\b/i, weight: 0.4 },
  { id: "encoded_payload", re: /\b[A-Za-z0-9+/]{60,}={0,2}(?=\s|$)/, weight: 0.3 },
];

export const INJECTION_THRESHOLD = 0.5;

/** Normalises text so look-alike tricks (zero-width chars, full-width letters) can't dodge the patterns. */
export function sanitizeMessage(raw: string): { text: string; truncated: boolean } {
  let text = raw.normalize("NFKC");
  text = text.replace(/[​-‏‪-‮⁠-⁤﻿]/g, ""); // zero-width & bidi controls
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""); // control chars (keep \t \n \r)
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  const truncated = text.length > MAX_MESSAGE_CHARS;
  if (truncated) text = text.slice(0, MAX_MESSAGE_CHARS);
  return { text, truncated };
}

export function scanForInjection(text: string): { score: number; matched: string[] } {
  const matched = PATTERNS.filter((p) => p.re.test(text));
  const score = Math.min(1, matched.reduce((s, p) => s + p.weight, 0));
  return { score: Math.round(score * 100) / 100, matched: matched.map((p) => p.id) };
}

/** Finds order numbers in free text, e.g. "ORD-1001", "order #1001", "order no. 1001". */
export function extractOrderRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(/\bORD[-\s]?(\d{4,})\b/gi)) refs.add(`ORD-${m[1]}`);
  for (const m of text.matchAll(/\border\s*(?:#|no\.?|number)?\s*(\d{4,})\b/gi)) refs.add(`ORD-${m[1]}`);
  return [...refs];
}

export function buildSecuritySignals(
  text: string,
  truncated: boolean,
  foreignOrderRefs: string[],
): SecuritySignals {
  const { score, matched } = scanForInjection(text);
  return {
    injection_score: score,
    injection_flagged: score >= INJECTION_THRESHOLD,
    matched_patterns: matched,
    foreign_order_refs: foreignOrderRefs,
    truncated,
  };
}

/**
 * Neutralises anything in customer text that could be mistaken for prompt structure
 * before it is embedded inside XML-style delimiters.
 */
export function fenceUntrusted(text: string): string {
  return text.replace(/</g, "‹").replace(/>/g, "›");
}
