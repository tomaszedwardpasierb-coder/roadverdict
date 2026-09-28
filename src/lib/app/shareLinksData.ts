// Place at: src/lib/app/shareLinksData.ts
//
// The Android app's Shareable links for one of the signed-in owner's
// vehicles: the links made for it, as the web's Shareable Links tab
// lists them (ShareLinksList), and buyers' requests to see receipts
// that still need a decision (ShareLinksSection's RequestCard). Making
// a link and every per-link action - extend, asking price, email,
// delete, deciding on a request - go through the web's own routes, so
// this only reads. The vehicle is looked up inside the signed-in
// account's own partition first, so an id belonging to anyone else
// simply isn't found.
import { getBike } from "@/lib/tracker/bike";
import { getCarById } from "@/lib/tracker/car";
import type { VehicleKind } from "@/lib/tracker/activeVehicle";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";
import { getShareLinksForUser } from "@/lib/tracker/shareLink";
import { getCarShareLinksForUser } from "@/lib/tracker/carShareLink";
import { getPendingReceiptRequestsForOwner } from "@/lib/tracker/receiptRequest";
import { getPendingCarReceiptRequestsForOwner } from "@/lib/tracker/carReceiptRequest";

export type AppShareLink = {
  token: string;
  url: string;
  recipientEmail: string | null;
  // Always pounds - the web asks for and shows it in £ whatever the
  // account's display currency.
  askingPrice: number | null;
  createdAt: string;
  // null only for a link made before links expired - it never does.
  expiresAt: string | null;
  expired: boolean;
};

export type AppReceiptRequest = {
  id: string;
  buyerEmail: string | null;
  buyerMessage: string | null;
  createdAt: string;
  items: {
    entryId: string;
    description: string;
    status: "pending" | "approved" | "declined";
    reason: string | null;
    // An earlier request for this same entry the owner said no to.
    priorDecline: { decidedAt: string; reason: string | null } | null;
    attachment: { fileName: string; fileType: Attachment["fileType"]; path: string } | null;
  }[];
};

export type ShareLinksData = { links: AppShareLink[]; requests: AppReceiptRequest[] };

// The fields both vehicles' link and request documents share.
type LinkDoc = { id: string; recipientEmail?: string; askingPrice?: number; createdAt: string; expiresAt?: string };
type RequestView = {
  id: string;
  buyerEmail?: string;
  buyerMessage?: string;
  createdAt: string;
  items: {
    entryId: string;
    description: string;
    status: "pending" | "approved" | "declined";
    reason?: string;
    priorDecline?: { decidedAt: string; reason?: string };
    attachment?: Attachment;
  }[];
};

function toLink(link: LinkDoc, reportPath: string, now: number): AppShareLink {
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  return {
    token: link.id,
    url: `${appUrl}/${reportPath}/${link.id}`,
    recipientEmail: link.recipientEmail ?? null,
    askingPrice: link.askingPrice ?? null,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt ?? null,
    expired: link.expiresAt ? new Date(link.expiresAt).getTime() < now : false,
  };
}

function toRequest(request: RequestView): AppReceiptRequest {
  return {
    id: request.id,
    buyerEmail: request.buyerEmail ?? null,
    buyerMessage: request.buyerMessage ?? null,
    createdAt: request.createdAt,
    items: request.items.map((item) => ({
      entryId: item.entryId,
      description: item.description,
      status: item.status,
      reason: item.reason ?? null,
      priorDecline: item.priorDecline ? { decidedAt: item.priorDecline.decidedAt, reason: item.priorDecline.reason ?? null } : null,
      // The same signed-in route the app's logbook opens receipts from.
      attachment: item.attachment
        ? { fileName: item.attachment.fileName, fileType: item.attachment.fileType, path: `/api/tracker/attachment/${encodeURIComponent(item.attachment.blobName)}` }
        : null,
    })),
  };
}

function newestFirst(a: { createdAt: string }, b: { createdAt: string }): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export async function getShareLinks(email: string, kind: VehicleKind, id: string): Promise<ShareLinksData | null> {
  const now = Date.now();
  if (kind === "bike") {
    if (!(await getBike(email, id))) return null;
    const [links, requests] = await Promise.all([getShareLinksForUser(email), getPendingReceiptRequestsForOwner(email)]);
    return {
      links: links.filter((l) => l.bikeId === id).map((l) => toLink(l, "report", now)),
      requests: requests.filter((r) => r.bikeId === id).map(toRequest).sort(newestFirst),
    };
  }
  if (!(await getCarById(email, id))) return null;
  const [links, requests] = await Promise.all([getCarShareLinksForUser(email), getPendingCarReceiptRequestsForOwner(email)]);
  return {
    links: links.filter((l) => l.carId === id).map((l) => toLink(l, "car-report", now)),
    requests: requests.filter((r) => r.carId === id).map(toRequest).sort(newestFirst),
  };
}
