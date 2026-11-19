"use client";

import { FormEvent, useState } from "react";
import useSWR from "swr";
import { ArrowUp, LoaderCircle, MessageCircle, Plus, Sparkles } from "lucide-react";

type Conversation = { id: string; title: string; updatedAt: string };
type Meta = { conversations: Conversation[]; tokens: { dailyFree: number; purchased: number } };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load Amebo history");
  return response.json();
};

export default function AmeboChat() {
  const { data: meta, mutate: refreshMeta } = useSWR<Meta>("/api/amebo", fetcher);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const conversationId = newChat ? selectedId : selectedId ?? meta?.conversations[0]?.id ?? null;
  const { data: messages, mutate: refreshMessages } = useSWR<Message[]>(
    conversationId ? `/api/amebo?conversationId=${conversationId}` : null,
    fetcher,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setDraft("");
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/amebo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Amebo couldn’t send that message.");
      setSelectedId(result.conversationId);
      setNewChat(false);
      await Promise.all([refreshMeta(), refreshMessages()]);
    } catch (submissionError) {
      setDraft(message);
      setError(submissionError instanceof Error ? submissionError.message : "Amebo couldn’t send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="amebo-panel" aria-labelledby="amebo-title">
      <header className="amebo-header">
        <div className="amebo-heading"><span className="alternate-icon"><Sparkles size={22} /></span><div><span className="eyebrow">YOUR ROAD COMPANION</span><h1 id="amebo-title">Amebo AI</h1><p>Travel tips and a little Lagos road gist.</p></div></div>
        <button className="button button-primary" type="button" onClick={() => { setNewChat(true); setSelectedId(null); setError(""); }}><Plus size={15} /> New chat</button>
      </header>
      <div className="amebo-meta"><span><MessageCircle size={14} /> {meta?.tokens.dailyFree ?? 10} free messages left today</span><span>Replies are AI-generated; live traffic is not connected.</span></div>
      <div className="amebo-messages" aria-live="polite" aria-label="Amebo conversation">
        {!messages?.length && !sending && <div className="amebo-welcome"><span className="amebo-welcome-icon"><Sparkles size={21} /></span><strong>What’s the journey?</strong><p>Ask Amebo for practical travel tips, route planning help, or what to pack for the road.</p><span className="amebo-suggestion">“What should I know before a long bus trip?”</span></div>}
        {messages?.map((message) => <article className={`amebo-message amebo-message-${message.role}`} key={message.id}><span>{message.role === "assistant" ? "A" : "You"}</span><p>{message.content}</p></article>)}
        {sending && <div className="amebo-thinking"><LoaderCircle size={16} className="amebo-spinner" /> Amebo is thinking…</div>}
      </div>
      {error && <p className="auth-error amebo-error" role="alert">{error}</p>}
      <form className="amebo-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="amebo-message">Message Amebo</label>
        <textarea id="amebo-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder="Ask Amebo anything about your journey…" rows={2} disabled={sending} />
        <button className="amebo-send" type="submit" aria-label="Send message" disabled={!draft.trim() || sending}><ArrowUp size={18} /></button>
      </form>
      <p className="amebo-disclaimer">Don’t share passwords or payment details. Confirm departure and fare details with your operator.</p>
    </section>
  );
}
