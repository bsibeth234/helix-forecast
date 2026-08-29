import { Link } from "@tanstack/react-router";
import { StatusBadge } from "@/components/status-badge";
import { formatPct, formatRelative } from "@/lib/format";
import { formatPoints } from "@/lib/money";
import { cn } from "@/lib/utils";

export type MarketCardData = {
  id: string;
  title: string;
  status: string;
  closesAt: string;
  teamName: string | null;
  kpiName: string | null;
  featured: boolean;
  primaryProb: number;
  primaryLabel: string;
  outcomes: { id: string; key: string; label: string; prob: number }[];
  volumeMilli: number;
  participantCount: number;
};

export function MarketCard({ market }: { market: MarketCardData }) {
  const yes = market.outcomes[0];
  return (
    <Link
      to="/markets/$marketId"
      params={{ marketId: market.id }}
      className="group block rounded-xl border border-border bg-card p-5 transition-colors duration-150 hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {market.featured ? (
            <p className="mb-1 text-[11px] font-medium tracking-[0.14em] text-primary uppercase">Featured</p>
          ) : null}
          <h3 className="font-display text-lg leading-snug text-foreground group-hover:text-ink">{market.title}</h3>
        </div>
        <StatusBadge status={market.status} />
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">{yes?.label ?? market.primaryLabel}</span>
          <span className="font-mono text-2xl font-medium tabular-nums tracking-tight">
            {formatPct(market.primaryProb)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full bg-primary transition-[width] duration-300")}
            style={{ width: `${Math.max(4, market.primaryProb * 100)}%` }}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {market.teamName ? <span>{market.teamName}</span> : <span>Organization</span>}
        {market.kpiName ? <span>{market.kpiName}</span> : null}
        <span>{formatPoints(market.volumeMilli, 0)} pts volume</span>
        <span>{market.participantCount} forecasting</span>
        <span>Closes {formatRelative(market.closesAt)}</span>
      </div>
    </Link>
  );
}
