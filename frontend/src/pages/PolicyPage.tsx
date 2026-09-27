import { marked } from "marked";
import { useEffect, useState } from "react";
import { api } from "../api";

export default function PolicyPage() {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .policy()
      .then((p) => setHtml(marked.parse(p.markdown, { async: false }) as string))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="policy panel">
      {error && <div className="banner banner-error">{error}</div>}
      {/* Markdown comes from our own repo (backend/policy), not from users. */}
      <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
