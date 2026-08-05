// Place at: src/app/report/[token]/ReportHistoryTable.tsx
import { isBackdated, backdateNotice } from "@/lib/tracker/backdateCheck";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import type { ReportRow } from "@/lib/tracker/sellerReportData";
import type { BikeDoc } from "@/lib/tracker/bike";
import styles from "./report.module.css";

function fmtMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ReportHistoryTable({
  rows,
  total,
  bike,
  token,
  backdatedCount,
  realTimeCount,
  receiptCount,
}: {
  rows: ReportRow[];
  total: number;
  bike: BikeDoc;
  token: string;
  backdatedCount: number;
  realTimeCount: number;
  receiptCount: number;
}) {
  if (rows.length === 0) {
    return <p>No service, modification, or bill history has been logged for this bike yet.</p>;
  }

  return (
    <>
      {(backdatedCount > 0 || receiptCount > 0) && (
        <p className={styles.backdateSummary}>
          {realTimeCount} of {rows.length} entries were logged close to when the work was done
          {backdatedCount > 0 && <> - {backdatedCount} {backdatedCount === 1 ? "was" : "were"} added later, see the notes below</>}.{" "}
          {receiptCount} of {rows.length} {receiptCount === 1 ? "has" : "have"} a receipt or invoice attached.
        </p>
      )}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Description</th>
            <th>Cost</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const backdated = isBackdated(r.date, r.createdAt);
            const notice = backdated ? backdateNotice(r.date, r.createdAt) : "";
            const isPrePurchase = r.category === "Modification" && isBeforeProduction(r.date, bike);
            const isImage = r.attachment?.fileType === "image/jpeg" || r.attachment?.fileType === "image/png";
            const attachmentUrl = r.attachment ? `/api/tracker/report-attachment/${token}/${encodeURIComponent(r.attachment.blobName)}` : null;
            return (
              <tr key={r.id}>
                <td>
                  {fmtDate(r.date)}
                  {isPrePurchase && (
                    <div className={styles.backdateNoteSoft}>Pre-purchase expense (bought before {bike.year})</div>
                  )}
                  {backdated && (
                    <div className={r.attachment ? styles.backdateNoteSoft : styles.backdateNote}>
                      {notice}
                      {r.attachment && " (receipt attached)"}
                    </div>
                  )}
                </td>
                <td>{r.category}</td>
                <td>{r.description}</td>
                <td>{fmtMoney(r.cost)}</td>
                <td>
                  {attachmentUrl ? (
                    <a href={attachmentUrl} target="_blank" rel="noopener" className={styles.receiptLink} title={r.attachment?.fileName}>
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachmentUrl} alt="" className={styles.receiptThumb} />
                      ) : (
                        <span className={styles.receiptThumbPdf}>PDF</span>
                      )}
                      <span className={styles.receiptLabel}>View</span>
                    </a>
                  ) : (
                    <span className={styles.noReceipt}>— none provided</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total logged spend</td>
            <td>{fmtMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
