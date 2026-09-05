// Place at: src/app/bike-transfer/[token]/page.tsx
import { getBikeTransferRequestByToken } from "@/lib/tracker/bikeTransferRequest";
import { getSession } from "@/lib/auth/session";
import { AcceptDeclineForm } from "./AcceptDeclineForm";
import styles from "../../report/[token]/report.module.css";

export const dynamic = "force-dynamic";

function formatBikeName(summary: { make: string; model: string; year?: number; isCustomBuild: boolean }): string {
  const prefix = summary.isCustomBuild ? "Custom build" : summary.year ? String(summary.year) : "";
  return `${prefix} ${summary.make} ${summary.model}`.trim();
}

export default async function BikeTransferOfferPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const doc = await getBikeTransferRequestByToken(params.token);
  if (!doc) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>This offer is no longer available</h1>
        <p className={styles.subtext}>It may have already been accepted or declined, or the link has expired.</p>
      </div>
    );
  }

  // Session checked here, server-side, but never used to gate viewing
  // the offer itself - only to tell the client component which call to
  // action to show. Actually accepting still goes through its own
  // server-side check in the accept route; this is just for the UI.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("Bike transfer offer page: getSession() failed, continuing as signed out:", err);
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>You&apos;ve been offered a bike&apos;s RoadVerdict record</h1>
      <p className={styles.subtext}>
        <strong>{doc.ownerEmail}</strong> wants to hand you the tracking record for their{" "}
        <strong>{formatBikeName(doc.bikeSummary)}</strong> - its logged service history, mileage, and documentation,
        continuing under your account rather than starting fresh.
      </p>
      <AcceptDeclineForm
        token={params.token}
        status={doc.status}
        recipientEmail={doc.recipientEmail}
        signedInEmail={session?.email ?? null}
      />
    </div>
  );
}
