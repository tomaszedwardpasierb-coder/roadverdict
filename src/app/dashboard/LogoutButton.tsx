// Place at: src/app/dashboard/LogoutButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={styles.logoutButton}
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
