import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { listNotifications, markNotificationsRead } from "@/lib/server/api";

export const Route = createFileRoute("/notifications")({ component: InboxPage });

function InboxPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);
  function load() {
    listNotifications().then(setRows).catch(() => undefined);
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-4xl">Inbox</h1>
        <Button variant="outline" onClick={() => markNotificationsRead().then(load)}>
          Mark all read
        </Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No notifications yet.</p> : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                </div>
                <span className="text-xs text-muted-foreground">{formatRelative(n.created_at)}</span>
              </div>
              {n.href ? (
                <a href={n.href} className="mt-1 inline-block text-xs text-primary hover:underline">
                  Open
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
