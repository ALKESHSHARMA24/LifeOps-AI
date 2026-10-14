import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, Bell, MessageSquare, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getAttentionItems, getDashboardStats } from "@/modules/intelligence/attention.service";

const urgencyColors = {
  overdue: "border-red-200 bg-red-50 text-red-700",
  urgent: "border-orange-200 bg-orange-50 text-orange-700",
  soon: "border-yellow-200 bg-yellow-50 text-yellow-700",
  upcoming: "border-blue-200 bg-blue-50 text-blue-700",
};

const urgencyIcons = {
  overdue: AlertTriangle,
  urgent: AlertTriangle,
  soon: Clock,
  upcoming: Clock,
};

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  const [stats, attentionItems] = userId
    ? await Promise.all([getDashboardStats(userId), getAttentionItems(userId)])
    : [{ totalDocuments: 0, activeCommitments: 0, upcomingDeadlines: 0, pendingDocuments: 0 }, []];

  const hasAnything = stats.totalDocuments > 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          {attentionItems.length > 0
            ? `You have ${attentionItems.length} item${attentionItems.length > 1 ? "s" : ""} that need your attention.`
            : hasAnything
            ? "Everything looks good. Nothing urgent right now."
            : "Add your first document to get started."}
        </p>
      </div>

      {/* Attention feed */}
      <Card className={attentionItems.length > 0 ? "border-amber-200" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base">Attention required</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {attentionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasAnything
                ? "No urgent items. Check the timeline for upcoming deadlines."
                : "No documents uploaded yet. Add your first document to get started — LifeOps will automatically find deadlines, expiry dates, and commitments."}
            </p>
          ) : (
            <div className="space-y-2">
              {attentionItems.map((item) => {
                const Icon = urgencyIcons[item.urgency];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 hover:opacity-80 transition-opacity ${urgencyColors[item.urgency]}`}
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs opacity-80 mt-0.5">{item.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Your library</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Documents", value: stats.totalDocuments, href: "/documents" },
            { label: "Active commitments", value: stats.activeCommitments, href: "/timeline" },
            { label: "Upcoming deadlines", value: stats.upcomingDeadlines, href: "/timeline" },
            {
              label: stats.pendingDocuments > 0 ? "Pending review" : "All confirmed",
              value: stats.pendingDocuments > 0 ? stats.pendingDocuments : stats.totalDocuments,
              href: "/documents",
              highlight: stats.pendingDocuments > 0,
            },
          ].map(({ label, value, href, highlight }) => (
            <Link key={label} href={href}>
              <Card className={`hover:shadow-md transition-shadow ${highlight ? "border-yellow-300" : ""}`}>
                <CardContent className="p-6">
                  <p className="text-3xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              href: "/documents",
              icon: FileText,
              title: "Upload a document",
              description: "Add insurance, warranty, bill, or any life document",
              color: "text-blue-500",
              bg: "bg-blue-50",
            },
            {
              href: "/timeline",
              icon: Clock,
              title: "View timeline",
              description: "See what's coming up — deadlines, renewals, payments",
              color: "text-amber-500",
              bg: "bg-amber-50",
            },
            {
              href: "/chat",
              icon: MessageSquare,
              title: "Ask LifeOps",
              description: "Chat with your documents — ask anything",
              color: "text-green-500",
              bg: "bg-green-50",
            },
          ].map(({ href, icon: Icon, title, description, color, bg }) => (
            <Link key={href} href={href}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-6">
                  <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center mb-4`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
