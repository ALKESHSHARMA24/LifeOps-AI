/**
 * Attention Service — Phase 5
 *
 * Computes "what needs your attention right now" purely from DB data.
 * No AI call needed — urgency is calculated from dates and statuses.
 */

import { eq, and, lte, gte, desc, or, asc, ne } from "drizzle-orm";
import { db } from "@/db";
import { commitments, documents, reminders } from "@/db/schema";

export type UrgencyLevel = "overdue" | "urgent" | "soon" | "upcoming";

export interface AttentionItem {
  id: string;
  title: string;
  description: string;
  urgency: UrgencyLevel;
  dueDate?: Date | null;
  type: "commitment" | "document" | "reminder";
  href: string;
}

export interface DashboardStats {
  totalDocuments: number;
  activeCommitments: number;
  upcomingDeadlines: number; // next 30 days
  pendingDocuments: number;  // uploaded/extracted but not confirmed
}

/**
 * Get the items that need attention right now.
 * Returns up to 5 items sorted by urgency.
 */
export async function getAttentionItems(userId: string): Promise<AttentionItem[]> {
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const items: AttentionItem[] = [];

  // 1. Overdue commitments
  const overdue = await db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, userId),
        eq(commitments.status, "active"),
        lte(commitments.dueDate, now)
      )
    )
    .limit(3);

  for (const c of overdue) {
    items.push({
      id: c.id,
      title: c.title,
      description: `Overdue since ${formatDate(c.dueDate)}`,
      urgency: "overdue",
      dueDate: c.dueDate,
      type: "commitment",
      href: "/timeline",
    });
  }

  // 2. Urgent — due within 7 days
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const urgent = await db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, userId),
        eq(commitments.status, "active"),
        gte(commitments.dueDate, now),
        lte(commitments.dueDate, in7Days)
      )
    )
    .limit(3);

  for (const c of urgent) {
    items.push({
      id: c.id,
      title: c.title,
      description: `Due ${formatDate(c.dueDate)}`,
      urgency: "urgent",
      dueDate: c.dueDate,
      type: "commitment",
      href: "/timeline",
    });
  }

  // 3. Unconfirmed documents (uploaded or extracted, waiting for user)
  const unconfirmed = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.userId, userId),
        or(eq(documents.status, "extracted"), eq(documents.status, "uploaded"))
      )
    )
    .orderBy(desc(documents.createdAt))
    .limit(2);

  for (const doc of unconfirmed) {
    const isExtracted = doc.status === "extracted";
    items.push({
      id: doc.id,
      title: doc.title ?? doc.originalFilename,
      description: isExtracted
        ? "AI extraction ready — review and confirm"
        : "Uploaded but not yet processed",
      urgency: "soon",
      type: "document",
      href: `/documents/${doc.id}`,
    });
  }

  // 4. Upcoming — due within 14 days (if we have room)
  if (items.length < 5) {
    const upcoming = await db
      .select()
      .from(commitments)
      .where(
        and(
          eq(commitments.userId, userId),
          eq(commitments.status, "active"),
          gte(commitments.dueDate, in7Days),
          lte(commitments.dueDate, in14Days)
        )
      )
      .limit(5 - items.length);

    for (const c of upcoming) {
      items.push({
        id: c.id,
        title: c.title,
        description: `Due ${formatDate(c.dueDate)}`,
        urgency: "upcoming",
        dueDate: c.dueDate,
        type: "commitment",
        href: "/timeline",
      });
    }
  }

  // Sort: overdue → urgent → soon → upcoming, then by due date
  const urgencyOrder: Record<UrgencyLevel, number> = { overdue: 0, urgent: 1, soon: 2, upcoming: 3 };
  return items
    .sort((a, b) => {
      const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (uDiff !== 0) return uDiff;
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      return 0;
    })
    .slice(0, 5);
}

/**
 * Get all commitments sorted by due date for the timeline page.
 */
export async function getTimelineCommitments(userId: string) {
  const rows = await db
    .select()
    .from(commitments)
    .where(eq(commitments.userId, userId))
    .orderBy(asc(commitments.dueDate));

  return rows;
}

/**
 * Stats for the dashboard overview cards.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [allDocs, activeComm, upcoming, pending] = await Promise.all([
    db.select({ id: documents.id }).from(documents).where(
      and(eq(documents.userId, userId), ne(documents.status, "error"))
    ),
    db
      .select({ id: commitments.id })
      .from(commitments)
      .where(and(eq(commitments.userId, userId), eq(commitments.status, "active"))),
    db
      .select({ id: commitments.id })
      .from(commitments)
      .where(
        and(
          eq(commitments.userId, userId),
          eq(commitments.status, "active"),
          gte(commitments.dueDate, now),
          lte(commitments.dueDate, in30Days)
        )
      ),
    db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          or(eq(documents.status, "uploaded"), eq(documents.status, "extracted"))
        )
      ),
  ]);

  return {
    totalDocuments: allDocs.length,
    activeCommitments: activeComm.length,
    upcomingDeadlines: upcoming.length,
    pendingDocuments: pending.length,
  };
}

function formatDate(date: Date | string | null): string {
  if (!date) return "unknown date";
  return new Date(date).toLocaleDateString("en-IN", { dateStyle: "medium" });
}
