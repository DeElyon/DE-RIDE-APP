"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BusFront } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError("We couldn’t verify those details. Check your email and password, then try again.");
        return;
      }
      if (isSignUp) await fetch("/api/profile", { method: "POST" });
      router.push("/app");
      router.refresh();
    } catch {
      setError("We couldn’t complete sign-in right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-screen">
      <Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to DE RIDE</Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="auth-mark"><BusFront size={19} /></span>
        <span className="eyebrow">TRAVEL WITH CONFIDENCE</span>
        <h1 id="auth-title">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-intro">{isSignUp ? "Save your tickets and manage every journey in one place." : "Sign in to see your tickets and manage your DE RIDE account."}</p>
        <form onSubmit={submit} className="auth-form">
          {isSignUp && <label htmlFor="name">Full name<input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={100} /></label>}
          <label htmlFor="email">Email address<input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={254} /></label>
          <label htmlFor="password">Password<input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignUp ? "new-password" : "current-password"} required minLength={8} maxLength={128} /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-coral auth-submit" type="submit" disabled={pending}>{pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}<ArrowRight size={16} /></button>
        </form>
        <p className="auth-switch">{isSignUp ? "Already have an account?" : "New to DE RIDE?"} <Link href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</Link></p>
        <p className="auth-security">Your account is protected with encrypted sessions and password hashing.</p>
      </section>
    </main>
  );
}
