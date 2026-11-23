'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createRealtimeClient } from '@neon/realtime/client';

const services = ['postgres', 'ai-gateway', 'object-storage', 'functions', 'realtime'] as const;

export default function NeonServiceConsole() {
  const [message, setMessage] = useState('Sign in, then run each service check.');
  const [busy, setBusy] = useState<string | null>(null);

  async function check(service: (typeof services)[number]) {
    setBusy(service);
    setMessage(`Checking ${service}…`);
    try {
      const bearer = sessionStorage.getItem('deride_access_token');
      if (!bearer) throw new Error('Sign in is required to run service checks.');

      const response = await fetch('/api/neon/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ service }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `${service} check failed`);

      if (service === 'realtime') {
        const url = process.env.NEXT_PUBLIC_NEON_REALTIME_URL;
        if (!url) throw new Error('NEXT_PUBLIC_NEON_REALTIME_URL is not configured');
        const client = createRealtimeClient({ url });
        const subscription = client.subscribe(result.sealedQuery);
        const snapshot = await new Promise<readonly unknown[]>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Realtime initial snapshot timed out')), 15000);
          const offChanges = subscription.onChange((snapshot) => {
            if (snapshot.data?.length) {
              window.clearTimeout(timeout);
              offChanges();
              offState();
              resolve(snapshot.data);
            }
          });
          const offState = subscription.onStateChange((state) => {
            if (state.status === 'error') {
              window.clearTimeout(timeout);
              offChanges();
              offState();
              reject(new Error(state.error.message));
            }
          });
        });
        subscription.unsubscribe();
        client.close();
        setMessage(`${service}: live subscription received ${JSON.stringify(snapshot)}`);
      } else {
        setMessage(`${service}: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      setMessage(`${service}: ${error instanceof Error ? error.message : 'check failed'}`);
    } finally {
      setBusy(null);
    }
  }

  return <main style={{ maxWidth: 760, margin: '64px auto', padding: 24 }}>
    <Link href="/">← DE RIDE</Link>
    <h1>Neon service connections</h1>
    <p>Checks require an authenticated DE RIDE account. Storage checks upload, download and remove a temporary object.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {services.map((service) => <button key={service} disabled={busy !== null} onClick={() => check(service)}>
        {busy === service ? `Checking ${service}…` : `Check ${service}`}
      </button>)}
    </div>
    <pre role="status" style={{ whiteSpace: 'pre-wrap', marginTop: 24 }}>{message}</pre>
  </main>;
}
