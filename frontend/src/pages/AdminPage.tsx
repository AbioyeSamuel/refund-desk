import { FormEvent, Fragment, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Pill, StatusBadge } from "../components/Badge";
import { dateShort, dateTime, humanize, money, REASON_LABEL, timeAgo } from "../format";
import type { CrmCustomer, RefundDetail, RefundRow, Stats } from "../types";

const TOKEN_KEY = "refunddesk.admin";

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "pending_review", label: "Pending review" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
  { key: "escalated", label: "Escalated" },
  { key: "needs_info", label: "Needs info" },
];

export default function AdminPage({ demoMode }: { demoMode: boolean }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [tab, setTab] = useState<"requests" | "customers">("requests");

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  if (!token) {
    return <AdminLogin demoMode={demoMode} onOk={(t) => { sessionStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  }

  return (
    <div className="admin">
      <div className="admin-head">
        <div>
          <h1>Support dashboard</h1>
          <p className="muted">Every request, the decision the policy engine made, and why.</p>
        </div>
        <div className="row">
          <div className="tabs">
            <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Refund requests</button>
            <button className={tab === "customers" ? "active" : ""} onClick={() => setTab("customers")}>Customers (CRM)</button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Lock</button>
        </div>
      </div>
      {tab === "requests" ? <Requests token={token} demoMode={demoMode} onUnauthorized={signOut} /> : <Customers token={token} />}
    </div>
  );
}

function AdminLogin({ demoMode, onOk }: { demoMode: boolean; onOk: (t: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.admin.stats(value);
      onOk(value);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "That token isn't valid." : (err as Error).message);
    }
  }

  return (
    <div className="signin">
      <form className="panel signin-card" onSubmit={submit}>
        <h1>Support dashboard</h1>
        <p className="muted">Enter the admin token configured in <code>ADMIN_TOKEN</code>.</p>
        <div className="row">
          <input className="input" type="password" placeholder="Admin token" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <button className="btn btn-primary">Open</button>
        </div>
        {error && <div className="form-error">{error}</div>}
        {demoMode && <p className="muted small">Demo default: <code>demo-admin-token</code></p>}
      </form>
    </div>
  );
}

function Requests({ token, demoMode, onUnauthorized }: { token: string; demoMode: boolean; onUnauthorized: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (filter) params.status = filter;
      if (flagged) params.flagged = "true";
      if (search.trim()) params.search = search.trim();
      const [s, list] = await Promise.all([api.admin.stats(token), api.admin.list(token, params)]);
      setStats(s);
      setRows(list.items);
      setTotal(list.total);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else setError((e as Error).message);
    }
  }, [token, filter, flagged, search, onUnauthorized]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function reset() {
    if (!confirm("Reset all demo data? This clears every refund request and restores the 15 seed customers.")) return;
    await api.admin.reset(token);
    setSelected(null);
    refresh();
  }

  return (
    <>
      {stats && (
        <div className="stats">
          <Stat label="Requests" value={String(stats.total)} sub={`${stats.needs_info} needed more info`} />
          <Stat label="Auto-approved" value={String(stats.approved)} sub={`${money(stats.auto_approved_amount)} refunded`} tone="ok" />
          <Stat label="Denied" value={String(stats.denied)} sub="policy ineligible" tone="danger" />
          <Stat label="Pending review" value={String(stats.pending_review)} sub={`${money(stats.pending_amount)} awaiting a decision`} tone="warn" />
          <Stat label="Security flags" value={String(stats.security_flagged)} sub="injection / manipulation" tone={stats.security_flagged ? "danger" : undefined} />
          <Stat label="Avg decision time" value={`${(stats.avg_latency_ms / 1000).toFixed(stats.avg_latency_ms < 1000 ? 2 : 1)}s`} sub={`AI: ${stats.ai.provider}`} />
        </div>
      )}

      <div className="toolbar">
        <div className="segmented">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Security flagged only
        </label>
        <input className="input input-search" placeholder="Search reference, order, customer, message…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {demoMode && <button className="btn btn-ghost btn-sm" onClick={reset}>Reset demo data</button>}
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th><th>Reference</th><th>Customer</th><th>Order</th><th>Reason</th><th className="num">Amount</th><th>Outcome</th><th>Rule</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="empty">No requests yet. File one from the Customer support page.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={selected === r.id ? "selected" : ""} onClick={() => setSelected(r.id)}>
                <td className="muted nowrap" title={dateTime(r.created_at)}>{timeAgo(r.created_at)}</td>
                <td className="mono">{r.reference}</td>
                <td>
                  <div>{r.customer_name}</div>
                  <div className="muted small">{r.customer_email}</div>
                </td>
                <td className="mono">{r.order_id ?? <span className="muted">—</span>}</td>
                <td>{r.reason_category ? REASON_LABEL[r.reason_category] ?? r.reason_category : "—"}</td>
                <td className="num mono">{r.amount ? money(r.amount) : "—"}</td>
                <td><StatusBadge status={r.status} final={r.final_status} /></td>
                <td className="nowrap">
                  {r.primary_rule && <span className="mono small">{r.primary_rule}</span>}
                  {r.security_flagged && <span className="flag" title="Security flagged">⚠</span>}
                  {r.ai_degraded && <span className="flag" title="AI unavailable — failed safe">⛑</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > rows.length && <div className="muted small table-foot">Showing {rows.length} of {total}</div>}
      </div>

      {selected && <Detail id={selected} token={token} onClose={() => setSelected(null)} onChanged={refresh} />}
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className={`panel stat ${tone ? `stat-${tone}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="muted small">{sub}</div>
    </div>
  );
}

const OUTCOME_ICON: Record<string, string> = { pass: "✓", deny: "✕", escalate: "↑", info: "i", skip: "–" };

function Detail({ id, token, onClose, onChanged }: { id: string; token: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<RefundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reviewer, setReviewer] = useState(() => localStorage.getItem("refunddesk.reviewer") ?? "");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.admin.detail(token, id).then(setData).catch((e) => setError(e.message));
  }, [token, id]);

  useEffect(() => {
    setData(null);
    setNote("");
    setError(null);
    load();
  }, [load]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function review(decision: "approved" | "denied") {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem("refunddesk.reviewer", reviewer);
      await api.admin.review(token, id, decision, note, reviewer || "support-agent");
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const r = data?.request;
  const c = r?.ai_classification;
  const sec = r?.security_signals;
  const canReview = r?.status === "escalated" && !r.final_status;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Request detail">
        <div className="drawer-head">
          <div>
            <div className="mono strong">{r?.reference ?? "…"}</div>
            {r && <div className="muted small">{dateTime(r.created_at)} · {r.latency_ms} ms · {r.ai_provider}/{r.ai_model}</div>}
          </div>
          <div className="row">
            {r && <StatusBadge status={r.status} final={r.final_status} />}
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {error && <div className="banner banner-error">{error}</div>}
        {!r && !error && <div className="muted pad">Loading…</div>}

        {r && data && (
          <div className="drawer-body">
            {canReview && (
              <section className="review-box">
                <div className="strong">Human review needed</div>
                <p className="small muted">
                  {r.item_ids.length
                    ? `Approving refunds ${money(r.amount)} and marks the items as refunded.`
                    : "No refundable items are linked to this request — it can only be denied."}
                </p>
                <textarea className="textarea" rows={2} placeholder="Decision note (required, visible in the audit trail)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="row">
                  <input className="input" placeholder="Your name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
                  <button className="btn btn-approve" disabled={busy || note.trim().length < 3 || !r.item_ids.length} onClick={() => review("approved")}>
                    Approve {r.item_ids.length ? money(r.amount) : ""}
                  </button>
                  <button className="btn btn-deny" disabled={busy || note.trim().length < 3} onClick={() => review("denied")}>Deny</button>
                </div>
              </section>
            )}
            {r.final_status && (
              <section className="reviewed">
                <span className="strong">Reviewed by {r.reviewed_by}</span> · {r.reviewed_at && dateTime(r.reviewed_at)}
                <div className="small">{r.review_note}</div>
              </section>
            )}

            <Section title="Customer">
              <div className="kv">
                <span>Name</span><span>{r.customer_name} <span className="muted">({r.customer_id})</span></span>
                <span>Email</span><span>{r.customer_email}</span>
                <span>Tier</span><span>{r.customer_tier === "vip" ? "VIP" : humanize(r.customer_tier)}</span>
                <span>Refunds, last 90 days</span><span>{data.customer_refunds_last_90_days}</span>
                {r.customer_risk_flag && (<><span>Risk flag</span><span><Pill tone="danger">{r.customer_risk_note ?? "Flagged"}</Pill></span></>)}
              </div>
            </Section>

            <Section title="Customer message">
              <blockquote className="quote">{r.message}</blockquote>
            </Section>

            <Section title="Reply sent to customer">
              <div className="reply">{r.customer_response}</div>
            </Section>

            {r.agent_brief && (
              <Section title="Agent brief (AI)">
                <div className="small">{r.agent_brief}</div>
              </Section>
            )}

            {r.rule_trace.length > 0 && (
              <Section title="Policy decision trace">
                <ul className="trace">
                  {r.rule_trace.map((t, i) => (
                    <li key={i} className={`trace-${t.outcome}`}>
                      <span className="trace-icon" title={t.outcome}>{OUTCOME_ICON[t.outcome]}</span>
                      <span className="mono small trace-rule">{t.rule}</span>
                      <span>
                        <span className="strong small">{t.name}</span>
                        <span className="small muted"> — {t.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {c && (
              <Section title="AI classification">
                <div className="kv">
                  <span>Reason</span><span>{REASON_LABEL[c.reason_category] ?? c.reason_category}</span>
                  <span>Confidence</span>
                  <span className="confidence">
                    <span className="bar"><span style={{ width: `${Math.round(c.confidence * 100)}%` }} /></span>
                    {Math.round(c.confidence * 100)}%
                  </span>
                  <span>Summary</span><span>{c.summary}</span>
                  <span>Sentiment</span><span>{humanize(c.sentiment)}</span>
                  <span>Refund request</span><span>{c.is_refund_request ? "Yes" : "No"}</span>
                  {c.conflicting_claims && (<><span>Conflict</span><span><Pill tone="warn">{c.conflict_notes ?? "Conflicting claims"}</Pill></span></>)}
                  {c.manipulation_attempt && (<><span>Manipulation</span><span><Pill tone="danger">{c.manipulation_notes ?? "Detected"}</Pill></span></>)}
                  {r.ai_degraded && (<><span>Provider</span><span><Pill tone="warn">Unavailable — fell back to heuristics and forced review</Pill></span></>)}
                </div>
              </Section>
            )}

            {sec && (
              <Section title="Security screen">
                <div className="kv">
                  <span>Injection score</span>
                  <span>{sec.injection_score.toFixed(2)} {sec.injection_flagged ? <Pill tone="danger">flagged</Pill> : <Pill tone="ok">clear</Pill>}</span>
                  {sec.matched_patterns.length > 0 && (<><span>Patterns</span><span className="mono small">{sec.matched_patterns.join(", ")}</span></>)}
                  {sec.foreign_order_refs.length > 0 && (<><span>Other accounts' orders</span><span className="mono small">{sec.foreign_order_refs.join(", ")}</span></>)}
                  {data.foreign_order && (<><span>Requested order</span><span><Pill tone="danger">{data.foreign_order.id} belongs to {data.foreign_order.owner_id}</Pill></span></>)}
                  {sec.truncated && (<><span>Input</span><span>Truncated to 2,000 characters</span></>)}
                </div>
              </Section>
            )}

            {data.order && (
              <Section title={`Order ${data.order.id}`}>
                <div className="muted small">
                  {humanize(data.order.status)} · placed {dateShort(data.order.placed_at)}
                  {data.order.delivered_at && ` · delivered ${dateShort(data.order.delivered_at)}`} · total {money(data.order.total)}
                </div>
                <ul className="items">
                  {data.order.items.map((i) => (
                    <li key={i.id} className={r.item_ids.includes(i.id) ? "in-scope" : ""}>
                      <span>{i.name} <span className="muted small mono">#{i.id}</span></span>
                      <span className="item-tags">
                        {r.item_ids.includes(i.id) && <Pill tone="info">in this refund</Pill>}
                        {i.final_sale && <Pill tone="warn">Final sale</Pill>}
                        {i.refunded && <Pill>Refunded</Pill>}
                        <span className="mono small">{money(i.unit_price * i.quantity)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Audit trail">
              <ol className="audit">
                {data.audit.map((a) => (
                  <li key={a.id}>
                    <div className="audit-head">
                      <span className="strong small">{humanize(a.event_type)}</span>
                      <span className="mono small muted">{a.actor}</span>
                      <span className="small muted">{new Date(a.created_at).toLocaleTimeString()}</span>
                    </div>
                    {Object.keys(a.detail).length > 0 && <code className="audit-detail">{JSON.stringify(a.detail)}</code>}
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-title">{title}</div>
      {children}
    </section>
  );
}

function Customers({ token }: { token: string }) {
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.admin.customers(token).then(setCustomers).catch(() => setCustomers([]));
  }, [token]);

  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead>
          <tr><th>Customer</th><th>City</th><th>Tier</th><th>Orders</th><th>Risk</th><th>Demo scenario</th></tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <Fragment key={c.id}>
              <tr onClick={() => setOpen(open === c.id ? null : c.id)}>
                <td>
                  <div>{c.name} <span className="muted small mono">{c.id}</span></div>
                  <div className="muted small">{c.email}</div>
                </td>
                <td>{c.city}</td>
                <td>{c.tier === "vip" ? "VIP" : humanize(c.tier)}</td>
                <td>{c.orders.length}</td>
                <td>{c.risk_flag ? <Pill tone="danger">Flagged</Pill> : <span className="muted">—</span>}</td>
                <td className="small">{c.demo_scenario}</td>
              </tr>
              {open === c.id && (
                <tr className="subrow">
                  <td colSpan={6}>
                    {c.orders.map((o) => (
                      <div key={o.id} className="crm-order">
                        <span className="mono strong">{o.id}</span> <Pill>{o.status}</Pill>
                        <span className="muted small"> placed {dateShort(o.placed_at)}{o.delivered_at && ` · delivered ${dateShort(o.delivered_at)}`} · {money(o.total)}</span>
                        <div className="small">
                          {o.items.map((i) => `${i.name}${i.final_sale ? " (final sale)" : ""}${i.refunded ? " (refunded)" : ""}`).join(" · ")}
                        </div>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
