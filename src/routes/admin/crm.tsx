import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatUsdFromCents, parseNumeric } from "@/lib/money";
import { getCrm, runSettlementJob, simulateCrmWeek } from "@/lib/server/api";

export const Route = createFileRoute("/admin/crm")({ component: CrmPage });

function CrmPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCrm>> | null>(null);
  function load() {
    getCrm().then(setData).catch((err: Error) => toast.error(err.message));
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <AppShell>
      <h1 className="font-display text-4xl">CRM studio</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Helix reads a simulated CRM through a narrow adapter. Swap this module for Salesforce or HubSpot later — markets resolve from named fields, not from screenshots.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          onClick={() =>
            simulateCrmWeek()
              .then(() => toast.success("Advanced the CRM by a week"))
              .then(load)
          }
        >
          Advance simulated week
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            runSettlementJob().then((r) => {
              toast.success(r.resolved.length ? `Resolved ${r.resolved.length} market(s)` : "No markets were ready");
            })
          }
        >
          Run settlement job
        </Button>
      </div>
      <h2 className="mt-10 font-display text-2xl">Team metrics</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Team</th>
              <th>Period</th>
              <th className="text-right">Quota</th>
              <th className="text-right">Closed won</th>
              <th className="text-right">Attainment</th>
              <th className="text-right">Deals</th>
              <th className="text-right">Cycle</th>
            </tr>
          </thead>
          <tbody>
            {(data?.teams as Array<Record<string, unknown>> | undefined)?.map((t, i) => {
              const quota = parseNumeric(t.quota_cents);
              const won = parseNumeric(t.closed_won_cents);
              return (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-3">{String(t.name)}</td>
                  <td>{String(t.period)}</td>
                  <td className="text-right font-mono">{formatUsdFromCents(quota)}</td>
                  <td className="text-right font-mono">{formatUsdFromCents(won)}</td>
                  <td className="text-right font-mono">{quota ? `${((won / quota) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="text-right font-mono">{String(t.deal_count)}</td>
                  <td className="text-right font-mono">{parseNumeric(t.avg_cycle_days).toFixed(1)}d</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 font-display text-2xl">Representatives</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th>Team</th>
              <th>Seat</th>
              <th className="text-right">Pipeline</th>
              <th className="text-right">Won</th>
              <th>Ramp</th>
            </tr>
          </thead>
          <tbody>
            {(data?.reps as Array<Record<string, unknown>> | undefined)?.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-3">{String(r.name)}</td>
                <td>{String(r.team_name)}</td>
                <td>{String(r.seat)}</td>
                <td className="text-right font-mono">{formatUsdFromCents(parseNumeric(r.pipeline_cents))}</td>
                <td className="text-right font-mono">{formatUsdFromCents(parseNumeric(r.closed_won_cents))}</td>
                <td>{r.ramp_complete ? "Complete" : "In progress"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
