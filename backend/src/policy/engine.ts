import { Decision, Order, OrderItem, ReasonCategory } from "../domain";
import { POLICY, RULES, RuleId } from "./policy";

/**
 * Deterministic refund policy engine.
 *
 * This is the only component allowed to decide an outcome. It is a pure function:
 * same input, same output, no I/O, no AI. The AI layer feeds it *signals*
 * (reason category, confidence, conflict / manipulation flags) and every one of
 * those signals can only make the outcome stricter, never more lenient.
 */

export type RuleOutcome = "pass" | "deny" | "escalate" | "info" | "skip";
type Severity = "security" | "ineligible" | "review";

export interface RuleResult {
  rule: RuleId;
  name: string;
  outcome: RuleOutcome;
  detail: string;
  /** Customer-safe explanation; omitted for internal-only reasons (e.g. risk flags). */
  customerNote?: string;
  severity?: Severity;
}

export interface PolicyInput {
  now: Date;
  customer: { id: string; risk_flag: boolean; risk_note: string | null };
  /** Null when the referenced order does not belong to this customer (R1). */
  order: Order | null;
  requestedOrderId: string;
  /** Items the customer is asking about. Empty = whole order. */
  requestedItemIds: number[];
  reason: ReasonCategory;
  aiConfidence: number;
  aiDegraded: boolean;
  conflictingClaims: boolean;
  conflictNotes: string | null;
  manipulationSuspected: boolean;
  manipulationNotes: string | null;
  refundsLast90Days: number;
}

export interface PolicyResult {
  decision: Decision;
  primaryRule: RuleId;
  amount: number;
  refundItemIds: number[];
  trace: RuleResult[];
  customerNotes: string[];
}

const DAY_MS = 86_400_000;
const DEFECT_REASONS: ReasonCategory[] = ["damaged", "defective", "wrong_item", "not_as_described"];
const ELIGIBLE_REASONS: ReasonCategory[] = [...DEFECT_REASONS, "changed_mind"];

const money = (n: number) => `$${n.toFixed(2)}`;
const lineTotal = (i: OrderItem) => i.unit_price * i.quantity;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY_MS);

export function evaluateRefund(input: PolicyInput): PolicyResult {
  const trace: RuleResult[] = [];
  const add = (r: Omit<RuleResult, "name">) => trace.push({ ...r, name: RULES[r.rule] });

  // ---------- R1: ownership (short-circuits: we must not reason about someone else's order)
  if (!input.order) {
    add({
      rule: "R1", outcome: "escalate", severity: "security",
      detail: `Order ${input.requestedOrderId} is not on this customer's account.`,
      customerNote: "We couldn't match that order to your account, so a specialist will verify it.",
    });
    return finalize(trace, 0, []);
  }
  const order = input.order;
  add({ rule: "R1", outcome: "pass", detail: `Order ${order.id} belongs to ${input.customer.id}.` });

  // ---------- R2: account standing (internal reason never shown to the customer)
  if (input.customer.risk_flag) {
    add({ rule: "R2", outcome: "escalate", severity: "security", detail: `Account flagged: ${input.customer.risk_note ?? "no note"}.` });
  } else {
    add({ rule: "R2", outcome: "pass", detail: "Account in good standing." });
  }

  // ---------- R11 (manipulation half): prompt injection / social engineering
  if (input.manipulationSuspected) {
    add({
      rule: "R11", outcome: "escalate", severity: "security",
      detail: `Manipulation attempt detected${input.manipulationNotes ? `: ${input.manipulationNotes}` : "."}`,
      customerNote: "Your request includes instructions we can't act on automatically, so a specialist will review it.",
    });
  }

  // ---------- Resolve which items are in scope
  const requested = input.requestedItemIds.length
    ? order.items.filter((i) => input.requestedItemIds.includes(i.id))
    : order.items;
  const scope = requested.length ? requested : order.items;
  add({
    rule: "R7", outcome: "info",
    detail: `Items in scope: ${scope.map((i) => `${i.name} (${money(lineTotal(i))})`).join(", ")}.`,
  });

  // ---------- R6: delivery status
  const reason = input.reason;
  switch (order.status) {
    case "cancelled":
      add({
        rule: "R6", outcome: "deny", severity: "ineligible", detail: "Order was cancelled and already refunded.",
        customerNote: "This order was cancelled, and the payment has already been returned to you.",
      });
      break;
    case "processing":
      add({
        rule: "R6", outcome: "escalate", severity: "review", detail: "Order not shipped yet; treat as a cancellation.",
        customerNote: "Your order hasn't shipped yet, so we've passed it to our fulfilment team to cancel it.",
      });
      break;
    case "shipped": {
      const since = order.shipped_at ? daysBetween(input.now, order.shipped_at) : 0;
      if (reason === "not_received" && since > POLICY.inTransitGraceDays) {
        add({
          rule: "R6", outcome: "escalate", severity: "review",
          detail: `Shipped ${since} days ago (> ${POLICY.inTransitGraceDays}); open a carrier investigation.`,
          customerNote: "Your parcel is overdue, so we've opened an investigation with the carrier.",
        });
      } else if (reason === "not_received") {
        add({
          rule: "R6", outcome: "deny", severity: "ineligible",
          detail: `Shipped ${since} days ago (≤ ${POLICY.inTransitGraceDays}); still within normal transit time.`,
          customerNote: `Your parcel shipped ${since} day${since === 1 ? "" : "s"} ago and is still within normal delivery time. If it hasn't arrived ${POLICY.inTransitGraceDays} days after shipping, contact us again and we'll investigate.`,
        });
      } else {
        add({
          rule: "R11", outcome: "escalate", severity: "review",
          detail: `Customer reports "${reason}" but the order is still in transit.`,
          customerNote: "Our records show this order is still on its way, so a specialist will look into it.",
        });
      }
      break;
    }
    case "delivered":
      if (reason === "not_received") {
        add({
          rule: "R11", outcome: "escalate", severity: "review",
          detail: "Customer reports non-delivery but the carrier marked the order as delivered.",
          customerNote: "Our carrier shows this order as delivered, so we've opened a delivery investigation.",
        });
      } else {
        add({ rule: "R6", outcome: "pass", detail: "Order delivered." });
      }
      break;
  }

  // ---------- R4: already refunded
  const notRefunded = scope.filter((i) => !i.refunded);
  const alreadyRefunded = scope.filter((i) => i.refunded);
  if (notRefunded.length === 0) {
    add({
      rule: "R4", outcome: "deny", severity: "ineligible", detail: "Every item in scope has already been refunded.",
      customerNote: "Our records show these items have already been refunded.",
    });
  } else if (alreadyRefunded.length) {
    const names = alreadyRefunded.map((i) => i.name).join(", ");
    add({
      rule: "R4", outcome: "info", detail: `Excluded already-refunded: ${names}.`,
      customerNote: `${names} ${alreadyRefunded.length > 1 ? "have" : "has"} already been refunded.`,
    });
  } else {
    add({ rule: "R4", outcome: "pass", detail: "No prior refunds on these items." });
  }

  // ---------- R3: final sale
  let refundable = notRefunded;
  const finalSale = notRefunded.filter((i) => i.final_sale);
  if (finalSale.length) {
    const names = finalSale.map((i) => i.name).join(", ");
    if (DEFECT_REASONS.includes(reason)) {
      add({
        rule: "R3", outcome: "escalate", severity: "review",
        detail: `Final-sale item(s) reported as ${reason}: ${names}. Exception requires an agent.`,
        customerNote: `${names} ${finalSale.length > 1 ? "are" : "is"} final sale, but because it arrived with a problem, a specialist will arrange a solution.`,
      });
    } else {
      refundable = notRefunded.filter((i) => !i.final_sale);
      add({
        rule: "R3", outcome: refundable.length ? "info" : "deny", severity: refundable.length ? undefined : "ineligible",
        detail: `Final-sale item(s) not refundable for "${reason}": ${names}.`,
        customerNote: `${names} ${finalSale.length > 1 ? "were" : "was"} sold as final sale and can't be refunded.`,
      });
    }
  } else if (notRefunded.length) {
    add({ rule: "R3", outcome: "pass", detail: "No final-sale items in scope." });
  }

  // ---------- R5: refund window (only meaningful once delivered)
  if (order.status === "delivered" && order.delivered_at) {
    const since = daysBetween(input.now, order.delivered_at);
    if (since > POLICY.refundWindowDays) {
      add({
        rule: "R5", outcome: "deny", severity: "ineligible",
        detail: `Delivered ${since} days ago (> ${POLICY.refundWindowDays}).`,
        customerNote: `This order was delivered ${since} days ago, which is outside our ${POLICY.refundWindowDays}-day refund window.`,
      });
    } else {
      add({ rule: "R5", outcome: "pass", detail: `Delivered ${since} days ago (within ${POLICY.refundWindowDays}).` });
    }
  }

  // ---------- R7 / R8: reason and confidence
  if (order.status === "delivered" && reason !== "not_received") {
    if (reason === "cancel_order") {
      add({ rule: "R7", outcome: "pass", detail: "Cancellation after delivery handled as a return (changed mind)." });
    } else if (ELIGIBLE_REASONS.includes(reason)) {
      add({ rule: "R7", outcome: "pass", detail: `Reason "${reason}" is eligible.` });
    } else {
      add({
        rule: "R8", outcome: "escalate", severity: "review", detail: "Refund reason could not be determined.",
        customerNote: "We need a little more detail about the issue, so a specialist will follow up with you.",
      });
    }
  }
  if (input.aiDegraded) {
    add({ rule: "R8", outcome: "escalate", severity: "review", detail: "AI classifier unavailable; failing safe to human review." });
  } else if (input.aiConfidence < POLICY.minAiConfidence) {
    add({
      rule: "R8", outcome: "escalate", severity: "review",
      detail: `Classifier confidence ${input.aiConfidence.toFixed(2)} < ${POLICY.minAiConfidence}.`,
    });
  }

  // ---------- R9: high value (on the refund amount, not the order total)
  const amount = round2(refundable.reduce((s, i) => s + lineTotal(i), 0));
  if (amount > POLICY.humanReviewThreshold) {
    add({
      rule: "R9", outcome: "escalate", severity: "review",
      detail: `Refund amount ${money(amount)} exceeds ${money(POLICY.humanReviewThreshold)}.`,
      customerNote: `Refunds over ${money(POLICY.humanReviewThreshold)} are confirmed by a member of our team.`,
    });
  } else {
    add({ rule: "R9", outcome: "pass", detail: `Refund amount ${money(amount)} ≤ ${money(POLICY.humanReviewThreshold)}.` });
  }

  // ---------- R10: frequency
  if (input.refundsLast90Days >= POLICY.frequencyEscalationCount) {
    add({
      rule: "R10", outcome: "escalate", severity: "review",
      detail: `${input.refundsLast90Days} refunds in the last ${POLICY.frequencyLookbackDays} days (≥ ${POLICY.frequencyEscalationCount}).`,
    });
  } else {
    add({ rule: "R10", outcome: "pass", detail: `${input.refundsLast90Days} refunds in the last ${POLICY.frequencyLookbackDays} days.` });
  }

  // ---------- R11 (conflict half)
  if (input.conflictingClaims) {
    add({
      rule: "R11", outcome: "escalate", severity: "review",
      detail: `Conflicting claims${input.conflictNotes ? `: ${input.conflictNotes}` : "."}`,
      customerNote: "Some details in your request need checking, so a specialist will review it.",
    });
  }

  return finalize(trace, amount, refundable.map((i) => i.id));
}

/** Applies the precedence in policy section 6: security > ineligible > review > approve. */
function finalize(trace: RuleResult[], amount: number, refundItemIds: number[]): PolicyResult {
  const pick = (outcome: RuleOutcome, severity: Severity) =>
    trace.filter((r) => r.outcome === outcome && r.severity === severity);

  const security = pick("escalate", "security");
  const denials = trace.filter((r) => r.outcome === "deny");
  const reviews = pick("escalate", "review");

  let decision: Decision;
  let deciding: RuleResult[];
  if (security.length) [decision, deciding] = ["escalated", security];
  else if (denials.length) [decision, deciding] = ["denied", denials];
  else if (reviews.length) [decision, deciding] = ["escalated", reviews];
  else [decision, deciding] = ["approved", []];

  const customerNotes = [
    ...deciding.map((r) => r.customerNote).filter((n): n is string => !!n),
    // Informational notes (e.g. an item excluded because it was already refunded or is final sale).
    ...(decision !== "escalated" ? trace.filter((r) => r.outcome === "info" && r.customerNote).map((r) => r.customerNote!) : []),
  ];

  return {
    decision,
    primaryRule: deciding[0]?.rule ?? "R7",
    amount: decision === "denied" ? 0 : amount,
    refundItemIds: decision === "denied" ? [] : refundItemIds,
    trace,
    customerNotes: dedupe(customerNotes),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dedupe = (xs: string[]) => [...new Set(xs)];
