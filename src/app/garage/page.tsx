// Place at: src/app/garage/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { isPro } from "@/lib/subscriptions";
import { getBikesForUser, pickActiveBike, getCurrentRegistration, countActiveBikes, MAX_FREE_BIKES } from "@/lib/tracker/bike";
import LogoutButton from "@/app/dashboard/LogoutButton";
import dashboardStyles from "@/app/dashboard/dashboard.module.css";
import styles from "./garage.module.css";
import { BikeCard } from "./BikeCard";
import { AddAnotherBikeSection } from "./AddAnotherBikeSection";

export const dynamic = "force-dynamic";

export default async function GaragePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const bikes = await getBikesForUser(session.email);

  // No bike yet at all - that onboarding flow already lives on the
  // dashboard page, no need to duplicate it here.
  if (bikes.length === 0) redirect("/dashboard");

  const activeBike = await pickActiveBike(bikes);
  const userIsPro = await isPro(session.email);

  return (
    <main className={dashboardStyles.main}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <Link href="/dashboard" className={styles.backLink}>← Back to dashboard</Link>
        <LogoutButton />
      </div>

      <h1 className={dashboardStyles.heading}>Your bikes</h1>
      <p className={dashboardStyles.subtext} style={{ marginBottom: "1.3rem" }}>
        {userIsPro
          ? `${countActiveBikes(bikes)} bike${countActiveBikes(bikes) === 1 ? "" : "s"} tracked - no limit on Pro.`
          : `${countActiveBikes(bikes)} of ${MAX_FREE_BIKES} free bikes used.`}
      </p>

      <div className={styles.grid}>
        {bikes.map((bike) => (
          <BikeCard
            key={bike.id}
            bikeId={bike.id}
            name={bike.nickname ? `${bike.nickname} - ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
            year={bike.year}
            isCustomBuild={bike.isCustomBuild}
            currentMileage={bike.currentMileage}
            isActive={bike.id === activeBike?.id}
            currentRegistration={getCurrentRegistration(bike)}
            registrationChangeCount={bike.registrationChanges?.length ?? 0}
            transferredToEmail={bike.transferredTo?.newOwnerEmail}
            mayHavePriorHistory={bike.mayHavePriorHistory}
          />
        ))}
      </div>

      <AddAnotherBikeSection bikeCount={countActiveBikes(bikes)} maxFreeBikes={MAX_FREE_BIKES} isPro={userIsPro} key={bikes.length} />
    </main>
  );
}
