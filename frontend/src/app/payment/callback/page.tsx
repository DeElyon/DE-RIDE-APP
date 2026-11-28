'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleHelp, LoaderCircle, TriangleAlert } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';

type PaymentResult = {
  status: 'SUCCEEDED';
  reference: string;
  amount_ngn: number;
  intent_type: string;
  payment_intent_id: string;
  ticket_id?: string;
};

const destinations: Record<string, { href: string; label: string }> = {
  WALLET_FUNDING: { href: '/wallet', label: 'Open wallet' },
  TICKET_CHECKOUT: { href: '/tickets', label: 'View tickets' },
  SUBSCRIPTION: { href: '/subscriptions', label: 'View subscriptions' },
  AMEBO_TOKENS: { href: '/amebo', label: 'Return to Amebo' },
  VTU_DATA: { href: '/data', label: 'View data purchases' },
  RIDER_ORDER: { href: '/mobility', label: 'View your order' },
};

export default function PaymentCallbackPage() {
  const started = useRef(false);
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [message, setMessage] = useState('Checking payment status with Paystack…');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const reference = new URLSearchParams(window.location.search).get('reference')
      || new URLSearchParams(window.location.search).get('trxref');
    if (!reference || reference.length > 160) {
      setStatus('error');
      setMessage('The payment reference is missing or invalid. Check your payment history before trying again.');
      return;
    }

    let active = true;
    void (async () => {
      try {
        let lastError = 'Payment is not confirmed yet. If you were charged, wait briefly and try again.';
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const response = await apiRequest(`/payments/verify?reference=${encodeURIComponent(reference)}`);
          const body = await response.json();
          if (response.ok) {
            if (active) {
              setResult(body as PaymentResult);
              setStatus('success');
              setMessage('Payment verified securely.');
              window.history.replaceState({}, '', '/payment/callback');
            }
            return;
          }
          lastError = body.message || body.error || lastError;
          if (response.status !== 409 || attempt === 3) break;
          await new Promise(resolve => window.setTimeout(resolve, 1500));
        }
        throw new Error(lastError);
      } catch (error) {
        if (active) {
          setStatus('error');
          setMessage(error instanceof Error ? error.message : 'Payment status could not be checked.');
        }
      }
    })();
    return () => { active = false; };
  }, []);

  const destination = result ? destinations[result.intent_type] ?? destinations.WALLET_FUNDING : null;
  const destinationHref = destination && result
    ? `${destination.href}?payment=return&reference=${encodeURIComponent(result.reference)}`
    : undefined;

  return (
    <main className="wallet-page">
      <header className="wallet-top">
        <Link href="/" className="wallet-brand"><span>DR</span>DE <i>RIDE</i></Link>
        <Link href="/wallet" className="wallet-back">Payment status</Link>
      </header>
      <div className="wallet-content payment-callback-content">
        <section className="wallet-card payment-callback-card" aria-live="polite">
          <div className={`payment-callback-icon is-${status}`}>
            {status === 'checking' ? <LoaderCircle size={28} className="payment-callback-spin" />
              : status === 'success' ? <CheckCircle2 size={28} />
                : <TriangleAlert size={28} />}
          </div>
          <span className="account-kicker">DE RIDE · PAYSTACK</span>
          <h1>{status === 'checking' ? 'Confirming your payment' : status === 'success' ? 'Payment confirmed' : 'Payment needs attention'}</h1>
          <p>{message}</p>
          {result && <div className="payment-callback-receipt">
            <span>Amount confirmed <b>₦{result.amount_ngn.toLocaleString('en-NG')}</b></span>
            <span>Payment reference <code>{result.reference}</code></span>
          </div>}
          {destination && destinationHref && <Link className="wallet-primary payment-callback-action" href={destinationHref}>{destination.label}</Link>}
          {status === 'error' && <Link className="wallet-secondary payment-callback-action" href="/transactions"><CircleHelp size={16} /> Check payment history</Link>}
          <small className="payment-callback-note">Payment is confirmed by the DE RIDE API; returning to this page alone does not mark a payment as successful.</small>
        </section>
      </div>
    </main>
  );
}
