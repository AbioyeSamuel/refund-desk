// Business constants for the refund policy (see backend/policy/refund-policy.md).
// Changing a number here changes behaviour everywhere, including what the AI is told.

export const POLICY = {
  version: "1.2",
  refundWindowDays: 30,
  humanReviewThreshold: 500,
  frequencyLookbackDays: 90,
  frequencyEscalationCount: 3,
  inTransitGraceDays: 10,
  minAiConfidence: 0.6,
} as const;

export const RULES = {
  R1: "Order ownership",
  R2: "Account standing",
  R3: "Final sale items",
  R4: "Already refunded",
  R5: "Refund window",
  R6: "Order delivery status",
  R7: "Eligible reason",
  R8: "Unclear request",
  R9: "High-value review",
  R10: "Refund frequency",
  R11: "Suspicious or conflicting request",
} as const;

export type RuleId = keyof typeof RULES;
