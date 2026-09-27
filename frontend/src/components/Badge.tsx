import type { RequestStatus } from "../types";
import { STATUS_LABEL } from "../format";

export function StatusBadge({ status, final }: { status: RequestStatus; final?: "approved" | "denied" | null }) {
  if (final) {
    return (
      <span className="badge-group">
        <span className={`badge badge-${final}`}>{STATUS_LABEL[final]}</span>
        <span className="badge-sub">after review</span>
      </span>
    );
  }
  if (status === "escalated") {
    return <span className="badge badge-escalated">Pending review</span>;
  }
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "danger" | "info" | "ok" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
