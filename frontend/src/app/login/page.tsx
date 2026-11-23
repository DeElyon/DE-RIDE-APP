'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type Mode = 'sign-in' | 'sign-up' | 'verify';
const roles = ['PASSENGER', 'DRIVER', 'DISPATCHER', 'BIKER', 'DISPATCH_RIDER', 'PARK_OPERATOR'];
const destination: Record<string, string> = { PASSENGER: '/passenger/explore', DRIVER: '/driver/dashboard', DISPATCHER: '/park-operator/terminal', BIKER: '/biker/radar', DISPATCH_RIDER: '/dispatch-rider/deliveries', PARK_OPERATOR: '/park-operator/terminal' };
const api = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [role, setRole] = useState('PASSENGER');
  const [mode, setMode] = useState<Mode>('sign-in');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const path = mode === 'sign-up' ? '/auth/register' : mode === 'verify' ? '/auth/verify-otp' : '/auth/login';
      const body = mode === 'sign-up' ? { email, password, name, role } : mode === 'verify' ? { email, code: otp } : { email, password };
      const response = await fetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || result.detail || 'Request failed');
      if (mode === 'sign-up') { setMode('verify'); setMessage('Check your email for a six-digit verification code.'); return; }
      if (mode === 'verify' || mode === 'sign-in') {
        sessionStorage.setItem('deride_access_token', result.access_token);
        sessionStorage.setItem('deride_refresh_token', result.refresh_token);
        window.location.assign(destination[result.active_role] || '/passenger/explore');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed'); }
    finally { setBusy(false); }
  }

  function signOut() { sessionStorage.removeItem('deride_access_token'); sessionStorage.removeItem('deride_refresh_token'); setMessage('Signed out.'); }
  const heading = mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create your account' : 'Verify your email';

  return <main style={{ maxWidth: 440, margin: '56px auto', padding: 24 }}>
    <Link href="/">← DE RIDE</Link>
    <h1>{heading}</h1>
    <p style={{ color: '#9FB1B9' }}>{mode === 'verify' ? 'Enter the code sent to your email. It expires after 10 minutes.' : 'Your account is protected with email verification.'}</p>
    <form onSubmit={submit}>
      {mode !== 'verify' && <>
        {mode === 'sign-up' && <>
          <label>Name<input required autoComplete="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} /></label>
          <label>Account type<select value={role} onChange={(event) => setRole(event.target.value)} style={inputStyle}>{roles.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
        </>}
        <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} /></label>
        <label>Password<input required type="password" minLength={10} maxLength={128} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} /></label>
      </>}
      {mode === 'verify' && <>
        <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} /></label>
        <label>Six-digit code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} style={inputStyle} /></label>
      </>}
      <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Please wait…' : mode === 'verify' ? 'Verify and continue' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
    </form>
    {mode !== 'verify' && <p><button type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')} style={secondaryStyle}>{mode === 'sign-in' ? 'Create an account' : 'I already have an account'}</button></p>}
    {mode === 'verify' && <p><button type="button" onClick={() => setMode('sign-up')} style={secondaryStyle}>Back to registration</button></p>}
    <button type="button" onClick={signOut} style={secondaryStyle}>Sign out</button>
    <p role="status" aria-live="polite" style={{ color: '#F46A6A' }}>{message}</p>
  </main>;
}

const inputStyle = { display: 'block', width: '100%', minHeight: 48, padding: 14, margin: '8px 0 16px', background: '#243036', color: 'white', border: '1px solid #324149', borderRadius: 8 };
const buttonStyle = { minHeight: 48, padding: '0 18px', background: '#F46A6A', border: 0, borderRadius: 8, color: '#1B2428', fontWeight: 700, cursor: 'pointer' };
const secondaryStyle = { minHeight: 48, padding: '0 12px', background: 'transparent', border: '1px solid #324149', borderRadius: 8, color: '#FFFFFF', cursor: 'pointer' };
