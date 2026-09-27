import type { RequestStatus } from "./types";

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export const dateShort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  approved: "Approved",
  denied: "Denied",
  escalated: "Escalated",
  needs_info: "Needs info",
};

export const REASON_LABEL: Record<string, string> = {
  damaged: "Damaged",
  defective: "Defective",
  wrong_item: "Wrong item",
  not_as_described: "Not as described",
  not_received: "Not received",
  changed_mind: "Changed mind",
  cancel_order: "Cancel order",
  other: "Other",
};

export const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
