import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Pill, StatusBadge } from "../components/Badge";
import { dateShort, money, timeAgo } from "../format";
import type { Customer, CustomerRequest, DemoCustomer, Order, RefundResult } from "../types";

const SESSION_KEY = "refunddesk.session";
const MAX_CHARS = 2000;

interface ChatMessage {
  id: string;
  role: "customer" | "assistant";
  text: string;
  result?: RefundResult;
  error?: boolean;
}

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

const SUGGESTIONS = [
  "My item arrived damaged — the box was crushed and it's cracked.",
  "I received the wrong item, not what I ordered.",
  "My parcel never arrived.",
  "I changed my mind and would like to return it.",
];

export default function CustomerPage({ demoMode }: { demoMode: boolean }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY));
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);

  const load = useCallback(async (t: string) => {
    try {
      const me = await api.me(t);
      setCustomer(me.customer);
      setOrders(me.orders);
      setRequests(me.requests);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOut();
    }
  }, []);

  useEffect(() => {
    if (token) load(token);
  }, [token, load]);

  function signIn(t: string) {
    sessionStorage.setItem(SESSION_KEY, t);
    setToken(t);
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setToken(null);
    setCustomer(null);
    setOrders([]);
    setRequests([]);
  }

  if (!token || !customer) return <SignIn demoMode={demoMode} onSignedIn={signIn} loading={!!token && !customer} />;

  return (
    <div className="customer-layout">
      <aside className="panel orders-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Signed in as</div>
            <div className="who">{customer.name}</div>
            <div className="muted small">{customer.email}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
        <OrdersAndHistory orders={orders} requests={requests} />
      </aside>
      <Chat
        key={customer.id}
        token={token}
        customer={customer}
        orders={orders}
        onResult={() => load(token)}
      />
    </div>
  );
}

function SignIn({ demoMode, onSignedIn, loading }: { demoMode: boolean; onSignedIn: (t: string) => void; loading: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<DemoCustomer[]>([]);

  useEffect(() => {
    if (demoMode) api.demoCustomers().then(setDemo).catch(() => setDemo([]));
  }, [demoMode]);

  async function go(address: string) {
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.signIn(address);
      onSignedIn(token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="center muted">Loading your account…</div>;

  return (
    <div className="signin">
      <div className="panel signin-card">
        <h1>Get help with an order</h1>
        <p className="muted">Sign in with the email on your account to request a refund, return or cancellation.</p>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); go(email); }} className="row">
          <input
            className="input"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
          />
          <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
        </form>
        {error && <div className="form-error">{error}</div>}
        <p className="muted small">Demo sign-in uses email only. A production build would send a one-time code or magic link.</p>
      </div>

      {demo.length > 0 && (
        <div className="demo-accounts">
          <div className="section-title">
            Demo accounts <span className="muted small">— each one is set up to exercise a policy rule</span>
          </div>
          <div className="demo-grid">
            {demo.map((c) => (
              <button key={c.id} className="demo-card" onClick={() => go(c.email)} disabled={busy}>
                <div className="demo-name">{c.name}</div>
                <div className="muted small mono">{c.email}</div>
                <div className="demo-scenario">{c.scenario}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersAndHistory({ orders, requests }: { orders: Order[]; requests: CustomerRequest[] }) {
  return (
    <>
      <div className="section-title">Your orders</div>
      <div className="order-list">
        {orders.map((o) => (
          <div key={o.id} className="order-card">
            <div className="order-head">
              <span className="mono strong">{o.id}</span>
              <Pill tone={o.status === "delivered" ? "ok" : o.status === "cancelled" ? "neutral" : "info"}>{o.status}</Pill>
            </div>
            <div className="muted small">
              {o.status === "delivered" ? `Delivered ${dateShort(o.delivered_at)}` : o.status === "shipped" ? `Shipped ${dateShort(o.shipped_at)}` : `Placed ${dateShort(o.placed_at)}`}
            </div>
            <ul className="items">
              {o.items.map((i) => (
                <li key={i.id}>
                  <span className={i.refunded ? "struck" : ""}>{i.name}</span>
                  <span className="item-tags">
                    {i.final_sale && <Pill tone="warn">Final sale</Pill>}
                    {i.refunded && <Pill tone="neutral">Refunded</Pill>}
                    <span className="mono small">{money(i.unit_price * i.quantity)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {requests.length > 0 && (
        <>
          <div className="section-title">Your requests</div>
          <div className="history">
            {requests.map((r) => (
              <div key={r.reference} className="history-row">
                <div>
                  <div className="mono small strong">{r.reference}</div>
                  <div className="muted small">{r.order_id ?? "No order"} · {timeAgo(r.created_at)}</div>
                </div>
                <StatusBadge status={r.status} final={r.final_status} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Chat({ token, customer, orders, onResult }: { token: string; customer: Customer; orders: Order[]; onResult: () => void }) {
  const firstName = customer.name.split(" ")[0];
  const [orderId, setOrderId] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "hello",
      role: "assistant",
      text: `Hi ${firstName}! I'm the RefundDesk assistant. Choose the order you need help with, tell me what happened, and I'll check it against our refund policy right away.`,
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    const orderLabel = orderId ? ` (about ${orderId})` : "";
    setMessages((m) => [...m, { id: nextId(), role: "customer", text: trimmed + orderLabel }]);
    setText("");
    setBusy(true);
    try {
      const result = await api.submitRefund(token, trimmed, orderId || null);
      setMessages((m) => [...m, { id: nextId(), role: "assistant", text: result.message, result }]);
      onResult();
    } catch (e) {
      setMessages((m) => [...m, { id: nextId(), role: "assistant", text: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(text);
    }
  }

  return (
    <section className="panel chat">
      <div className="chat-head">
        <div>
          <div className="strong">Refund assistant</div>
          <div className="muted small">Decisions follow our published refund policy. Complex cases go to a person.</div>
        </div>
      </div>

      <div className="chat-body" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`bubble-row ${m.role}`}>
            <div className={`bubble ${m.role} ${m.error ? "bubble-error" : ""}`}>
              {m.result && (
                <div className="bubble-meta">
                  <StatusBadge status={m.result.status} />
                  {m.result.status === "approved" && <span className="strong">{money(m.result.amount)}</span>}
                  <span className="mono small muted">{m.result.reference}</span>
                </div>
              )}
              <div className="bubble-text">{m.text}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="bubble-row assistant">
            <div className="bubble assistant typing" aria-label="Assistant is reviewing your request">
              <span /><span /><span />
              <em className="muted small">Checking your order against the policy…</em>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => setText(s)}>{s}</button>
          ))}
        </div>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <div className="composer-top">
          <label className="small muted" htmlFor="order">Order</label>
          <select id="order" className="select" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Mention it in the message…</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.items.map((i) => i.name).join(", ").slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
        <div className="composer-row">
          <textarea
            className="textarea"
            rows={2}
            maxLength={MAX_CHARS}
            placeholder="Describe the problem, e.g. which item and what went wrong…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            disabled={busy}
          />
          <button className="btn btn-primary" disabled={busy || !text.trim()}>Send</button>
        </div>
        <div className="composer-foot muted small">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span>{text.length}/{MAX_CHARS}</span>
        </div>
      </form>
    </section>
  );
}
