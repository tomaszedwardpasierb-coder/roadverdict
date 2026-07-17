// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";
import { getBike } from "@/lib/tracker/bike";
import { AddBikeForm } from "./AddBikeForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const bike = await getBike(session.email);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <img src="/logo.png" alt="RoadVerdict" className={styles.logoImg} />
        <LogoutButton />
      </header>

      <main className={styles.main}>
        {!bike ? (
          <>
            <h1 className={styles.heading}>Add your bike</h1>
            <p className={styles.subtext}>
              Signed in as {session.email}. One bike per account for now - everything you
              log against it is tied to your account and ready wherever you sign in.
            </p>
            <AddBikeForm />
          </>
        ) : (
          <>
            <h1 className={styles.heading}>
              {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
            </h1>
            <p className={styles.subtext}>
              {bike.year} · {bike.engineCC}cc ({bike.bikeClass}) · {bike.currentMileage.toLocaleString()} miles
            </p>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Service history</h2>
              <p className={styles.cardBody}>
                No service records logged yet. Logging, fuel tracking, reminders, and
                everything else from the prototype lands here in the next build slices.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
