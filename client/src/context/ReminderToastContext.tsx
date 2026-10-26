/**
 * Polls /api/reminders/due every 60 s.
 * When the server marks a reminder "sent", we show a floating toast.
 * Dismissing the toast calls PATCH /api/reminders/:id/dismiss on the server.
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DueReminder { id: string; title: string; remindAt: string }

const ReminderToastContext = createContext<null>(null);

export function ReminderToastProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<DueReminder[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      try {
        const { reminders } = await api.get<{ reminders: DueReminder[] }>("/reminders/due");
        const fresh = reminders.filter((r) => !seenIds.current.has(r.id));
        if (fresh.length > 0) {
          fresh.forEach((r) => seenIds.current.add(r.id));
          setToasts((prev) => [...prev, ...fresh]);
        }
      } catch { /* ignore poll errors */ }
    };

    poll();
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  const dismiss = async (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.patch(`/reminders/${id}/dismiss`);
    } catch { /* ignore */ }
  };

  return (
    <ReminderToastContext.Provider value={null}>
      {children}

      {/* Toast stack — bottom-right */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-background shadow-lg px-4 py-3",
                "animate-in slide-in-from-bottom-2"
              )}
            >
              <Bell className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Reminder</p>
                <p className="text-sm text-muted-foreground truncate">{t.title}</p>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ReminderToastContext.Provider>
  );
}

export const useReminderToast = () => useContext(ReminderToastContext);
