import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ProbChart } from "@/components/prob-chart";
import { StatusBadge } from "@/components/status-badge";
import { MarketCard, type MarketCardData } from "@/components/market-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatPct, formatPoints } from "@/lib/format";
import { quoteBuy, quoteSell, sharesForBudget } from "@/lib/lmsr";
import { canTrade } from "@/lib/permissions";
import {
  addComment,
  cancelMarketFn,
  getMarket,
  openDisputeFn,
  placeTrade,
  resolveMarketFn,
  reviewDisputeFn,
  runSettlementJob,
  setMarketStatus,
} from "@/lib/server/api";

export const Route = createFileRoute("/markets/$marketId")({ component: MarketPage });

function MarketPage() {
  const { marketId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMarket>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    getMarket({ data: { marketId } })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId]);

  if (error) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">{error}</p>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading market…</p>
      </AppShell>
    );
  }

  const primary = data.outcomes[0];

  return (
    <AppShell>
      <div className="mb-6">
        <Link to="/markets" className="text-sm text-muted-foreground hover:text-foreground">
          Directory
        </Link>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              {data.teamName ? <span className="text-xs text-muted-foreground">{data.teamName}</span> : null}
              {data.kpiName ? <span className="text-xs text-muted-foreground">{data.kpiName}</span> : null}
            </div>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">{data.title}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">{primary?.label} probability</p>
            <p className="font-mono text-5xl tabular-nums tracking-tight">{formatPct(primary?.prob ?? 0)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Probability history</CardTitle>
            </CardHeader>
            <CardContent>
              <ProbChart ticks={data.ticks} outcomeId={primary?.id ?? ""} label={primary?.label ?? "Yes"} />
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {data.outcomes.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="font-mono text-xl tabular-nums">{formatPct(o.prob)}</p>
                </div>
                {o.isWinner ? <p className="mt-1 text-xs text-primary">Resolved winner</p> : null}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.max(3, o.prob * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              <p>{data.description}</p>
              <div>
                <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Resolution statement</p>
                <p className="mt-1">{data.resolutionStatement}</p>
              </div>
              <p className="text-muted-foreground">
                Source: {data.dataSource} · Period {data.period} · Closes {formatDateTime(data.closesAt)}
              </p>
              {data.cancelReason ? <p className="text-destructive">Cancelled: {data.cancelReason}</p> : null}
              {data.resolution ? (
                <p>
                  Resolved from <strong>{data.resolution.source_value}</strong>
                  {data.resolution.note ? ` — ${data.resolution.note}` : ""}.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Rationale marketId={data.id} comments={data.comments} enabled={data.commentsEnabled} onDone={reload} />
          <AuditTrail rows={data.audit} />
        </div>

        <div className="space-y-6">
          <TradePanel data={data} onDone={reload} />
          <AdminPanel data={data} onDone={reload} />
          <Card>
            <CardHeader>
              <CardTitle>Your position</CardTitle>
            </CardHeader>
            <CardContent>
              {data.myPositions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open position on this market.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.myPositions.map((p) => (
                    <li key={p.outcomeId} className="flex justify-between">
                      <span>{p.label}</span>
                      <span className="font-mono tabular-nums">
                        {p.shares.toFixed(2)} sh · {formatPoints(p.costBasisMilli)} pts in
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Balance {formatPoints(data.balanceMilli)} pts</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {data.trades.slice(0, 12).map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t.userName} {t.side} {t.outcome}
                    </span>
                    <span className="font-mono tabular-nums">{formatPoints(t.costMilli, 0)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {data.related.length ? (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-2xl">Related</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.related.map((m) => (
              <MarketCard key={m.id} market={m as MarketCardData} />
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function TradePanel({ data, onDone }: { data: Awaited<ReturnType<typeof getMarket>>; onDone: () => void }) {
  const [outcomeId, setOutcomeId] = useState(data.outcomes[0]?.id ?? "");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [spend, setSpend] = useState(150);
  const [busy, setBusy] = useState(false);
  const outcomeIndex = Math.max(0, data.outcomes.findIndex((o) => o.id === outcomeId));
  const quantities = data.outcomes.map((o) => o.quantity);
  const held = data.myPositions.find((p) => p.outcomeId === outcomeId);

  const quote = useMemo(() => {
    try {
      if (side === "buy") {
        const shares = sharesForBudget(quantities, outcomeIndex, spend, data.liquidityB);
        if (shares <= 0) return null;
        return quoteBuy(quantities, outcomeIndex, shares, data.liquidityB);
      }
      const shares = Math.min(held?.shares ?? 0, spend);
      if (shares <= 0) return null;
      return quoteSell(quantities, outcomeIndex, shares, data.liquidityB);
    } catch {
      return null;
    }
  }, [quantities, outcomeIndex, spend, side, data.liquidityB, held?.shares]);

  if (data.status !== "open" || !canTrade(data.role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Forecast</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {data.status !== "open" ? "This market is not open for new positions." : "Observers can read the forecast but cannot take positions."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Take a position</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`h-10 flex-1 rounded-md text-sm ${side === s ? "bg-ink text-paper" : "bg-muted"}`}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          {data.outcomes.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOutcomeId(o.id)}
              className={`flex h-11 items-center justify-between rounded-md border px-3 text-sm ${
                outcomeId === o.id ? "border-primary bg-primary/8" : "border-border"
              }`}
            >
              <span>{o.label}</span>
              <span className="font-mono tabular-nums">{formatPct(o.prob)}</span>
            </button>
          ))}
        </div>
        <div>
          <Label>{side === "buy" ? "Points to commit" : "Shares to sell"}</Label>
          <div className="mt-2 flex items-center gap-3">
            <Slider value={[spend]} min={10} max={side === "buy" ? 800 : Math.max(10, Math.ceil(held?.shares ?? 10))} step={10} onValueChange={(v) => setSpend(v[0] ?? 150)} />
            <Input className="w-24" type="number" value={spend} onChange={(e) => setSpend(Number(e.target.value))} />
          </div>
        </div>
        {quote ? (
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Cost</dt>
              <dd className="font-mono text-sm">{formatPoints(quote.costMilli)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Avg probability paid</dt>
              <dd className="font-mono text-sm">{formatPct(quote.avgPrice)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">New probability</dt>
              <dd className="font-mono text-sm">{formatPct(quote.probsAfter[outcomeIndex] ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{side === "buy" ? "Pays if correct" : "Proceeds"}</dt>
              <dd className="font-mono text-sm">{side === "buy" ? `${quote.payoutIfWin.toFixed(1)} pts` : formatPoints(quote.costMilli)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">Adjust the amount to preview impact.</p>
        )}
        <Button
          className="w-full"
          disabled={busy || !quote}
          onClick={() => {
            setBusy(true);
            placeTrade({
              data: {
                marketId: data.id,
                outcomeId,
                side,
                spendMilli: side === "buy" ? spend * 1000 : undefined,
                shares: side === "sell" ? spend : undefined,
              },
            })
              .then(() => {
                toast.success("Position recorded");
                onDone();
              })
              .catch((err: Error) => toast.error(err.message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Recording…" : "Confirm forecast"}
        </Button>
        <p className="text-[11px] text-muted-foreground">Virtual points only. This is a forecast, not a bet, and cannot be converted to cash.</p>
      </CardContent>
    </Card>
  );
}

function AdminPanel({ data, onDone }: { data: Awaited<ReturnType<typeof getMarket>>; onDone: () => void }) {
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [winner, setWinner] = useState(data.outcomes[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [dispute, setDispute] = useState("");

  if (!data.canManage && data.status !== "resolved" && data.status !== "disputed") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Administration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.canManage && data.status === "open" ? (
          <Button variant="outline" className="w-full" onClick={() => setMarketStatus({ data: { marketId: data.id, status: "paused" } }).then(onDone)}>
            Pause trading
          </Button>
        ) : null}
        {data.canManage && data.status === "paused" ? (
          <Button variant="outline" className="w-full" onClick={() => setMarketStatus({ data: { marketId: data.id, status: "open" } }).then(onDone)}>
            Resume trading
          </Button>
        ) : null}
        {data.canManage && (data.status === "closed" || data.status === "open" || data.status === "paused") ? (
          <div className="space-y-2">
            <Label>Resolve</Label>
            <select className="h-11 w-full rounded-md border border-input bg-card px-3" value={winner} onChange={(e) => setWinner(e.target.value)}>
              {data.outcomes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input placeholder="Source value from CRM" value={source} onChange={(e) => setSource(e.target.value)} />
            <Textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              className="w-full"
              onClick={() =>
                resolveMarketFn({ data: { marketId: data.id, winningOutcomeId: winner, sourceValue: source || "Manual resolution", note } })
                  .then(() => {
                    toast.success("Market resolved");
                    onDone();
                  })
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              Confirm resolution
            </Button>
            <Button variant="outline" className="w-full" onClick={() => runSettlementJob().then((r) => toast.success(`Auto-resolved ${r.resolved.length} market(s)`)).then(onDone)}>
              Run CRM settlement job
            </Button>
          </div>
        ) : null}
        {data.canManage && !["resolved", "cancelled"].includes(data.status) ? (
          <div className="space-y-2">
            <Input placeholder="Cancellation reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button
              variant="destructive"
              className="w-full"
              onClick={() =>
                cancelMarketFn({ data: { marketId: data.id, reason: reason || "Cancelled by administrator" } })
                  .then(() => {
                    toast.success("Market cancelled — positions refunded");
                    onDone();
                  })
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              Cancel and refund
            </Button>
          </div>
        ) : null}
        {data.status === "resolved" ? (
          <div className="space-y-2">
            <Textarea placeholder="Dispute reason" value={dispute} onChange={(e) => setDispute(e.target.value)} />
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                openDisputeFn({ data: { marketId: data.id, reason: dispute } })
                  .then(() => {
                    toast.success("Dispute opened");
                    onDone();
                  })
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              Open dispute
            </Button>
          </div>
        ) : null}
        {data.canManage && data.disputes.length ? (
          <div className="space-y-3">
            {data.disputes.map((d) => (
              <div key={d.id} className="rounded-md border border-border p-3">
                <p className="font-medium">{d.status}</p>
                <p className="text-muted-foreground">{d.reason}</p>
                {d.status === "open" || d.status === "under_review" ? (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      reviewDisputeFn({ data: { disputeId: d.id, decision: "dismissed", adminNote: "Reviewed against CRM extract. Original resolution stands." } }).then(onDone)
                    }
                  >
                    Dismiss dispute
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Rationale({
  marketId,
  comments,
  enabled,
  onDone,
}: {
  marketId: string;
  comments: { id: string; author: string; body: string; createdAt: string }[];
  enabled: boolean;
  onDone: () => void;
}) {
  const [body, setBody] = useState("");
  if (!enabled) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence and rationale</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share a non-confidential reason for your forecast." />
        <Button
          variant="outline"
          onClick={() =>
            addComment({ data: { marketId, body, anonymous: false } })
              .then(() => {
                setBody("");
                onDone();
              })
              .catch((err: Error) => toast.error(err.message))
          }
        >
          Post
        </Button>
        <ul className="space-y-3 text-sm">
          {comments.map((c) => (
            <li key={c.id}>
              <p className="font-medium">{c.author}</p>
              <p className="text-muted-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AuditTrail({ rows }: { rows: { action: string; created_at: string; actor_user_id: string }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit trail</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-xs">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-3 font-mono">
              <span>{r.action}</span>
              <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
