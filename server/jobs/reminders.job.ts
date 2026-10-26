import { db } from "../../src/db";
import { reminders } from "../../src/db/schema";
import { eq, and, lte } from "drizzle-orm";

// Runs every 60 seconds. Marks any pending reminders whose remindAt has passed as "sent".
// The frontend polls /api/reminders/due and shows a toast for each "sent" reminder,
// then the user dismisses it (which sets status → "dismissed").

export function startReminderJob() {
  const tick = async () => {
    try {
      const now = new Date();
      await db
        .update(reminders)
        .set({ status: "sent" })
        .where(and(eq(reminders.status, "pending"), lte(reminders.remindAt, now)));
    } catch (err) {
      console.error("[reminder-job] tick failed:", err);
    }
  };

  // Run immediately on startup, then every 60 s
  tick();
  const interval = setInterval(tick, 60_000);
  console.log("[reminder-job] started — checking every 60s");
  return interval;
}
