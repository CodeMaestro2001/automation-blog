"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error || "Could not sign in.");
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-lock"><LockKeyhole size={18} /></div>
        <p className="kicker">Private workspace</p>
        <h1>Your publishing desk.</h1>
        <p className="login-copy">One secure place for every article you send into the world.</p>
        <form onSubmit={submit}>
          <label htmlFor="password">Publisher password</label>
          <div className="password-row">
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required />
            <button type="submit" disabled={loading} aria-label="Sign in"><ArrowRight size={20} /></button>
          </div>
          <p className="form-error" role="alert">{error}</p>
        </form>
      </section>
      <p className="login-foot">Signal / Central publisher</p>
    </main>
  );
}
