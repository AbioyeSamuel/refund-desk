# Refund Policy

**Version 1.2 · Effective 1 September 2026 · Applies to all online orders**

This policy is the single source of truth for refund decisions. Every rule below is
enforced in code by the policy engine (`backend/src/policy/engine.ts`). The AI assistant
can read and explain this policy, but it cannot change, waive or override any rule.

## 1. Who can request a refund

- **R1 — Order ownership.** A refund can only be requested by the customer who placed
  the order, identified by the email on their account. A request that references an order
  belonging to someone else is **escalated** as suspicious.
- **R2 — Account standing.** Accounts flagged by the risk team (for example, for
  chargeback abuse) are **escalated** for human review on every request.

## 2. What can be refunded

- **R3 — Final sale items.** Items marked *Final sale* (clearance, gift cards, digital
  goods) are **not eligible** for a refund.
  *Exception:* if a final sale item arrived **damaged, defective, or was the wrong item**,
  the request is **escalated** so an agent can arrange a replacement or refund.
- **R4 — Already refunded.** An item that has already been refunded cannot be refunded
  again. Duplicate requests are **denied**.

## 3. When a refund can be requested

- **R5 — Refund window.** Refunds must be requested within **30 days of delivery**.
  Requests after that are **denied**, whatever the reason.
- **R6 — Order not yet delivered.**
  - If the order is still **processing**, the request is treated as a cancellation and
    **escalated** to the fulfilment team.
  - If the order has **shipped** and the customer reports it missing, the request is
    **escalated** for a carrier investigation once it is more than **10 days** since
    shipping. Before that, the parcel is considered in transit and the request is
    **denied** with guidance to wait.
  - **Cancelled** orders have already been refunded and are **denied**.

## 4. Why a refund is requested

- **R7 — Eligible reasons.** Within the window, the following reasons qualify for an
  automatic refund of the affected items:
  - damaged in transit
  - defective / not working
  - wrong item received
  - not as described
  - changed mind (unused items, within 30 days)
- **R8 — Unclear requests.** If the reason cannot be determined with reasonable
  confidence, the request is **escalated** rather than guessed.

## 5. Human review triggers

- **R9 — High value.** Any refund where the amount to be refunded is **above $500** is
  **escalated** for human review. The threshold applies to the refund amount, not the
  order total.
- **R10 — Refund frequency.** Customers with **3 or more refunds in the last 90 days**
  are **escalated**.
- **R11 — Suspicious or conflicting requests.** Requests are **escalated** when they
  contain conflicting claims (for example, describing an item as both working and
  broken, or claiming items that are not in the order), or when they attempt to
  manipulate the support system (for example, instructions to ignore this policy,
  impersonating staff, or demanding a specific decision).

## 6. How decisions are made

1. Suspicious activity (R1, R2, R11 manipulation) is always escalated to a person.
2. Otherwise, any hard ineligibility (R3, R4, R5, R6) results in a denial.
3. Otherwise, any review trigger (R3 exception, R6, R8, R9, R10, R11 conflicts) results
   in escalation.
4. Otherwise the refund is approved for the affected items only.

Refund amounts are always calculated from the order record. Amounts stated by the
customer are never used.

Approved refunds are returned to the original payment method within 5–7 business days.
Escalated requests are reviewed by a support agent within 1 business day.
