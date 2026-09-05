// Place at: src/app/report/receipt-request/decide/page.tsx
import { getReceiptRequestByDecisionToken } from "@/lib/tracker/receiptRequest";
import { DecideRequestForm } from "./DecideRequestForm";
import styles from "../../[token]/report.module.css";

export const dynamic = "force-dynamic";

export default async function DecideReceiptRequestPage(
  props: {
    searchParams: Promise<{ token?: string; action?: string; scope?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const token = searchParams.token;
  if (!token) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>Link missing</h1>
        <p className={styles.subtext}>This link is incomplete. Please use the link from your email directly.</p>
      </div>
    );
  }

  const request = await getReceiptRequestByDecisionToken(token);
  if (!request) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.title}>This request is no longer available</h1>
        <p className={styles.subtext}>It may have already been decided, or the link has expired.</p>
      </div>
    );
  }

  const preselectAll = searchParams.action === "approve" || searchParams.action === "decline" ? searchParams.action : null;

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Receipt request</h1>
      <p className={styles.subtext}>
        Someone viewing your shared report has asked to see the receipts/invoices for the entries below. Nothing is
        shared until you confirm.
      </p>
      <DecideRequestForm
        token={token}
        items={request.items}
        buyerMessage={request.buyerMessage}
        preselectAll={preselectAll}
      />
    </div>
  );
}
