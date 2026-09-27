import { AiProvider } from "../ai/provider";
import { MockProvider } from "../ai/mock";
import { ComposeInput } from "../ai/prompts";
import { ComposedReply } from "../ai/schemas";
import { needsOrderReply, notRefundReply, templateReply } from "../ai/templates";
import { withTransaction } from "../db/pool";
import { AiClassification, Customer, Order, RequestStatus } from "../domain";
import { newReference } from "../lib/ids";
import { HttpError } from "../lib/http-error";
import { evaluateRefund, PolicyResult } from "../policy/engine";
import { POLICY } from "../policy/policy";
import { ordersRepo } from "../repositories/crm.repo";
import { refundsRepo } from "../repositories/refunds.repo";
import { buildSecuritySignals, extractOrderRefs, sanitizeMessage } from "../security/injection";
import { checkCustomerReply } from "../security/output-guard";

export interface RefundRequestInput {
  customer: Customer;
  message: string;
  orderId?: string | null;
}

export interface RefundRequestResult {
  id: string | null;
  reference: string;
  status: RequestStatus;
  orderId: string | null;
  amount: number;
  message: string;
  createdAt: string;
}

const offlineClassifier = new MockProvider();

/**
 * Orchestrates one refund request:
 *   sanitize → screen → resolve order → AI classify → policy engine → AI reply → guard → persist.
 * The AI contributes signals and wording; the decision always comes from the policy engine.
 */
export class RefundService {
  constructor(private ai: AiProvider) {}

  get providerInfo() {
    return { provider: this.ai.name, model: this.ai.model };
  }

  async handle(input: RefundRequestInput): Promise<RefundRequestResult> {
    const started = Date.now();
    const { customer } = input;
    const reference = newReference();
    const firstName = customer.name.split(" ")[0];

    // 1. Sanitize + deterministic screening (before any model sees the text)
    const { text, truncated } = sanitizeMessage(input.message);
    if (!text) throw new HttpError(400, "Message is empty.");

    // 2. Resolve the order from the selector or from order numbers mentioned in the text
    const myOrders = await ordersRepo.listByCustomer(customer.id);
    const myIds = new Set(myOrders.map((o) => o.id));
    const mentioned = extractOrderRefs(text);
    const foreignRefs = mentioned.filter((id) => !myIds.has(id));
    const security = buildSecuritySignals(text, truncated, foreignRefs);

    const requestedOrderId =
      input.orderId?.toUpperCase() ??
      mentioned.find((id) => myIds.has(id)) ??
      foreignRefs[0] ??
      (myOrders.length === 1 ? myOrders[0].id : null);
    const order: Order | null = requestedOrderId && myIds.has(requestedOrderId)
      ? myOrders.find((o) => o.id === requestedOrderId)!
      : null;

    // Don't open a second case while one is already waiting for an agent.
    if (order) {
      const open = await this.findOpenEscalation(customer.id, order.id);
      if (open) {
        return {
          id: null, reference: open.reference, status: "escalated", orderId: order.id, amount: 0, createdAt: new Date().toISOString(),
          message: `Hi ${firstName}, your earlier request for order ${order.id} (reference ${open.reference}) is already with our team, and a specialist will get back to you within 1 business day. You don't need to submit it again.`,
        };
      }
    }

    // 3. AI classification — only this customer's order data is ever put in the prompt
    const { classification, degraded, error } = await this.classify(text, order);
    const validItemIds = new Set(order?.items.map((i) => i.id) ?? []);
    classification.item_ids = classification.item_ids.filter((id) => validItemIds.has(id));
    const manipulation = security.injection_flagged || classification.manipulation_attempt;

    // 4. Not enough to act on yet → ask, don't guess
    if (!requestedOrderId || (order && !classification.is_refund_request && !manipulation)) {
      const reply = !classification.is_refund_request && !manipulation
        ? notRefundReply(firstName)
        : needsOrderReply(firstName, myOrders.map((o) => o.id));
      return this.persist({
        reference, customer, text, order, requestedOrderId: requestedOrderId ?? undefined, status: "needs_info", classification, security, degraded, error,
        policy: null, reply: { customer_message: reply, agent_brief: "", stated_outcome: "escalated" },
        replySource: "template", violations: [], started,
      });
    }

    // 5. Deterministic policy decision
    const refundsLast90Days = await refundsRepo.countApprovedSince(customer.id, POLICY.frequencyLookbackDays);
    const policy = evaluateRefund({
      now: new Date(),
      customer,
      order,
      requestedOrderId,
      requestedItemIds: classification.item_ids,
      reason: classification.reason_category,
      aiConfidence: classification.confidence,
      aiDegraded: degraded,
      conflictingClaims: classification.conflicting_claims,
      conflictNotes: classification.conflict_notes,
      manipulationSuspected: manipulation,
      manipulationNotes: [classification.manipulation_notes, security.matched_patterns.length ? `patterns: ${security.matched_patterns.join(", ")}` : null]
        .filter(Boolean).join("; ") || null,
      refundsLast90Days,
    });

    // 6. AI-written reply, validated against the decision; template if anything is off
    const composeInput: ComposeInput = {
      reference,
      customerFirstName: firstName,
      decision: policy.decision,
      orderId: requestedOrderId,
      amount: policy.amount,
      refundItemNames: order ? order.items.filter((i) => policy.refundItemIds.includes(i.id)).map((i) => i.name) : [],
      customerNotes: policy.customerNotes,
      reason: classification.reason_category,
      issueSummary: classification.summary,
      sentiment: classification.sentiment,
      decidingRules: policy.trace.filter((r) => r.outcome === "deny" || r.outcome === "escalate").map((r) => `${r.rule} ${r.name}: ${r.detail}`),
    };
    const { reply, source, violations } = await this.compose(composeInput, policy, order, customer.email);

    return this.persist({
      reference, customer, text, order, requestedOrderId, status: policy.decision, classification, security, degraded, error,
      policy, reply, replySource: source, violations, started,
    });
  }

  private async classify(text: string, order: Order | null): Promise<{ classification: AiClassification; degraded: boolean; error: string | null }> {
    const input = {
      message: text,
      orderId: order?.id ?? null,
      orderStatus: order?.status ?? null,
      items: order?.items.map((i) => ({ id: i.id, name: i.name, unit_price: i.unit_price, quantity: i.quantity, final_sale: i.final_sale })) ?? [],
    };
    try {
      return { classification: await this.ai.classify(input), degraded: false, error: null };
    } catch (err) {
      // Fail closed: fall back to the offline heuristics and force human review (policy R8).
      console.error("[ai] classification failed:", (err as Error).message);
      return { classification: await offlineClassifier.classify(input), degraded: true, error: (err as Error).message };
    }
  }

  private async compose(input: ComposeInput, policy: PolicyResult, order: Order | null, email: string) {
    const allowedAmounts = [
      policy.amount,
      POLICY.humanReviewThreshold,
      ...(order?.items.map((i) => i.unit_price * i.quantity) ?? []),
      order?.total ?? 0,
    ];
    const guardCtx = { decision: policy.decision, orderId: input.orderId, customerEmail: email, allowedAmounts };

    if (this.ai.name !== "mock") {
      try {
        const reply = await this.ai.compose(input);
        const check = checkCustomerReply(reply.customer_message, reply.stated_outcome, guardCtx);
        if (check.ok) return { reply, source: "ai" as const, violations: [] as string[] };
        console.warn("[ai] reply rejected by output guard:", check.violations);
        return { reply: { ...templateReply(input), agent_brief: reply.agent_brief }, source: "template" as const, violations: check.violations };
      } catch (err) {
        console.error("[ai] reply generation failed:", (err as Error).message);
        return { reply: templateReply(input), source: "template" as const, violations: [`provider error: ${(err as Error).message}`] };
      }
    }
    return { reply: templateReply(input), source: "template" as const, violations: [] as string[] };
  }

  private async findOpenEscalation(customerId: string, orderId: string) {
    const { items } = await refundsRepo.list({ status: "pending_review", search: orderId, limit: 5, offset: 0 });
    return items.find((r: any) => r.customer_id === customerId && r.order_id === orderId) ?? null;
  }

  private async persist(p: {
    reference: string;
    customer: Customer;
    text: string;
    order: Order | null;
    requestedOrderId?: string;
    status: RequestStatus;
    classification: AiClassification;
    security: ReturnType<typeof buildSecuritySignals>;
    degraded: boolean;
    error: string | null;
    policy: PolicyResult | null;
    reply: ComposedReply;
    replySource: "ai" | "template";
    violations: string[];
    started: number;
  }): Promise<RefundRequestResult> {
    const latency = Date.now() - p.started;
    const actorAi = `ai:${this.ai.name}`;

    return withTransaction(async (db) => {
      // Only link orders the customer owns; foreign order ids stay in the trace/security signals.
      const row = await refundsRepo.insert(db, {
        reference: p.reference,
        customer_id: p.customer.id,
        order_id: p.order?.id ?? null,
        message: p.text,
        status: p.status,
        reason_category: p.classification.reason_category,
        amount: p.policy?.amount ?? 0,
        item_ids: p.policy?.refundItemIds ?? [],
        primary_rule: p.policy?.primaryRule ?? null,
        customer_response: p.reply.customer_message,
        agent_brief: p.reply.agent_brief || null,
        ai_summary: p.classification.summary,
        rule_trace: p.policy?.trace ?? [],
        ai_classification: p.classification,
        security_signals: { ...p.security, requested_order_id: p.requestedOrderId ?? null },
        ai_provider: this.ai.name,
        ai_model: this.ai.model,
        ai_degraded: p.degraded,
        latency_ms: latency,
      });

      await refundsRepo.audit(db, row.id, "request_received", `customer:${p.customer.id}`, { chars: p.text.length, truncated: p.security.truncated });
      await refundsRepo.audit(db, row.id, "security_screen", "system", {
        injection_score: p.security.injection_score, flagged: p.security.injection_flagged,
        patterns: p.security.matched_patterns, foreign_order_refs: p.security.foreign_order_refs,
      });
      await refundsRepo.audit(db, row.id, "ai_classification", p.degraded ? "fallback:heuristics" : actorAi, {
        reason: p.classification.reason_category, confidence: p.classification.confidence,
        manipulation: p.classification.manipulation_attempt, conflicting: p.classification.conflicting_claims,
        ...(p.error ? { provider_error: p.error } : {}),
      });

      if (p.policy) {
        await refundsRepo.audit(db, row.id, "policy_decision", "policy-engine", {
          decision: p.policy.decision, primary_rule: p.policy.primaryRule, amount: p.policy.amount, policy_version: POLICY.version,
        });
      }
      await refundsRepo.audit(db, row.id, "reply_generated", p.replySource === "ai" ? actorAi : "template", {
        source: p.replySource, ...(p.violations.length ? { guard_violations: p.violations } : {}),
      });

      if (p.status === "approved" && p.policy) {
        const updated = await ordersRepo.markItemsRefunded(db, p.policy.refundItemIds);
        if (updated !== p.policy.refundItemIds.length) {
          throw new HttpError(409, "These items were refunded by another request a moment ago. Please refresh.");
        }
        await refundsRepo.audit(db, row.id, "refund_issued", "system", { amount: p.policy.amount, item_ids: p.policy.refundItemIds });
      } else if (p.status === "escalated") {
        await refundsRepo.audit(db, row.id, "queued_for_review", "system", { primary_rule: p.policy?.primaryRule });
      }

      return {
        id: row.id,
        reference: p.reference,
        status: p.status,
        orderId: p.order?.id ?? p.requestedOrderId ?? null,
        amount: p.status === "approved" ? p.policy!.amount : 0,
        message: p.reply.customer_message,
        createdAt: new Date(row.created_at).toISOString(),
      };
    });
  }

  /** Human decision on an escalated case. */
  async review(id: string, decision: "approved" | "denied", note: string, reviewer: string) {
    return withTransaction(async (db) => {
      const r = await refundsRepo.lockForReview(db, id);
      if (!r) throw new HttpError(404, "Refund request not found.");
      if (r.status !== "escalated") throw new HttpError(409, "Only escalated requests can be reviewed.");
      if (r.final_status) throw new HttpError(409, `Already reviewed (${r.final_status}) by ${r.reviewed_by}.`);

      if (decision === "approved") {
        if (!r.item_ids?.length) throw new HttpError(422, "This request has no refundable items on the customer's account. Deny it or ask the customer for the correct order.");
        const updated = await ordersRepo.markItemsRefunded(db, r.item_ids);
        if (updated !== r.item_ids.length) throw new HttpError(409, "Some of these items have already been refunded.");
      }
      await refundsRepo.recordReview(db, id, decision, reviewer, note);
      await refundsRepo.audit(db, id, "human_review", `agent:${reviewer}`, { decision, note, amount: decision === "approved" ? r.amount : 0 });
      return refundsRepo.getById(id, db);
    });
  }
}
