import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { formatPoints } from "@/lib/money";
import { getLeaderboard } from "@/lib/server/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({ component: LeaderboardPage });

function LeaderboardPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getLeaderboard>> | null>(null);
  useEffect(() => {
    getLeaderboard().then(setData).catch(() => undefined);
  }, []);
  return (
    <AppShell>
      <h1 className="font-display text-4xl">Leaderboard</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Ranked by forecasting P&L in virtual points, not trading volume. Individual-performance markets stay off this board. Visibility is {data?.visibility ?? "org"}-wide per governance.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs tracking-[0.12em] text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th>Name</th>
              <th>Team</th>
              <th className="text-right">P&L</th>
              <th className="text-right">Correct</th>
              <th className="text-right">Trades</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.userId} className={cn("border-t border-border", r.isYou && "bg-primary/8")}>
                <td className="px-4 py-3 font-mono">{r.rank}</td>
                <td>{r.name}{r.isYou ? " · you" : ""}</td>
                <td className="text-muted-foreground">{r.teamName ?? "—"}</td>
                <td className="text-right font-mono tabular-nums">{formatPoints(r.pnlMilli, 0)}</td>
                <td className="text-right font-mono tabular-nums">{r.correct}/{r.resolved}</td>
                <td className="text-right font-mono tabular-nums">{r.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
