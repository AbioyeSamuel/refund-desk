// Core domain types shared across layers.

export type OrderStatus = "processing" | "shipped" | "delivered" | "cancelled";
export type Decision = "approved" | "denied" | "escalated";
export type RequestStatus = Decision | "needs_info";

export const REASON_CATEGORIES = [
  "damaged",
  "defective",
  "wrong_item",
  "not_as_described",
  "not_received",
  "changed_mind",
  "cancel_order",
  "other",
] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  tier: string;
  risk_flag: boolean;
  risk_note: string | null;
  demo_scenario: string | null;
  created_at: Date;
}

export interface OrderItem {
  id: number;
  order_id: string;
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
  customer_id: string;
  status: OrderStatus;
  placed_at: Date;
  shipped_at: Date | null;
  delivered_at: Date | null;
  total: number;
  currency: string;
  items: OrderItem[];
}

/** Structured output the AI must return when reading a customer message. */
export interface AiClassification {
  is_refund_request: boolean;
  reason_category: ReasonCategory;
  item_ids: number[];
  summary: string;
  confidence: number;
  conflicting_claims: boolean;
  conflict_notes: string | null;
  manipulation_attempt: boolean;
  manipulation_notes: string | null;
  sentiment: "calm" | "frustrated" | "angry";
}

export interface SecuritySignals {
  injection_score: number;
  injection_flagged: boolean;
  matched_patterns: string[];
  foreign_order_refs: string[];
  truncated: boolean;
}
