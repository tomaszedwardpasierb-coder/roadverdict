// Place at: src/app/car-report/[token]/page.tsx
// Car mirror of report/[token]/page.tsx - the free, default view.
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveCarShareToken } from "@/lib/tracker/carShareLink";
import { getCarSellerReportData } from "@/lib/tracker/carSellerReportData";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { CarPlateGate } from "./CarPlateGate";
import { CarReportHistoryTable } from "./CarReportHistoryTable";
import styles from "./report.module.css";
import { PrintButton } from "@/app/report/[token]/PrintButton";
import type { CarDoc } from "@/lib/tracker/car";

export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function engineDescription(car: CarDoc): string {
  if (car.fuelType === "electric") {
    return car.batteryKwh ? `Electric, ${car.batteryKwh}kWh battery` : "Electric";
  }
  const litres = car.engineLitres ? `${car.engineLitres}L` : "Unknown size";
  return car.fuelType === "hybrid" || car.fuelType === "phev" ? `${litres} hybrid` : litres;
}

export default async function CarSaleReportPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  if (!(await resolveCarShareToken(params.token))) notFound();

  const verified = await hasReportAccess(params.token);
  if (!verified) return <CarPlateGate token={params.token} />;

  const data = await getCarSellerReportData(params.token);
  const { car, rows, total, clusters, backdatedCount, realTimeCount, receiptCount, currentRegistration, registrationChangesCount, originalRegistration, mostRecentChangeDate, daysSinceLastChange, dateAdded } = data;

  return (
    <div className={styles.wrapper}>
      <div className={styles.noPrint} style={{ marginBottom: "1.2rem" }}>
        <PrintButton />
      </div>
      <h1 className={styles.title}>
        {car.nickname ? `${car.nickname} - ${car.make} ${car.model}` : `${car.make} ${car.model}`}
      </h1>
      <p className={styles.subtext}>
        {car.isCustomBuild ? "Custom build" : car.year} · {engineDescription(car)} · {car.currentMileage.toLocaleString()} miles
      </p>

      <div className={styles.upsellBlock}>
        <div>
          <p className={styles.upsellTitle}>What story does this data tell?</p>
          <p className={styles.upsellText}>
            A full breakdown of what&apos;s in this history, item by item, what&apos;s well supported and what
            isn&apos;t, and specific questions worth asking the seller - all drawn from the same records below.
          </p>
        </div>
        <Link href={`/car-report/${params.token}/detailed`} className="btn-primary" style={{ textDecoration: "none", flexShrink: 0 }}>
          Get the Buyer Verdict Report
        </Link>
      </div>

      <div className={styles.registrationBlock}>
        {currentRegistration ? (
          <>
            <p>
              {registrationChangesCount === 0 ? (
                <>Registered as <strong>{currentRegistration}</strong> since being added to RoadVerdict on {fmtDate(dateAdded)}.</>
              ) : (
                <>
                  Originally registered as <strong>{originalRegistration}</strong> (added to RoadVerdict {fmtDate(dateAdded)}),
                  currently <strong>{currentRegistration}</strong> (since {fmtDate(mostRecentChangeDate!)}).
                </>
              )}
            </p>
            {registrationChangesCount >= 2 && (
              <p className={styles.registrationNote}>
                This car&apos;s registration has been changed {registrationChangesCount} times since being added to RoadVerdict.
              </p>
            )}
            {daysSinceLastChange !== null && daysSinceLastChange <= 30 && (
              <p className={styles.registrationWarning}>
                ⚠️ Registration changed to {currentRegistration} on {fmtDate(mostRecentChangeDate!)} - just {daysSinceLastChange}{" "}
                day{daysSinceLastChange === 1 ? "" : "s"} before this report was generated.
              </p>
            )}
            {car.dvlaData?.dvlaCurrentVrm &&
              car.dvlaData.dvlaCurrentVrm.replace(/\s+/g, "") !== currentRegistration?.replace(/\s+/g, "") && (
                <p className={styles.registrationWarning}>
                  ⚠️ DVLA had this vehicle&apos;s current registration as <strong>{car.dvlaData.dvlaCurrentVrm}</strong> as
                  of {fmtDate(car.dvlaData.fetchedAt)} - different from what&apos;s shown above. Worth asking the
                  seller about this directly.
                </p>
              )}
          </>
        ) : (
          <p className={styles.registrationNote}>No registration number is on record for this car.</p>
        )}
      </div>

      {clusters.length > 0 && (
        <div className={styles.clusterWarning}>
          {clusters.map((c, i) => (
            <p key={i}>
              ⚠️ {c.count} entries - covering {fmtDate(c.earliestClaimedDate)} to {fmtDate(c.latestClaimedDate)}, {c.spanDays} days
              of claimed history - were all logged on RoadVerdict within the same hour, on {fmtDate(c.loggedAt)}. Worth asking the
              seller about this.
            </p>
          ))}
        </div>
      )}

      <CarReportHistoryTable
        rows={rows}
        total={total}
        car={car}
        token={params.token}
        backdatedCount={backdatedCount}
        realTimeCount={realTimeCount}
        receiptCount={receiptCount}
        entryRequestStatus={data.entryRequestStatus}
      />

      <p className={styles.caveat}>
        This history is self-reported by the car&apos;s owner and has not been independently verified against DVSA
        MOT records. &quot;Logged after the claimed date&quot; notes reflect when an entry was actually added to
        RoadVerdict, compared with the date the owner said the work was done - a gap here isn&apos;t necessarily
        dishonest (people digitise old paper receipts all the time), but it&apos;s a fact worth knowing before you
        rely on this history. Fuel spend is not included, since it isn&apos;t relevant to a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
