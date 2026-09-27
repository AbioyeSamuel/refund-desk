import { ComposeInput } from "./prompts";
import { ComposedReply } from "./schemas";

// Deterministic replies: used by the mock provider and as the fallback whenever a
// model reply fails validation or the provider is unavailable.

const money = (n: number) => `$${n.toFixed(2)}`;

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "your items";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function templateReply(input: ComposeInput): ComposedReply {
  const hi = `Hi ${input.customerFirstName},`;
  const empathy = input.sentiment === "calm" ? "" : " I'm sorry for the trouble this has caused.";
  const notes = input.customerNotes.join(" ");
  let customer_message: string;

  switch (input.decision) {
    case "approved":
      customer_message =
        `Hi ${input.customerFirstName}, good news — your refund of ${money(input.amount)} for ${listNames(input.refundItemNames)} on order ${input.orderId} has been approved.${empathy}` +
        `${notes ? ` ${notes}` : ""} The money will be returned to your original payment method within 5–7 business days. Your reference is ${input.reference}.`;
      break;
    case "denied":
      customer_message =
        `${hi} thanks for getting in touch about order ${input.orderId}.${empathy} Unfortunately we can't refund this one. ${notes || "It doesn't meet our refund policy."}` +
        ` If you think we've got something wrong, just reply here and we'll take another look. Your reference is ${input.reference}.`;
      break;
    default:
      customer_message =
        `${hi} thanks for the details about order ${input.orderId}.${empathy} ${notes || "Your request needs a quick check by a member of our team."}` +
        ` Our team will follow up within 1 business day. Your reference is ${input.reference}.`;
  }

  const agent_brief =
    `Issue: ${input.issueSummary} Outcome: ${input.decision}` +
    (input.decision === "denied" ? "." : ` (${money(input.amount)}).`) +
    (input.decidingRules.length ? ` Triggered: ${input.decidingRules.join("; ")}` : " All policy checks passed.");

  return { stated_outcome: input.decision, customer_message: customer_message.replace(/\s+/g, " ").trim(), agent_brief };
}

export function needsOrderReply(firstName: string, orderIds: string[]): string {
  const examples = orderIds.slice(0, 3).join(", ");
  return `Hi ${firstName}, I'd be glad to help with a refund. Which order is this about? Pick it from the order selector or mention the order number${examples ? ` (your recent orders: ${examples})` : ""}, and tell me briefly what went wrong.`;
}

export function notRefundReply(firstName: string): string {
  return `Hi ${firstName}, I'm the refunds assistant, so I can help with returns, refunds and cancellations. Tell me which order it's about and what happened, and I'll take it from there.`;
}
