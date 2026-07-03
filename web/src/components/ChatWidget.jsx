import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { api } from "../lib/api.js";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role: 'user'|'ai'|'error', content }
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  async function onSubmit(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await api("/api/chat", { method: "POST", body: { message: text, history } });
      setMessages((m) => [...m, { role: "ai", content: res.answer }]);
      setHistory((h) => [...h, { role: "user", content: text }, { role: "model", content: res.answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", content: err.message || "Assistant indisponible." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 74,
            right: 0,
            width: 380,
            maxWidth: "90vw",
            height: 520,
            display: "flex",
            flexDirection: "column",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
            overflow: "hidden"
          }}
        >
          <div style={{ padding: "14px 16px", background: "var(--color-primary)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Assistant comptable</div>
              <div style={{ fontSize: 11, color: "var(--color-accent-light)" }}>Basé sur le Guide SYSCOHADA</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--color-bg)" }}>
            {messages.length === 0 && (
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, margin: "auto", textAlign: "center", padding: 20 }}>
                Posez une question comptable SYSCOHADA (ex: « quel compte pour un achat de marchandises ? »).
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  padding: "9px 12px",
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  background: m.role === "user" ? "var(--color-primary)" : m.role === "error" ? "#fde8e8" : "var(--color-surface)",
                  color: m.role === "user" ? "#fff" : m.role === "error" ? "var(--color-danger)" : "var(--color-text)",
                  border: m.role === "ai" ? "1px solid var(--color-border)" : "none"
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && <div style={{ alignSelf: "flex-start", fontSize: 13, color: "var(--color-text-muted)" }}>L'assistant réfléchit…</div>}
          </div>

          <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--color-border)" }}>
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Poser une question…"
              autoComplete="off"
            />
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: "0 14px" }}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title="Assistant comptable"
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: "none",
          background: "var(--color-accent)",
          color: "#fff",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
