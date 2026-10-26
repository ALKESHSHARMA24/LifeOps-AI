import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Plus, Trash2, Check, Loader2, AlertCircle, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Reminder {
  id: string;
  title: string;
  remindAt: string;
  status: "pending" | "sent" | "dismissed";
  createdByAi: boolean;
  createdAt: string;
}

const statusMeta: Record<Reminder["status"], { label: string; color: string }> = {
  pending:   { label: "Scheduled",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  sent:      { label: "Due now!",   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  dismissed: { label: "Dismissed",  color: "bg-muted text-muted-foreground" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New reminder form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchReminders = () => {
    api.get<{ reminders: Reminder[] }>("/reminders")
      .then(({ reminders }) => setReminders(reminders))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load reminders"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !remindAt) { setFormError("Both fields are required."); return; }
    setFormError("");
    setSaving(true);
    try {
      await api.post("/reminders", { title: title.trim(), remindAt: new Date(remindAt).toISOString() });
      setTitle("");
      setRemindAt("");
      setShowForm(false);
      fetchReminders();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create reminder");
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      const { reminder } = await api.patch<{ reminder: Reminder }>(`/reminders/${id}/dismiss`);
      setReminders((prev) => prev.map((r) => (r.id === id ? reminder : r)));
    } catch { /* silently ignore */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/reminders/${id}`);
    } catch { /* ignore */ }
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const pending   = reminders.filter((r) => r.status === "pending");
  const due       = reminders.filter((r) => r.status === "sent");
  const dismissed = reminders.filter((r) => r.status === "dismissed");

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reminders</h1>
          <p className="text-muted-foreground mt-1">Scheduled alerts for your documents and deadlines</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-2" /> New Reminder
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Renew car insurance"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Remind at</label>
                <Input
                  type="datetime-local"
                  value={remindAt}
                  onChange={(e) => setRemindAt(e.target.value)}
                />
              </div>
              {formError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> {formError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
                  Save Reminder
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setFormError(""); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reminders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BellOff className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No reminders yet</p>
            <p className="text-muted-foreground mt-1">Create one above or ask the AI in Chat to set one for you</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Due now */}
          {due.length > 0 && (
            <Section title="Due Now" count={due.length} highlight>
              {due.map((r) => (
                <ReminderRow key={r.id} r={r} onDismiss={handleDismiss} onDelete={handleDelete} />
              ))}
            </Section>
          )}

          {/* Upcoming */}
          {pending.length > 0 && (
            <Section title="Upcoming" count={pending.length}>
              {pending.map((r) => (
                <ReminderRow key={r.id} r={r} onDismiss={handleDismiss} onDelete={handleDelete} />
              ))}
            </Section>
          )}

          {/* Dismissed */}
          {dismissed.length > 0 && (
            <Section title="Dismissed" count={dismissed.length} muted>
              {dismissed.map((r) => (
                <ReminderRow key={r.id} r={r} onDismiss={handleDismiss} onDelete={handleDelete} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children, highlight, muted }: {
  title: string; count: number; children: React.ReactNode; highlight?: boolean; muted?: boolean;
}) {
  return (
    <div>
      <h2 className={cn("text-sm font-semibold mb-3", highlight ? "text-amber-600" : muted ? "text-muted-foreground" : "")}>
        {title} <span className="font-normal opacity-60">({count})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReminderRow({ r, onDismiss, onDelete }: {
  r: Reminder;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = statusMeta[r.status];
  return (
    <Card className={cn(r.status === "dismissed" && "opacity-50")}>
      <CardContent className="py-3 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Bell className={cn("h-4 w-4 mt-0.5 shrink-0", r.status === "sent" ? "text-amber-500" : "text-muted-foreground")} />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{r.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(r.remindAt)}</p>
            {r.createdByAi && <p className="text-xs text-muted-foreground opacity-60 mt-0.5">Created by AI</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", meta.color)}>{meta.label}</span>
          {r.status !== "dismissed" && (
            <Button variant="ghost" size="icon" onClick={() => onDismiss(r.id)} title="Mark as dismissed">
              <Check className="h-4 w-4 text-green-600" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} title="Delete reminder">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
