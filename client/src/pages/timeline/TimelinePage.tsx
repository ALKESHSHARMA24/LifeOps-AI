import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Commitment {
  id: string;
  title: string;
  dueDate: string | null;
  type: string;
  status: string;
  documentTitle?: string;
}

function urgency(dueDate: string | null) {
  if (!dueDate) return "upcoming";
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "upcoming";
}

const urgencyStyles: Record<string, string> = {
  overdue: "border-l-4 border-red-500",
  urgent: "border-l-4 border-amber-500",
  soon: "border-l-4 border-yellow-400",
  upcoming: "border-l-4 border-blue-400",
};

const urgencyBadge: Record<string, "destructive" | "warning" | "info" | "secondary"> = {
  overdue: "destructive",
  urgent: "warning",
  soon: "info",
  upcoming: "secondary",
};

export function TimelinePage() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);

  useEffect(() => {
    api.get<{ commitments: Commitment[] }>("/dashboard/timeline")
      .then(({ commitments }) => setCommitments(commitments))
      .catch(() => {});
  }, []);

  const active = commitments.filter((c) => c.status === "active" || c.status === "overdue");
  const completed = commitments.filter((c) => c.status === "completed" || c.status === "dismissed");

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Timeline</h1>
        <p className="text-muted-foreground mt-1">All your commitments and deadlines in one place</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Active ({active.length})</h2>
        {active.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Calendar className="mx-auto h-8 w-8 mb-2 opacity-30" />
              No active commitments
            </CardContent>
          </Card>
        ) : (
          active.map((c) => {
            const u = urgency(c.dueDate);
            return (
              <Card key={c.id} className={cn("overflow-hidden", urgencyStyles[u])}>
                <CardContent className="py-4 flex items-start justify-between">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    {c.documentTitle && (
                      <p className="text-sm text-muted-foreground mt-0.5">From: {c.documentTitle}</p>
                    )}
                    {c.dueDate && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Due: {new Date(c.dueDate).toLocaleDateString("en-IN", { dateStyle: "long" })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <Badge variant={urgencyBadge[u]} className="capitalize">{u}</Badge>
                    <Badge variant="outline" className="capitalize">{c.type}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">Completed / Dismissed ({completed.length})</h2>
          {completed.map((c) => (
            <Card key={c.id} className="opacity-60">
              <CardContent className="py-3 flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-sm">{c.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
