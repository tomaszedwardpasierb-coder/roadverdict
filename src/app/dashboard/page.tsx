// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <img src="/logo.png" alt="RoadVerdict" className={styles.logoImg} />
        <LogoutButton />
      </header>

      <main className={styles.main}>
        <h1 className={styles.heading}>Welcome back</h1>
        <p className={styles.subtext}>Signed in as {session.email}</p>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Your bike</h2>
          <p className={styles.cardBody}>
            No bike added yet. Once you add one, its details and service history will show here.
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Service history</h2>
          <p className={styles.cardBody}>
            No service records logged yet.
          </p>
        </div>
      </main>
    </div>
  );
}
