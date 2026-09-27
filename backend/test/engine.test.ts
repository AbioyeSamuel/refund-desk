import { describe, expect, it } from "vitest";
import { Order, OrderItem } from "../src/domain";
import { evaluateRefund, PolicyInput } from "../src/policy/engine";

const NOW = new Date("2026-09-27T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

let nextId = 1;
const item = (over: Partial<OrderItem> = {}): OrderItem => ({
  id: nextId++, order_id: "ORD-1", sku: "SKU", name: "Widget", category: "misc",
  unit_price: 50, quantity: 1, final_sale: false, refunded: false, ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: "ORD-1", customer_id: "CUS-1", status: "delivered", placed_at: daysAgo(10), shipped_at: daysAgo(8),
  delivered_at: daysAgo(5), total: 50, currency: "USD", items: [item()], ...over,
});

const input = (over: Partial<PolicyInput> = {}): PolicyInput => ({
  now: NOW,
  customer: { id: "CUS-1", risk_flag: false, risk_note: null },
  order: order(),
  requestedOrderId: "ORD-1",
  requestedItemIds: [],
  reason: "damaged",
  aiConfidence: 0.9,
  aiDegraded: false,
  conflictingClaims: false,
  conflictNotes: null,
  manipulationSuspected: false,
  manipulationNotes: null,
  refundsLast90Days: 0,
  ...over,
});

describe("policy engine", () => {
  it("approves a damaged item inside the window", () => {
    const r = evaluateRefund(input());
    expect(r.decision).toBe("approved");
    expect(r.amount).toBe(50);
  });

  it("denies final-sale items for change of mind (R3)", () => {
    const r = evaluateRefund(input({ reason: "changed_mind", order: order({ items: [item({ final_sale: true })] }) }));
    expect(r.decision).toBe("denied");
    expect(r.primaryRule).toBe("R3");
    expect(r.amount).toBe(0);
  });

  it("escalates damaged final-sale items instead of denying (R3 exception)", () => {
    const r = evaluateRefund(input({ reason: "damaged", order: order({ items: [item({ final_sale: true })] }) }));
    expect(r.decision).toBe("escalated");
    expect(r.primaryRule).toBe("R3");
  });

  it("partially approves, excluding final-sale items on change of mind", () => {
    const keep = item({ unit_price: 149 });
    const fs = item({ unit_price: 39, final_sale: true });
    const r = evaluateRefund(input({ reason: "changed_mind", order: order({ items: [keep, fs] }) }));
    expect(r.decision).toBe("approved");
    expect(r.amount).toBe(149);
    expect(r.refundItemIds).toEqual([keep.id]);
    expect(r.customerNotes.join(" ")).toMatch(/final sale/);
  });

  it("explains already-refunded items when the rest of the order is ineligible", () => {
    const refunded = item({ name: "Coffee Maker", refunded: true });
    const fs = item({ name: "Mugs", final_sale: true });
    const r = evaluateRefund(input({ reason: "changed_mind", order: order({ items: [refunded, fs] }) }));
    expect(r.decision).toBe("denied");
    expect(r.customerNotes.join(" ")).toMatch(/Coffee Maker has already been refunded/);
    expect(r.customerNotes.join(" ")).toMatch(/Mugs was sold as final sale/);
  });

  it("denies outside the 30-day window (R5)", () => {
    const r = evaluateRefund(input({ order: order({ delivered_at: daysAgo(31) }) }));
    expect(r.decision).toBe("denied");
    expect(r.primaryRule).toBe("R5");
  });

  it("allows day 30 exactly", () => {
    expect(evaluateRefund(input({ order: order({ delivered_at: daysAgo(30) }) })).decision).toBe("approved");
  });

  it("escalates refunds above $500 (R9) based on the refund amount, not the order total", () => {
    const big = item({ unit_price: 560 });
    const small = item({ unit_price: 80 });
    const o = order({ items: [big, small], total: 640 });
    expect(evaluateRefund(input({ order: o })).decision).toBe("escalated");
    const partial = evaluateRefund(input({ order: o, requestedItemIds: [small.id] }));
    expect(partial.decision).toBe("approved");
    expect(partial.amount).toBe(80);
  });

  it("treats exactly $500 as not requiring review", () => {
    expect(evaluateRefund(input({ order: order({ items: [item({ unit_price: 500 })] }) })).decision).toBe("approved");
  });

  it("denies duplicates (R4)", () => {
    const r = evaluateRefund(input({ order: order({ items: [item({ refunded: true })] }) }));
    expect(r.decision).toBe("denied");
    expect(r.primaryRule).toBe("R4");
  });

  it("escalates when the order is not the customer's (R1) without evaluating anything else", () => {
    const r = evaluateRefund(input({ order: null, requestedOrderId: "ORD-999" }));
    expect(r.decision).toBe("escalated");
    expect(r.primaryRule).toBe("R1");
    expect(r.trace).toHaveLength(1);
  });

  it("escalates flagged accounts without revealing why (R2)", () => {
    const r = evaluateRefund(input({ customer: { id: "CUS-1", risk_flag: true, risk_note: "chargebacks" } }));
    expect(r.decision).toBe("escalated");
    expect(r.primaryRule).toBe("R2");
    expect(r.customerNotes.join(" ")).not.toMatch(/chargeback/i);
  });

  it("security escalation outranks an otherwise-denied request", () => {
    const r = evaluateRefund(input({ manipulationSuspected: true, order: order({ delivered_at: daysAgo(90) }) }));
    expect(r.decision).toBe("escalated");
    expect(r.primaryRule).toBe("R11");
  });

  it("manipulation can never produce an approval", () => {
    expect(evaluateRefund(input({ manipulationSuspected: true })).decision).toBe("escalated");
  });

  it("denial outranks non-security review triggers", () => {
    const r = evaluateRefund(input({ refundsLast90Days: 5, order: order({ delivered_at: daysAgo(40) }) }));
    expect(r.decision).toBe("denied");
  });

  it("escalates frequent refunders (R10)", () => {
    expect(evaluateRefund(input({ refundsLast90Days: 3 })).primaryRule).toBe("R10");
  });

  it("escalates low-confidence or degraded AI (R8)", () => {
    expect(evaluateRefund(input({ aiConfidence: 0.4 })).decision).toBe("escalated");
    expect(evaluateRefund(input({ aiDegraded: true })).decision).toBe("escalated");
  });

  it("escalates unknown reasons (R8)", () => {
    expect(evaluateRefund(input({ reason: "other" })).decision).toBe("escalated");
  });

  it("escalates conflicting claims (R11)", () => {
    expect(evaluateRefund(input({ conflictingClaims: true })).decision).toBe("escalated");
  });

  describe("delivery status (R6)", () => {
    it("escalates processing orders as cancellations", () => {
      const r = evaluateRefund(input({ reason: "cancel_order", order: order({ status: "processing", shipped_at: null, delivered_at: null }) }));
      expect(r.decision).toBe("escalated");
      expect(r.primaryRule).toBe("R6");
    });

    it("denies not-received while still in transit", () => {
      const r = evaluateRefund(input({ reason: "not_received", order: order({ status: "shipped", shipped_at: daysAgo(4), delivered_at: null }) }));
      expect(r.decision).toBe("denied");
    });

    it("escalates not-received once overdue", () => {
      const r = evaluateRefund(input({ reason: "not_received", order: order({ status: "shipped", shipped_at: daysAgo(12), delivered_at: null }) }));
      expect(r.decision).toBe("escalated");
    });

    it("escalates not-received on a delivered order as a conflict", () => {
      expect(evaluateRefund(input({ reason: "not_received" })).primaryRule).toBe("R11");
    });

    it("denies cancelled orders", () => {
      expect(evaluateRefund(input({ order: order({ status: "cancelled", delivered_at: null }) })).decision).toBe("denied");
    });
  });

  it("is deterministic", () => {
    const i = input();
    expect(evaluateRefund(i)).toEqual(evaluateRefund(i));
  });
});
