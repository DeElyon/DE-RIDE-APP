'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Bot, CircleHelp, LifeBuoy, MessageCircle, Send, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { friendlyError } from '@/lib/error-messages';
import { useLanguage } from '@/components/language-provider';

export function AmeboSupportWidget() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true); setError(''); setReply('');
    try {
      const response = await apiRequest('/amebo/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, language, mode: 'TEXT' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Amebo is unavailable.');
      setReply(data.reply || 'I’m here. What would you like to know?'); setMessage('');
    } catch (cause) {
      setError(friendlyError(cause instanceof Error ? cause.message : '', 'Amebo couldn’t reply just now. Please try again.'));
    } finally { setBusy(false); }
  }

  return <div className="assistant-widget">
    {open && <section className="assistant-panel" aria-label="Amebo and support">
      <header className="assistant-panel-head"><span className="assistant-avatar"><Bot size={18}/></span><div><b>Amebo</b><small>DE RIDE travel companion</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={17}/></button></header>
      <div className="assistant-panel-body"><p className="assistant-greeting">Hi, I’m Amebo. Need a travel tip or help finding the right place?</p>
        {reply && <p className="assistant-reply" aria-live="polite">{reply}</p>}
        {error && <p className="assistant-error" role="alert">{error}</p>}
        <form onSubmit={send} className="assistant-form"><label className="sr-only" htmlFor="assistant-message">Message Amebo</label><textarea id="assistant-message" maxLength={1200} rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="Ask Amebo…"/><button type="submit" aria-label="Send message" disabled={!message.trim() || busy}>{busy ? <span className="assistant-send-spinner"/> : <Send size={16}/>}</button></form>
        <div className="assistant-links"><Link href="/amebo"><Bot size={14}/> Open full chat</Link><Link href="/support"><LifeBuoy size={14}/> Support &amp; disputes</Link></div>
      </div>
    </section>}
    <button type="button" className="assistant-launcher" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={open ? 'Close Amebo assistant' : 'Open Amebo AI and support'}>{open ? <X size={21}/> : <><MessageCircle size={19}/><span>Amebo <i><CircleHelp size={12}/></i></span></>}</button>
  </div>;
}
