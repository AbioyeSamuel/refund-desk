import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import type { Health } from "./types";
import CustomerPage from "./pages/CustomerPage";
import AdminPage from "./pages/AdminPage";
import PolicyPage from "./pages/PolicyPage";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setOffline(true));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="22" height="22"><path d="M9 17l5 5 9-11" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          RefundDesk
        </div>
        <nav className="nav">
          <NavLink to="/" end>Customer support</NavLink>
          <NavLink to="/admin">Support dashboard</NavLink>
          <NavLink to="/policy">Refund policy</NavLink>
        </nav>
        <div className="topbar-right">
          {health && (
            <span className={`ai-chip ${health.ai.provider === "mock" ? "ai-chip-mock" : ""}`} title={health.ai.model}>
              AI: {health.ai.provider === "mock" ? "offline mock" : health.ai.provider}
            </span>
          )}
        </div>
      </header>

      {offline && <div className="banner banner-error">Can't reach the API. If you're using Docker, check <code>docker compose logs backend</code>.</div>}
      {health?.ai.provider === "mock" && (
        <div className="banner">
          Running without an AI key — classification uses offline keyword heuristics and replies use templates.
          Add <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code> to <code>.env</code> to enable the LLM.
        </div>
      )}

      <main className="main">
        <Routes>
          <Route path="/" element={<CustomerPage demoMode={health?.demoMode ?? false} />} />
          <Route path="/admin" element={<AdminPage demoMode={health?.demoMode ?? false} />} />
          <Route path="/policy" element={<PolicyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
