import { Pool, PoolClient } from "pg";
import { pool } from "../db/pool";
import { RequestStatus } from "../domain";

type Db = Pool | PoolClient;

export interface RefundRecordInput {
  reference: string;
  customer_id: string;
  order_id: string | null;
  message: string;
  status: RequestStatus;
  reason_category: string | null;
  amount: number;
  item_ids: number[];
  primary_rule: string | null;
  customer_response: string;
  agent_brief: string | null;
  ai_summary: string | null;
  rule_trace: unknown;
  ai_classification: unknown;
  security_signals: unknown;
  ai_provider: string;
  ai_model: string;
  ai_degraded: boolean;
  latency_ms: number;
}

export interface RefundFilter {
  status?: string;
  search?: string;
  flagged?: boolean;
  limit: number;
  offset: number;
}

const LIST_COLUMNS = `
  r.id, r.reference, r.customer_id, c.name AS customer_name, c.email AS customer_email, r.order_id, r.channel,
  r.status, r.final_status, r.reason_category, r.amount, r.primary_rule, r.ai_summary, r.ai_provider,
  r.ai_degraded, r.latency_ms, r.reviewed_by, r.reviewed_at, r.created_at,
  (r.security_signals->>'injection_flagged')::boolean
    OR COALESCE((r.ai_classification->>'manipulation_attempt')::boolean, false) AS security_flagged`;

export const refundsRepo = {
  async insert(db: Db, r: RefundRecordInput): Promise<{ id: string; created_at: Date }> {
    const { rows } = await db.query(
      `INSERT INTO refund_requests
        (reference, customer_id, order_id, message, status, reason_category, amount, item_ids, primary_rule,
         customer_response, agent_brief, ai_summary, rule_trace, ai_classification, security_signals,
         ai_provider, ai_model, ai_degraded, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id, created_at`,
      [
        r.reference, r.customer_id, r.order_id, r.message, r.status, r.reason_category, r.amount, r.item_ids,
        r.primary_rule, r.customer_response, r.agent_brief, r.ai_summary, JSON.stringify(r.rule_trace),
        r.ai_classification ? JSON.stringify(r.ai_classification) : null, JSON.stringify(r.security_signals),
        r.ai_provider, r.ai_model, r.ai_degraded, r.latency_ms,
      ],
    );
    return rows[0];
  },

  async audit(db: Db, refundId: string, eventType: string, actor: string, detail: unknown = {}): Promise<void> {
    await db.query(
      "INSERT INTO audit_events (refund_request_id, event_type, actor, detail) VALUES ($1,$2,$3,$4)",
      [refundId, eventType, actor, JSON.stringify(detail)],
    );
  },

  /** Approved refunds (auto or after human review) in the lookback window. */
  async countApprovedSince(customerId: string, days: number): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM refund_requests
        WHERE customer_id = $1 AND created_at > now() - make_interval(days => $2)
          AND (status = 'approved' OR final_status = 'approved')`,
      [customerId, days],
    );
    return rows[0].n;
  },

  async listForCustomer(customerId: string, limit = 20) {
    const { rows } = await pool.query(
      `SELECT reference, order_id, status, final_status, amount, reason_category, customer_response, created_at
         FROM refund_requests WHERE customer_id = $1 AND channel <> 'historical'
        ORDER BY created_at DESC LIMIT $2`,
      [customerId, limit],
    );
    return rows;
  },

  async list(f: RefundFilter) {
    const where: string[] = ["r.channel <> 'historical'"];
    const params: unknown[] = [];
    if (f.status === "pending_review") {
      where.push("r.status = 'escalated' AND r.final_status IS NULL");
    } else if (f.status) {
      params.push(f.status);
      where.push(`COALESCE(r.final_status, r.status) = $${params.length}`);
    }
    if (f.flagged) {
      where.push(`((r.security_signals->>'injection_flagged')::boolean OR COALESCE((r.ai_classification->>'manipulation_attempt')::boolean, false))`);
    }
    if (f.search) {
      params.push(`%${f.search}%`);
      const p = `$${params.length}`;
      where.push(`(r.reference ILIKE ${p} OR r.order_id ILIKE ${p} OR c.name ILIKE ${p} OR c.email ILIKE ${p} OR r.message ILIKE ${p})`);
    }
    params.push(f.limit, f.offset);
    const { rows } = await pool.query(
      `SELECT ${LIST_COLUMNS}, count(*) OVER()::int AS total_count
         FROM refund_requests r JOIN customers c ON c.id = r.customer_id
        WHERE ${where.join(" AND ")}
        ORDER BY r.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: rows[0]?.total_count ?? 0, items: rows.map(({ total_count, ...r }) => r) };
  },

  async getById(id: string, db: Db = pool) {
    const { rows } = await db.query(
      `SELECT r.*, c.name AS customer_name, c.email AS customer_email, c.tier AS customer_tier,
              c.risk_flag AS customer_risk_flag, c.risk_note AS customer_risk_note
         FROM refund_requests r JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async auditTrail(id: string) {
    const { rows } = await pool.query(
      "SELECT id, event_type, actor, detail, created_at FROM audit_events WHERE refund_request_id = $1 ORDER BY id",
      [id],
    );
    return rows;
  },

  async lockForReview(db: PoolClient, id: string) {
    const { rows } = await db.query("SELECT * FROM refund_requests WHERE id = $1 FOR UPDATE", [id]);
    return rows[0] ?? null;
  },

  async recordReview(db: PoolClient, id: string, finalStatus: "approved" | "denied", reviewer: string, note: string) {
    await db.query(
      "UPDATE refund_requests SET final_status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now() WHERE id = $1",
      [id, finalStatus, reviewer, note],
    );
  },

  async stats() {
    const { rows } = await pool.query(`
      SELECT
        count(*)::int                                                                  AS total,
        count(*) FILTER (WHERE COALESCE(final_status, status) = 'approved')::int       AS approved,
        count(*) FILTER (WHERE COALESCE(final_status, status) = 'denied')::int         AS denied,
        count(*) FILTER (WHERE status = 'escalated')::int                              AS escalated,
        count(*) FILTER (WHERE status = 'escalated' AND final_status IS NULL)::int     AS pending_review,
        count(*) FILTER (WHERE status = 'needs_info')::int                             AS needs_info,
        count(*) FILTER (WHERE (security_signals->>'injection_flagged')::boolean
                            OR COALESCE((ai_classification->>'manipulation_attempt')::boolean, false))::int AS security_flagged,
        COALESCE(sum(amount) FILTER (WHERE status = 'approved'), 0)::float             AS auto_approved_amount,
        COALESCE(sum(amount) FILTER (WHERE status = 'escalated' AND final_status IS NULL), 0)::float AS pending_amount,
        COALESCE(round(avg(latency_ms) FILTER (WHERE status <> 'needs_info')), 0)::int AS avg_latency_ms
      FROM refund_requests WHERE channel <> 'historical'`);
    return rows[0];
  },
};
