import { createRealtimeClient, type SealedLiveQuery } from '@neon/realtime/client';

type LiveKind = 'support-messages' | 'disputes';

export function connectNeonLiveQuery<Row>(kind: LiveKind, onRows: (rows: Row[]) => void, caseID?: string) {
  let closed = false;
  let client: ReturnType<typeof createRealtimeClient> | undefined;
  let unsubscribe: (() => void) | undefined;
  const endpoint = process.env.NEXT_PUBLIC_NEON_REALTIME_URL;

  if (endpoint) {
    void (async () => {
      try {
        const token = sessionStorage.getItem('deride_access_token');
        if (!token) return;
        const response = await fetch('/api/neon/live-query', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ kind, ...(caseID ? { case_id: caseID } : {}) }),
        });
        if (!response.ok || closed) return;
        const { sealedQuery } = await response.json() as { sealedQuery: SealedLiveQuery<unknown> };
        client = createRealtimeClient({ url: endpoint });
        const subscription = client.subscribe(sealedQuery);
        unsubscribe = subscription.onChange(snapshot => {
          if (!closed && snapshot.status === 'live' && snapshot.data) onRows([...snapshot.data] as Row[]);
        });
      } catch {
        // The authenticated API polling path remains active if live sync is unavailable.
      }
    })();
  }

  return () => {
    closed = true;
    unsubscribe?.();
    client?.close();
  };
}
