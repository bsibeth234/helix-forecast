import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPoints } from "@/lib/money";
import { getPortfolio } from "@/lib/server/api";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/portfolio")({ component: PortfolioPage });

function PortfolioPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPortfolio>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getPortfolio()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);
  return (
    <AppShell>
      <h1 className="font-display text-4xl">Portfolio</h1>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {!data ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Balance</CardTitle></CardHeader>
              <CardContent><p className="font-mono text-3xl tabular-nums">{formatPoints(data.balanceMilli, 0)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Allocated</CardTitle></CardHeader>
              <CardContent><p className="font-mono text-3xl tabular-nums">{formatPoints(data.allocatedMilli, 0)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">vs allocation</CardTitle></CardHeader>
              <CardContent><p className="font-mono text-3xl tabular-nums">{formatPoints(data.pnlMilli, 0)}</p></CardContent>
            </Card>
          </div>
          <section>
            <h2 className="mb-3 font-display text-2xl">Open positions</h2>
            {data.positions.length === 0 ? <p className="text-sm text-muted-foreground">No open positions.</p> : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {data.positions.map((p) => (
                  <li key={p.marketId + p.label} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <Link to="/markets/$marketId" params={{ marketId: p.marketId }} className="text-sm font-medium hover:underline">
                        {p.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{p.label} · {p.shares.toFixed(2)} shares</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-2xl">Point ledger</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {data.ledger.map((l) => (
                <li key={l.id} className="flex justify-between px-4 py-2 text-sm">
                  <span>{l.note ?? l.kind}</span>
                  <span className="font-mono tabular-nums">{formatPoints(l.amount_milli)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </AppShell>
  );
}
