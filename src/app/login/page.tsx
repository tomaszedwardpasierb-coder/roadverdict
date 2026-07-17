// Place at: src/app/login/page.tsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";

const URL_ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That sign-in link isn't valid. Request a new one below.",
  expired_link: "That link has expired or was already used. Request a new one below.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  if (status === "sent") {
    return (
      <div className={styles.card}>
        <div className={styles.sentIcon} aria-hidden="true">
          ✓
        </div>
        <h1 className={styles.heading}>Check your email</h1>
        <p className={styles.subtext}>
          We've sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes
          and works once.
        </p>
        <button
          type="button"
          className={styles.resendLink}
          onClick={() => setStatus("idle")}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <img src="/logo.png" alt="RoadVerdict" className={styles.logoImg} />
      <h1 className={styles.heading}>Sign in to track your bike</h1>
      <p className={styles.subtext}>
        Enter your email and we'll send you a link to sign in — no password to remember.
      </p>

      {urlError && URL_ERROR_MESSAGES[urlError] && (
        <div className={styles.banner} role="alert">
          {URL_ERROR_MESSAGES[urlError]}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            placeholder="you@example.com"
          />
          {status === "error" && errorMessage && (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <button type="submit" className={styles.submit} disabled={status === "sending"}>
          {status === "sending" ? "Sending link..." : "Send sign-in link"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.wrapper}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
