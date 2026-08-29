import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MarketCard, type MarketCardData } from "@/components/market-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLookups, listMarkets } from "@/lib/server/api";
import { canManageMarkets } from "@/lib/permissions";
import { getBootstrap } from "@/lib/server/api";

export const Route = createFileRoute("/markets/")({ component: MarketsPage });

const STATUSES = ["all", "open", "upcoming", "closed", "resolved", "paused", "cancelled", "disputed", "draft"];

function MarketsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [teamId, setTeamId] = useState("");
  const [rows, setRows] = useState<MarketCardData[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    listMarkets({ data: { q, status, teamId: teamId || undefined } })
      .then((r) => setRows(r as MarketCardData[]))
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    load();
    listLookups().then((d) => setTeams(d.teams));
    getBootstrap().then((b) => setCanCreate(canManageMarkets(b.actor.role)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, teamId]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Directory</p>
          <h1 className="font-display text-4xl">Markets</h1>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link to="/markets/new">Create market</Link>
          </Button>
        ) : null}
      </div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row">
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Input placeholder="Search questions, KPIs…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="flex gap-2 overflow-x-auto">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`h-11 rounded-md px-3 text-sm whitespace-nowrap ${status === s ? "bg-ink text-paper" : "bg-muted text-muted-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-6 flex gap-2 overflow-x-auto">
        <button type="button" onClick={() => setTeamId("")} className={`h-10 rounded-md px-3 text-sm ${teamId === "" ? "bg-secondary" : "text-muted-foreground"}`}>
          All teams
        </button>
        {teams.map((t) => (
          <button key={t.id} type="button" onClick={() => setTeamId(t.id)} className={`h-10 rounded-md px-3 text-sm ${teamId === t.id ? "bg-secondary" : "text-muted-foreground"}`}>
            {t.name}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No markets match these filters.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
