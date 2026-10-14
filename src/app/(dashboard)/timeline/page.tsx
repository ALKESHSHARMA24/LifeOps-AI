import { Metadata } from "next";
import { auth } from "@/auth";
import Link from "next/link";
import { getTimelineCommitments } from "@/modules/intelligence/attention.service";
import { Clock, AlertCircle, CheckCircle2, Calendar } from "lucide-react";

export const metadata: Metadata = { title: "Timeline — LifeOps" };

function getUrgencyStyle(dueDate: Date | string | null, status: string) {
  if (status === "overdue" || status === "completed" || status === "dismissed") {
    return status === "completed"
      ? { badge: "bg-green-100 text-green-700", row: "opacity-60" }
      : status === "overdue"
      ? { badge: "bg-red-100 text-red-700", row: "" }
      : { badge: "bg-gray-100 text-gray-500", row: "opacity-50" };
  }

  if (!dueDate) return { badge: "bg-gray-100 text-gray-600", row: "" };

  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { badge: "bg-red-100 text-red-700", row: "bg-red-50/30" };
  if (diffDays <= 7) return { badge: "bg-orange-100 text-orange-700", row: "bg-orange-50/30" };
  if (diffDays <= 30) return { badge: "bg-yellow-100 text-yellow-700", row: "" };
  return { badge: "bg-blue-100 text-blue-700", row: "" };
}

function formatDueLabel(dueDate: Date | string | null): string {
  if (!dueDate) return "No due date";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 30) return `Due in ${diffDays} days`;
  return due.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export default async function TimelinePage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const allCommitments = await getTimelineCommitments(session.user.id);
  const active = allCommitments.filter((c) => c.status === "active");
  const others = allCommitments.filter((c) => c.status !== "active");

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Timeline</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All your deadlines, renewals, and recurring payments in one place.
        </p>
      </div>

      {/* Active commitments */}
      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No active commitments yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Confirm a document to automatically extract deadlines and due dates.
          </p>
          <Link href="/documents" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Upload a document →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((c) => {
            const { badge, row } = getUrgencyStyle(c.dueDate, c.status);
            return (
              <div
                key={c.id}
                className={`rounded-lg border bg-white p-4 flex items-center gap-4 ${row}`}
              >
                <div className="shrink-0">
                  <Clock className="h-4 w-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  {c.description && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{c.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}`}>
                    {formatDueLabel(c.dueDate)}
                  </span>
                  {c.amount && (
                    <p className="text-xs text-gray-500">
                      ₹{Number(c.amount).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed / dismissed */}
      {others.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-2">Completed &amp; dismissed</h2>
          <div className="space-y-1">
            {others.map((c) => (
              <div key={c.id} className="rounded-lg border bg-white/50 p-3 flex items-center gap-3 opacity-60">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-sm text-gray-600 flex-1 truncate">{c.title}</p>
                <span className="text-xs text-gray-400 capitalize">{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
