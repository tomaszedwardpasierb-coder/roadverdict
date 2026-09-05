// Place at: src/app/login/verify-2fa/page.tsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";
import styles from "../login.module.css";

function Verify2faForm() {
  const searchParams = useSearchParams();
  // Re-validated here even though verify/route.ts already checked it
  // before building this page's own URL - the same reasoning as
  // safeRedirect.ts itself: a query string is plain, attacker-editable
  // text, never trusted just because an earlier step approved it once.
  const redirect = getSafeRedirectPath(searchParams.get("redirect")) ?? "/dashboard";

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/totp/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Try again.");
        return;
      }
      // A hard navigation, not router.push - the server just set a real,
      // httpOnly session cookie, and every server component past this
      // point (starting with the dashboard itself) needs to see it on a
      // fresh request, not a client-side transition that could race it.
      window.location.href = redirect;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <img src="/logo.png" alt="RoadVerdict" className={styles.logoImg} />
      <h1 className={styles.heading}>Enter your code</h1>
      <p className={styles.subtext}>
        Open your authenticator app and enter the 6-digit code for RoadVerdict - or use one of your backup codes.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="totp-code" className={styles.label}>
            Code
          </label>
          <input
            id="totp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={styles.input}
            placeholder="123456"
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        <button type="submit" className={styles.submit} disabled={submitting || !code.trim()}>
          {submitting ? "Verifying..." : "Verify"}
        </button>
      </form>
    </div>
  );
}

export default function Verify2faPage() {
  return (
    <div className={styles.wrapper}>
      <Suspense fallback={null}>
        <Verify2faForm />
      </Suspense>
    </div>
  );
}
