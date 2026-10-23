import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, Clock, CheckCircle, MessageSquare } from "lucide-react";

interface Stats {
  totalDocuments: number;
  activeCommitments: number;
  upcomingDeadlines: number;
  pendingDocuments: number;
}

interface AttentionItem {
  id: string;
  title: string;
  dueDate: string | null;
  urgency: "overdue" | "urgent" | "soon" | "upcoming";
  documentTitle?: string;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function urgencyColor(urgency: AttentionItem["urgency"]) {
  if (urgency === "overdue") return "destructive" as const;
  if (urgency === "urgent") return "warning" as const;
  if (urgency === "soon") return "info" as const;
  return "secondary" as const;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);

  useEffect(() => {
    api.get<{ stats: Stats; attention: AttentionItem[] }>("/dashboard")
      .then(({ stats, attention }) => {
        setStats(stats);
        setAttention(attention);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{greeting()}, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-muted-foreground mt-1">Here's what needs your attention today.</p>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={FileText} label="Total Documents" value={stats.totalDocuments} color="text-blue-600" />
          <StatCard icon={Clock} label="Active Commitments" value={stats.activeCommitments} color="text-green-600" />
          <StatCard icon={AlertTriangle} label="Upcoming Deadlines" value={stats.upcomingDeadlines} color="text-amber-600" />
          <StatCard icon={CheckCircle} label="Pending Review" value={stats.pendingDocuments} color="text-purple-600" />
        </div>
      )}

      {/* Attention feed */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Attention required</h2>
        {attention.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <CheckCircle className="mx-auto h-8 w-8 mb-2 text-green-500" />
              All caught up! No urgent items.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {attention.map((item) => (
              <Card key={item.id}>
                <CardContent className="py-4 flex items-start justify-between">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {item.documentTitle && (
                      <p className="text-sm text-muted-foreground mt-0.5">From: {item.documentTitle}</p>
                    )}
                    {item.dueDate && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Due: {new Date(item.dueDate).toLocaleDateString("en-IN")}
                      </p>
                    )}
                  </div>
                  <Badge variant={urgencyColor(item.urgency)} className="shrink-0 ml-4 capitalize">
                    {item.urgency}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/documents" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            <FileText className="h-4 w-4" /> Upload Document
          </Link>
          <Link to="/chat" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            <MessageSquare className="h-4 w-4" /> Ask LifeOps
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <span className="text-2xl font-bold">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}
