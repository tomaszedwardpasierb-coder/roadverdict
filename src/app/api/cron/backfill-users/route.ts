// Place at: src/app/api/cron/backfill-users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export const dynamic = "force-dynamic";

// Idempotent by design: re-running this is always safe. An email that
// already has a user document is skipped (the existence check below),
// so running this twice does nothing further for anyone already
// caught up.
//
// Exists because createSessionForEmail() in session.ts never actually
// created a user document for anyone, due to a bug fixed alongside
// this backfill - see the comment there. Session creation itself was
// never part of that bug, so every session document ever created
// remains a completely reliable record of who has genuinely signed in;
// this walks every distinct email that has one and creates the
// missing user document for it.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const container = getContainer();

    // Cross-partition - every session document that's ever existed,
    // regardless of account. Only ever run by hand from the admin
    // dashboard, never on a normal page load.
    const { resources: sessions } = await container.items
      .query<{ pk: string }>({ query: "SELECT c.pk FROM c WHERE c.type = 'session'" })
      .fetchAll();

    const distinctEmails = [...new Set(sessions.map((s) => s.pk))];

    let usersCreated = 0;
    let alreadyExisted = 0;
    const createdEmails: string[] = [];
    const errors: { email: string; error: string }[] = [];

    for (const email of distinctEmails) {
      // Isolated per email: one failed read/create shouldn't stop every
      // other already-caught-up-or-not email in the same run from being
      // checked.
      try {
        // Same check session.ts itself now uses correctly - .read() on a
        // non-existent item resolves with an empty resource rather than
        // throwing.
        const { resource: existingUser } = await container.item(email, email).read();
        if (existingUser) {
          alreadyExisted++;
          continue;
        }
        await container.items.create({
          id: email,
          pk: email,
          type: "user",
          email,
          createdAt: new Date().toISOString(),
        });
        usersCreated++;
        createdEmails.push(email);
      } catch (err) {
        console.error(`User backfill failed for ${email}:`, err);
        errors.push({ email, error: err instanceof Error ? err.message : String(err) });
      }
    }

    await container.items.upsert({
      id: "cronStatus::backfillUsers",
      pk: "system",
      type: "cronStatus",
      lastRunAt: new Date().toISOString(),
      usersCreated,
      alreadyExisted,
    });

    return NextResponse.json({
      ok: true, usersCreated, alreadyExisted, createdEmails,
      ...(errors.length ? { errors } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error running user backfill", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
