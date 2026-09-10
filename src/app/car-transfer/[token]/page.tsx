// Place at: src/app/car-transfer/[token]/page.tsx
// Car mirror of bike-transfer/[token]/page.tsx.
import { getCarTransferRequestByToken } from "@/lib/tracker/carTransferRequest";
import { getSession } from "@/lib/auth/session";
import { CarAcceptDeclineForm } from "./CarAcceptDeclineForm";
import styles from "../../report/[token]/report.module.css";

export const dynamic = "force-dynamic";

function formatCarName(summary: { make: string; model: string; year?: number; isCustomBuild: boolean }): string {
  const prefix = summary.isCustomBuild ? "Custom build" : summary.year ? String(summary.year) : "";
  return `${prefix} ${summary.make} ${summary.model}`.trim();
}

export default async function CarTransferOfferPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const doc = await getCarTransferRequestByToken(params.token);
  if (!doc) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>This offer is no longer available</h1>
        <p className={styles.subtext}>It may have already been accepted or declined, or the link has expired.</p>
      </div>
    );
  }

  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("Car transfer offer page: getSession() failed, continuing as signed out:", err);
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>You&apos;ve been offered a car&apos;s RoadVerdict record</h1>
      <p className={styles.subtext}>
        <strong>{doc.ownerEmail}</strong> wants to hand you the tracking record for their{" "}
        <strong>{formatCarName(doc.carSummary)}</strong> - its logged service history, mileage, and documentation,
        continuing under your account rather than starting fresh.
      </p>
      <CarAcceptDeclineForm
        token={params.token}
        status={doc.status}
        recipientEmail={doc.recipientEmail}
        signedInEmail={session?.email ?? null}
      />
    </div>
  );
}
