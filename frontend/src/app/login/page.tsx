'use client';

import { FormEvent, useState } from 'react';
import { getNeonAuthClient } from '@/lib/neon-auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const auth = getNeonAuthClient();
      const result = mode === 'sign-up'
        ? await auth.signUp.email({ email, password, name })
        : await auth.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || 'Authentication failed');
      setMessage(mode === 'sign-up' ? 'Account created. You are signed in.' : 'Signed in successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      const result = await getNeonAuthClient().signOut();
      setMessage(result.error?.message ?? 'Signed out.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign out failed');
    }
  }

  return <main style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
    <a href="/">← DE RIDE</a>
    <h1>{mode === 'sign-in' ? 'Sign in' : 'Create your account'}</h1>
    <form onSubmit={submit}>
      {mode === 'sign-up' && <label>Name<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} /></label>}
      <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} /></label>
      <label>Password<input required type="password" minLength={8} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} /></label>
      <button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
    </form>
    <p><button type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
      {mode === 'sign-in' ? 'Create an account' : 'I already have an account'}
    </button></p>
    <p><a href="/neon">Neon service checks →</a></p>
    <button type="button" onClick={signOut}>Sign out</button>
    <p role="status" aria-live="polite">{message}</p>
  </main>;
}

const inputStyle = { display: 'block', width: '100%', padding: 14, margin: '8px 0 16px', background: '#243036', color: 'white' };
