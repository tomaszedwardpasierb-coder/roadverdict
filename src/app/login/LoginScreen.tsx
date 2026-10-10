// Place at: src/app/login/LoginScreen.tsx
//
// The sign-in form itself; page.tsx sends anyone already signed in straight
// on instead of showing it.
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";
import { FunnelBeacon } from "@/components/FunnelBeacon";
import { classifySource } from "@/lib/analytics/funnelSource";

const URL_ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That sign-in link isn't valid. Request a new one below.",
  expired_link: "That link has expired or was already used. Request a new one below.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  // Where to return to after a successful sign-in, if this page was
  // reached from somewhere specific (e.g. "sign in to request this
  // bike's history" on a shared report) rather than navigated to
  // directly. Threaded through to the emailed link itself in
  // request-link's own response - see safeRedirect.ts for why this
  // can't just be trusted as-is without validation.
  const redirect = searchParams.get("redirect");
  // Where this visit came from (the home page adds ?src= to its sign-in
  // links) - passed on so the later funnel steps count by source.
  const src = classifySource({ src: searchParams.get("src"), utmSource: searchParams.get("utm_source"), referrer: typeof document === "undefined" ? null : document.referrer });

  // Most people arrive from a "Start your motorcycle's/car's logbook"
  // button and have no account yet, so the page speaks to them as new
  // (it used to say "Sign in to track your bike" to everyone - 4 in 5
  // visitors left without entering an email).
  const kind = redirect?.includes("addVehicle=car") ? "car" : redirect?.includes("addVehicle=bike") ? "bike" : null;
  const heading = kind === "car" ? "Start your car's logbook" : kind === "bike" ? "Start your motorcycle's logbook" : "Start your free logbook – motorcycle or car";

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
        body: JSON.stringify({ email, redirect, src }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }

      if (data.demo) {
        window.location.href = data.redirect ?? "/dashboard";
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
          We&apos;ve sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes
          and works once.
        </p>
        <p className={styles.hint}>Not there in a minute? Check your spam or promotions folder.</p>
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
      <h1 className={styles.heading}>{heading}</h1>
      <p className={styles.subtext}>
        Enter your email and we&apos;ll send you a link. New here? The same link creates your free account - no
        password, nothing to install.
      </p>
      <ul className={styles.ticks}>
        <li>Free for one vehicle</li>
        <li>No password - just a link to your email</li>
        <li>Your email is never sold or shared for marketing</li>
      </ul>

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

      <p className={styles.alt}>
        Not ready yet? <a href="/demo">See it with a sample bike first</a>
      </p>
    </div>
  );
}

export function LoginScreen() {
  return (
    <div className={styles.wrapper}>
      <FunnelBeacon step="login" />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
