// Place at: src/app/api/cron/hard-delete-expired-accounts/route.ts
//
// The other half of the self-serve deletion flow (see userAccount.ts's
// requestAccountDeletion/cancelAccountDeletion and
// api/account/request-deletion) - this is the ONLY caller of
// deleteAccount() outside the admin panel, and only ever for an account
// whose grace period has genuinely passed. Idempotent: an account
// that's already been deleted no longer matches the query below, so
// re-running this is always safe.
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { deleteAccount } from "@/lib/tracker/userAccount";
import { sendAccountDeletedEmail } from "@/lib/resend";
import type { UserDoc } from "@/lib/tracker/userDoc";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const container = getContainer();
    const nowIso = new Date().toISOString();

    const { resources: expired } = await container.items
      .query<Pick<UserDoc, "email" | "pendingDeletionAt">>({
        query: "SELECT c.email, c.pendingDeletionAt FROM c WHERE c.type = 'user' AND IS_DEFINED(c.pendingDeletionAt) AND c.pendingDeletionAt <= @now",
        parameters: [{ name: "@now", value: nowIso }],
      })
      .fetchAll();

    let deleted = 0;
    const deletedEmails: string[] = [];
    const errors: { email: string; error: string }[] = [];

    for (const { email } of expired) {
      // Isolated per account: one failure shouldn't stop every other
      // genuinely-expired account in the same run from being deleted.
      try {
        await deleteAccount(email);
        try {
          await sendAccountDeletedEmail(email);
        } catch (err) {
          // The account is already gone at this point - a failed
          // notification is a real loss (the person never finds out),
          // but re-throwing here would be misleading: the deletion
          // itself did succeed, so this must not count as an error for
          // that account.
          console.error(`hard-delete-expired-accounts: deletion succeeded but confirmation email failed for ${email}:`, err);
        }
        deleted++;
        deletedEmails.push(email);
      } catch (err) {
        console.error(`hard-delete-expired-accounts: failed to delete ${email}:`, err);
        errors.push({ email, error: err instanceof Error ? err.message : String(err) });
      }
    }

    await container.items.upsert({
      id: "cronStatus::hardDeleteExpiredAccounts",
      pk: "system",
      type: "cronStatus",
      lastRunAt: nowIso,
      deleted,
    });

    return NextResponse.json({ ok: true, deleted, deletedEmails, ...(errors.length ? { errors } : {}) });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error running hard-delete-expired-accounts", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
