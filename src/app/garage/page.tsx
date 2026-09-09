// Place at: src/app/garage/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { isPro } from "@/lib/subscriptions";
import { getBikesForUser, getCurrentRegistration, countActiveBikes, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarsForUser, getCurrentRegistration as getCarCurrentRegistration, countActiveCars, isCarReadOnly } from "@/lib/tracker/car";
import { resolveActiveVehicle } from "@/lib/tracker/activeVehicle";
import { MAX_FREE_VEHICLES } from "@/lib/tracker/vehicleLimit";
import LogoutButton from "@/app/dashboard/LogoutButton";
import dashboardStyles from "@/app/dashboard/dashboard.module.css";
import styles from "./garage.module.css";
import { BikeCard } from "./BikeCard";
import { CarCard } from "./CarCard";
import { AddAnotherVehicleSection } from "./AddAnotherVehicleSection";

export const dynamic = "force-dynamic";

export default async function GaragePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [bikes, cars, activeVehicle] = await Promise.all([
    getBikesForUser(session.email),
    getCarsForUser(session.email),
    resolveActiveVehicle(session.email),
  ]);

  // No vehicle yet at all - that onboarding flow already lives on the
  // dashboard page, no need to duplicate it here.
  if (bikes.length === 0 && cars.length === 0) redirect("/dashboard");

  const userIsPro = await isPro(session.email);
  const activeBikeCount = countActiveBikes(bikes);
  const activeCarCount = countActiveCars(cars);
  const vehicleCount = activeBikeCount + activeCarCount;
  const comparableCount = bikes.filter((b) => !isBikeReadOnly(b)).length + cars.filter((c) => !isCarReadOnly(c)).length;

  return (
    <main className={dashboardStyles.main}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <Link href="/dashboard" className={styles.backLink}>← Back to dashboard</Link>
        <LogoutButton />
      </div>

      <h1 className={dashboardStyles.heading}>Your garage</h1>
      <p className={dashboardStyles.subtext} style={{ marginBottom: "1.3rem" }}>
        {userIsPro
          ? `${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"} tracked - no limit on Pro.`
          : `${vehicleCount} of ${MAX_FREE_VEHICLES} free vehicles used.`}
      </p>

      {comparableCount >= 2 && (
        <p style={{ marginBottom: "1.3rem" }}>
          <Link href="/garage/compare" className="submit-button" style={{ textDecoration: "none", display: "inline-block" }}>
            Compare vehicles
          </Link>
        </p>
      )}

      <div className={styles.grid}>
        {bikes.map((bike) => (
          <BikeCard
            key={bike.id}
            bikeId={bike.id}
            name={bike.nickname ? `${bike.nickname} - ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
            year={bike.year}
            isCustomBuild={bike.isCustomBuild}
            currentMileage={bike.currentMileage}
            isActive={activeVehicle?.kind === "bike" && bike.id === activeVehicle.bike.id}
            currentRegistration={getCurrentRegistration(bike)}
            registrationChangeCount={bike.registrationChanges?.length ?? 0}
            transferredToEmail={bike.transferredTo?.newOwnerEmail}
            mayHavePriorHistory={bike.mayHavePriorHistory}
          />
        ))}
        {cars.map((car) => (
          <CarCard
            key={car.id}
            carId={car.id}
            name={car.nickname ? `${car.nickname} - ${car.make} ${car.model}` : `${car.make} ${car.model}`}
            year={car.year}
            isCustomBuild={car.isCustomBuild}
            currentMileage={car.currentMileage}
            isActive={activeVehicle?.kind === "car" && car.id === activeVehicle.car.id}
            currentRegistration={getCarCurrentRegistration(car)}
            transferredToEmail={car.transferredTo?.newOwnerEmail}
          />
        ))}
      </div>

      <AddAnotherVehicleSection vehicleCount={vehicleCount} maxFreeVehicles={MAX_FREE_VEHICLES} isPro={userIsPro} key={`${bikes.length}-${cars.length}`} />
    </main>
  );
}
