import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { db } from "../../src/db";
import { reminders } from "../../src/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// GET /api/reminders — list all reminders for the user
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, req.user!.id))
    .orderBy(desc(reminders.remindAt));
  res.json({ reminders: rows });
});

// POST /api/reminders — manually create a reminder
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { title, remindAt } = req.body as { title?: string; remindAt?: string };

  if (!title?.trim() || !remindAt) {
    res.status(400).json({ error: "title and remindAt are required" });
    return;
  }

  const date = new Date(remindAt);
  if (isNaN(date.getTime())) {
    res.status(400).json({ error: "remindAt must be a valid ISO date string" });
    return;
  }

  const [reminder] = await db
    .insert(reminders)
    .values({ userId: req.user!.id, title: title.trim(), remindAt: date, createdByAi: false })
    .returning();

  res.status(201).json({ reminder });
});

// PATCH /api/reminders/:id/dismiss — mark as dismissed
router.patch("/:id/dismiss", requireAuth, async (req: Request, res: Response) => {
  const [updated] = await db
    .update(reminders)
    .set({ status: "dismissed" })
    .where(and(eq(reminders.id, req.params.id), eq(reminders.userId, req.user!.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  res.json({ reminder: updated });
});

// DELETE /api/reminders/:id — delete a reminder
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const [deleted] = await db
    .delete(reminders)
    .where(and(eq(reminders.id, req.params.id), eq(reminders.userId, req.user!.id)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  res.json({ success: true });
});

// GET /api/reminders/due — reminders that fired since last check (status = sent)
router.get("/due", requireAuth, async (req: Request, res: Response) => {
  const due = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, req.user!.id), eq(reminders.status, "sent")));
  res.json({ reminders: due });
});

export default router;
