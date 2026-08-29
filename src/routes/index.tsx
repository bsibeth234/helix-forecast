import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { HelixMark } from "@/components/helix-mark";
import { MarketCard, type MarketCardData } from "@/components/market-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatPoints } from "@/lib/money";
import { getDashboard } from "@/lib/server/api";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending || !user) return <Landing />;
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <HelixMark />
          <span className="font-display text-2xl">Helix</span>
        </div>
        <Button asChild>
          <Link to="/login">Enter</Link>
        </Button>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <p className="text-xs font-medium tracking-[0.22em] text-foreground/70 uppercase">Northstar Commerce · internal only</p>
        <h1 className="mt-5 max-w-4xl font-display text-4xl leading-[1.08] text-balance md:text-6xl">
          Bet on your sales people's performance,{" "}
          <span className="block">before you lose your job to AI</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Helix lets sales teams express conviction about measurable outcomes with virtual points. The crowd price is a live probability — a signal for operators, never a wager and never cash.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/login">
              Open Helix <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/docs">How it works</Link>
          </Button>
        </div>
        <dl className="mt-16 grid gap-6 border-t border-border pt-10 sm:grid-cols-3">
          <div>
            <dt className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Points</dt>
            <dd className="mt-2 font-display text-2xl">Virtual, non-transferable</dd>
          </div>
          <div>
            <dt className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Default scope</dt>
            <dd className="mt-2 font-display text-2xl">Teams and aggregates</dd>
          </div>
          <div>
            <dt className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Resolution</dt>
            <dd className="mt-2 font-display text-2xl">CRM actuals, audited</dd>
          </div>
        </dl>
      </section>
      <SignedOut>
        <div className="sr-only">Signed out</div>
      </SignedOut>
    </main>
  );
}

function Dashboard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Forecasting room</p>
        <h1 className="mt-1 font-display text-4xl">Good afternoon, {data.actor.name.split(" ")[0]}.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Prices are implied probabilities. Points have no cash value. Do not treat Helix as an employment score.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Virtual points</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl tabular-nums">{formatPoints(data.actor.balanceMilli, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Unrealized vs allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl tabular-nums">{formatPoints(data.pnl, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Open disputes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl tabular-nums">{data.openDisputes}</p>
          </CardContent>
        </Card>
      </section>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-2xl">Open forecasts</h2>
          <Link to="/markets" className="text-sm text-primary hover:underline">
            View directory
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.open.slice(0, 4).map((m) => (
            <MarketCard key={m.id} market={m as MarketCardData} />
          ))}
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-2xl">Closing soon</h2>
          <div className="grid gap-3">
            {data.closing.map((m) => (
              <MarketCard key={m.id} market={m as MarketCardData} />
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 font-display text-2xl">Recently resolved</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.resolved.map((r) => (
              <li key={r.title + r.resolved_at} className="px-4 py-3">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.winner} · {r.source_value}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
