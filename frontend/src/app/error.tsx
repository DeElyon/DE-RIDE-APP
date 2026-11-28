'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('DE RIDE page error'); }, []);
  return <main className="app-error-page"><section className="app-error-card" role="alert"><span className="app-error-icon"><AlertTriangle size={24}/></span><small>DE RIDE · TEMPORARY ISSUE</small><h1>That didn’t go as planned.</h1><p>Your information is safe. Try loading this page again, or head back to the home page.</p><div><button type="button" onClick={() => reset()}><RefreshCw size={16}/> Try again</button><Link href="/"><Home size={16}/> Go home</Link></div><Link className="app-error-support" href="/support">Still stuck? Contact support</Link></section></main>;
}
