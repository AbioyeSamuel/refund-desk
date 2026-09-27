// Idempotent schema. Applied on every boot; safe to re-run.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT,
  city            TEXT,
  tier            TEXT NOT NULL DEFAULT 'standard',
  risk_flag       BOOLEAN NOT NULL DEFAULT FALSE,
  risk_note       TEXT,
  demo_scenario   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  customer_id     TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('processing','shipped','delivered','cancelled')),
  placed_at       TIMESTAMPTZ NOT NULL,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  total           NUMERIC(10,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD'
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id              SERIAL PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  unit_price      NUMERIC(10,2) NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  final_sale      BOOLEAN NOT NULL DEFAULT FALSE,
  refunded        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS refund_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT NOT NULL UNIQUE,
  customer_id         TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id            TEXT REFERENCES orders(id) ON DELETE SET NULL,
  channel             TEXT NOT NULL DEFAULT 'chat',
  message             TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('approved','denied','escalated','needs_info')),
  final_status        TEXT CHECK (final_status IN ('approved','denied')),
  reason_category     TEXT,
  amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  item_ids            INTEGER[] NOT NULL DEFAULT '{}',
  primary_rule        TEXT,
  customer_response   TEXT,
  agent_brief         TEXT,
  ai_summary          TEXT,
  rule_trace          JSONB NOT NULL DEFAULT '[]',
  ai_classification   JSONB,
  security_signals    JSONB NOT NULL DEFAULT '{}',
  ai_provider         TEXT,
  ai_model            TEXT,
  ai_degraded         BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms          INTEGER,
  reviewed_by         TEXT,
  review_note         TEXT,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON refund_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_customer ON refund_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refund_requests(status);

CREATE TABLE IF NOT EXISTS audit_events (
  id                  BIGSERIAL PRIMARY KEY,
  refund_request_id   UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL,
  actor               TEXT NOT NULL,
  detail              JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_events(refund_request_id, id);
`;
