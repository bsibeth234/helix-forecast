import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatPoints } from "@/lib/money";
import { roleLabel } from "@/lib/permissions";
import { allocatePoints, getAdminOverview, reviewDisputeFn, updateGovernance, updateRole } from "@/lib/server/api";

export const Route = createFileRoute("/admin/")({ component: AdminPage });

function AdminPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminOverview>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  function load() {
    getAdminOverview().then(setData).catch((err: Error) => setError(err.message));
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <AppShell>
      <h1 className="font-display text-4xl">Administration</h1>
      <p className="mt-2 text-sm text-muted-foreground">People, points, disputes, governance. CRM data lives in the CRM studio.</p>
      <div className="mt-4 flex gap-3">
        <Button asChild variant="outline"><Link to="/admin/crm">CRM studio</Link></Button>
        <Button asChild variant="outline"><Link to="/docs">Ethics & math</Link></Button>
      </div>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {data ? (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="mb-3 font-display text-2xl">People</h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th>Role</th>
                    <th>Team</th>
                    <th className="text-right">Points</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.user_id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td>
                        {data.canAdmin ? (
                          <select
                            className="h-9 rounded-md border border-input bg-card px-2"
                            value={u.role}
                            onChange={(e) =>
                              updateRole({ data: { userId: u.user_id, role: e.target.value as never } })
                                .then(() => toast.success("Role updated"))
                                .then(load)
                            }
                          >
                            {["platform_admin", "market_admin", "sales_manager", "participant", "observer"].map((r) => (
                              <option key={r} value={r}>{roleLabel(r as never)}</option>
                            ))}
                          </select>
                        ) : (
                          roleLabel(u.role as never)
                        )}
                      </td>
                      <td>{u.team_name ?? "—"}</td>
                      <td className="text-right font-mono">{formatPoints(u.balance_milli, 0)}</td>
                      <td className="pr-4 text-right">
                        {data.canAdmin ? (
                          <Button size="sm" variant="outline" onClick={() => allocatePoints({ data: { userId: u.user_id, points: 500 } }).then(load)}>
                            +500
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-display text-2xl">Teams</h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {data.teams.map((t) => (
                <li key={t.id} className="rounded-xl border border-border bg-card p-4">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.region} · {t.focus} · {t.n} people</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 font-display text-2xl">Disputes</h2>
            {data.disputes.length === 0 ? <p className="text-sm text-muted-foreground">None open.</p> : (
              <ul className="space-y-3">
                {data.disputes.map((d) => (
                  <li key={d.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-sm text-muted-foreground">{d.reason}</p>
                    <p className="mt-1 text-xs uppercase">{d.status}</p>
                    {d.status === "open" ? (
                      <Button size="sm" className="mt-2" onClick={() => reviewDisputeFn({ data: { disputeId: d.id, decision: "dismissed", adminNote: "CRM extract confirmed." } }).then(load)}>
                        Dismiss
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-2xl">Governance</h2>
            <div className="grid max-w-lg gap-3">
              <label className="text-sm">
                Leaderboard visibility
                <select
                  className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3"
                  defaultValue={(data.governance as { leaderboard_visibility?: string } | undefined)?.leaderboard_visibility}
                  onChange={(e) =>
                    updateGovernance({
                      data: {
                        leaderboardVisibility: e.target.value as "private" | "team" | "org",
                        maxPositionMilli: 2_500_000,
                        commentsEnabled: true,
                        autoResolveEnabled: true,
                        individualMarketsEnabled: true,
                      },
                    }).then(() => toast.success("Saved"))
                  }
                >
                  <option value="private">Private</option>
                  <option value="team">Team</option>
                  <option value="org">Organization</option>
                </select>
              </label>
              <p className="text-sm text-muted-foreground">
                {(data.governance as { employment_disclaimer?: string } | undefined)?.employment_disclaimer}
              </p>
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-display text-2xl">Audit log</h2>
            <ol className="max-h-80 overflow-auto rounded-xl border border-border bg-card p-4 font-mono text-xs">
              {data.audit.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-1">
                  <span>{a.action} · {a.entity_type}</span>
                  <span className="text-muted-foreground">{a.created_at}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
