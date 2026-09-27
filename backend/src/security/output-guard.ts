import { Decision } from "../domain";

/**
 * Layer 3 of the AI safeguards: validate what the model wants to say to the
 * customer before it is sent. If any check fails, the service falls back to a
 * deterministic template, so a compromised or confused model can at worst
 * produce a blander message — never a wrong promise.
 */

export interface GuardContext {
  decision: Decision;
  orderId: string | null;
  customerEmail: string;
  allowedAmounts: number[];
}

export interface GuardResult {
  ok: boolean;
  violations: string[];
}

const APPROVAL_CLAIM = /\b(we('ve| have)|i('ve| have)) (approved|processed|issued)\b|\b(refund|request) (has been|is|was) (approved|processed|issued)\b/i;
const DENIAL_CLAIM = /\b(refund|request) (has been|is|was) (denied|rejected|declined)\b|\bwe('ve| have)? (denied|rejected|declined)\b/i;
const ESCALATION_CLAIM = /\b(specialist|agent|team member|member of (our|the) team|human|colleague|review)/i;
const LEAK = /\b(system prompt|policy engine|classifier|json|tool call|R\d{1,2}\b|risk flag|chargeback|as an ai)\b/i;

export function checkCustomerReply(message: string, statedOutcome: string, ctx: GuardContext): GuardResult {
  const v: string[] = [];

  if (statedOutcome !== ctx.decision) v.push(`stated_outcome "${statedOutcome}" != decision "${ctx.decision}"`);
  if (message.length < 20 || message.length > 1200) v.push(`length ${message.length} out of bounds`);

  if (ctx.decision !== "approved" && APPROVAL_CLAIM.test(message)) v.push("claims approval for a non-approved decision");
  if (ctx.decision === "approved" && DENIAL_CLAIM.test(message)) v.push("claims denial for an approved decision");
  if (ctx.decision === "escalated" && !ESCALATION_CLAIM.test(message)) v.push("escalation not communicated");

  if (LEAK.test(message)) v.push("mentions internal system details");

  for (const m of message.matchAll(/\bORD-\d+\b/gi)) {
    if (m[0].toUpperCase() !== ctx.orderId) v.push(`mentions foreign order ${m[0]}`);
  }
  for (const m of message.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) {
    if (m[0].toLowerCase() !== ctx.customerEmail.toLowerCase()) v.push(`mentions foreign email ${m[0]}`);
  }
  for (const m of message.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)) {
    const value = Number(m[1].replace(/,/g, ""));
    if (!ctx.allowedAmounts.some((a) => Math.abs(a - value) < 0.005)) v.push(`mentions unverified amount $${m[1]}`);
  }

  return { ok: v.length === 0, violations: v };
}
