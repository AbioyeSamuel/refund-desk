export type Decision = "approved" | "denied" | "escalated";
export type RequestStatus = Decision | "needs_info";

export interface Customer {
  id: string;
  name: string;
  email: string;
  city: string | null;
  tier: string;
}

export interface DemoCustomer extends Customer {
  scenario: string | null;
}

export interface OrderItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit_price: number;
  quantity: number;
  final_sale: boolean;
  refunded: boolean;
}

export interface Order {
  id: string;
  customer_id?: string;
  status: "processing" | "shipped" | "delivered" | "cancelled";
  placed_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  total: number;
  currency: string;
  items: OrderItem[];
}

export interface CustomerRequest {
  reference: string;
  order_id: string | null;
  status: RequestStatus;
  final_status: "approved" | "denied" | null;
  amount: number;
  reason_category: string | null;
  customer_response: string;
  created_at: string;
}

export interface RefundResult {
  id: string | null;
  reference: string;
  status: RequestStatus;
  orderId: string | null;
  amount: number;
  message: string;
  createdAt: string;
}

export interface Health {
  status: string;
  db: string;
  ai: { provider: string; model: string };
  demoMode: boolean;
}

export interface Stats {
  total: number;
  approved: number;
  denied: number;
  escalated: number;
  pending_review: number;
  needs_info: number;
  security_flagged: number;
  auto_approved_amount: number;
  pending_amount: number;
  avg_latency_ms: number;
  ai: { provider: string; model: string };
}

export interface RefundRow {
  id: string;
  reference: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  order_id: string | null;
  status: RequestStatus;
  final_status: "approved" | "denied" | null;
  reason_category: string | null;
  amount: number;
  primary_rule: string | null;
  ai_summary: string | null;
  ai_provider: string;
  ai_degraded: boolean;
  latency_ms: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  security_flagged: boolean;
}

export interface RuleResult {
  rule: string;
  name: string;
  outcome: "pass" | "deny" | "escalate" | "info" | "skip";
  detail: string;
  customerNote?: string;
  severity?: string;
}

export interface Classification {
  is_refund_request: boolean;
  reason_category: string;
  item_ids: number[];
  summary: string;
  confidence: number;
  conflicting_claims: boolean;
  conflict_notes: string | null;
  manipulation_attempt: boolean;
  manipulation_notes: string | null;
  sentiment: string;
}

export interface RefundDetail {
  request: RefundRow & {
    message: string;
    customer_response: string;
    agent_brief: string | null;
    item_ids: number[];
    rule_trace: RuleResult[];
    ai_classification: Classification | null;
    security_signals: {
      injection_score: number;
      injection_flagged: boolean;
      matched_patterns: string[];
      foreign_order_refs: string[];
      truncated: boolean;
      requested_order_id: string | null;
    };
    ai_model: string;
    review_note: string | null;
    customer_tier: string;
    customer_risk_flag: boolean;
    customer_risk_note: string | null;
  };
  order: Order | null;
  foreign_order: { id: string; owner_id: string } | null;
  customer_refunds_last_90_days: number;
  audit: { id: number; event_type: string; actor: string; detail: Record<string, unknown>; created_at: string }[];
}

export interface CrmCustomer extends Customer {
  phone: string | null;
  risk_flag: boolean;
  risk_note: string | null;
  demo_scenario: string | null;
  orders: Order[];
}
