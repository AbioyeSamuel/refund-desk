import { AiClassification, ReasonCategory } from "../domain";
import { INJECTION_THRESHOLD, scanForInjection } from "../security/injection";
import { AiProvider } from "./provider";
import { ClassifyInput, ComposeInput } from "./prompts";
import { ComposedReply } from "./schemas";
import { templateReply } from "./templates";

/**
 * Offline stand-in used when no API key is configured, so the whole product can be
 * run and evaluated without credentials. It is a keyword heuristic, deliberately
 * simple; the real providers are the intended path.
 */

const REASON_PATTERNS: [ReasonCategory, RegExp][] = [
  ["not_received", /\b((hasn'?t|has not|didn'?t|did not|haven'?t|have not|never) (arrive|arrived|come|came|receive|received|get|got|gotten)|not (arrived|received|delivered)|lost (in the post|parcel|package)|where is my (order|parcel|package))\b/i],
  ["wrong_item", /\b(wrong (item|colou?r|size|product|model|one)|not what i ordered|sent me (a |the )?(different|wrong)|different (colou?r|size|item|product|model)|instead of|ordered\b.{0,80}\bbut (i )?(received|got))\b/i],
  ["damaged", /\b(damaged|broken|broke|cracked|smashed|shattered|dented|torn|ripped|scratched|chipped|crushed)\b/i],
  ["defective", /\b(defective|faulty|malfunction\w*|(doesn'?t|does not|don'?t|do not|didn'?t|did not|won'?t|will not|isn'?t|is not|aren'?t|not) (work|working|turn on|charge|power on|connect|pair)\w*|stopped working|dead on arrival|keeps (crashing|restarting|shutting))\b/i],
  ["not_as_described", /\b(not as described|doesn'?t match|looks (nothing|different)|misleading|not like the (photo|picture|description)s?)\b/i],
  ["cancel_order", /\bcancel\w*\b/i],
  ["changed_mind", /\b(changed? (my )?mind|don'?t (need|want|like)|no longer (need|want)|didn'?t like|doesn'?t fit|too (big|small)|return (it|this|them)|send (it|them) back)\b/i],
];

const REFUND_INTENT = /\b(refund|money back|return|reimburse|replace(ment)?|cancel|exchange)\w*/i;
const WORKS_FINE = /\b(works (fine|perfectly|great)|working (fine|perfectly)|no (issues|problems)|nothing wrong|love it)\b/i;
const SUMMARIES: Record<ReasonCategory, string> = {
  damaged: "Customer says the item arrived damaged.",
  defective: "Customer says the item is defective or not working.",
  wrong_item: "Customer says they received the wrong item.",
  not_as_described: "Customer says the item is not as described.",
  not_received: "Customer says the order has not arrived.",
  changed_mind: "Customer no longer wants the item.",
  cancel_order: "Customer wants to cancel the order.",
  other: "Customer message with no clear refund reason.",
};
const STOPWORDS = new Set(["the", "and", "with", "set", "pack", "for", "pro", "inch"]);

function tokens(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export class MockProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly model = "keyword-heuristics-v1";

  async classify(input: ClassifyInput): Promise<AiClassification> {
    const text = input.message;
    const reason = REASON_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? "other";

    // Item matching: score each item by overlapping words, keep the best-scoring ones.
    const words = new Set(tokens(text).flatMap((w) => [w, w.replace(/s$/, "")]));
    const scored = input.items.map((i) => ({
      id: i.id,
      score: tokens(i.name).filter((w) => w.length >= 3 && !STOPWORDS.has(w) && words.has(w)).length,
    }));
    const best = Math.max(0, ...scored.map((s) => s.score));
    const itemIds = best > 0 && input.items.length > 1 ? scored.filter((s) => s.score === best).map((s) => s.id) : [];

    const injection = scanForInjection(text);
    const problemReason = ["damaged", "defective", "not_as_described", "wrong_item"].includes(reason);
    const conflicting = problemReason && WORKS_FINE.test(text);

    const sentiment = /(!{2,}|\b(unacceptable|ridiculous|furious|worst|disgusting|scam)\b)/i.test(text)
      ? "angry"
      : /\b(disappointed|annoyed|frustrat\w*|upset|again)\b/i.test(text)
        ? "frustrated"
        : "calm";

    return {
      is_refund_request: reason !== "other" || REFUND_INTENT.test(text),
      reason_category: reason,
      item_ids: itemIds,
      summary: SUMMARIES[reason],
      confidence: reason === "other" ? 0.35 : 0.85,
      conflicting_claims: conflicting,
      conflict_notes: conflicting ? "Describes a problem with the item but also says it works fine." : null,
      manipulation_attempt: injection.score >= INJECTION_THRESHOLD,
      manipulation_notes: injection.score >= INJECTION_THRESHOLD ? "Message contains instructions aimed at the support system." : null,
      sentiment,
    };
  }

  async compose(input: ComposeInput): Promise<ComposedReply> {
    return templateReply(input);
  }
}
