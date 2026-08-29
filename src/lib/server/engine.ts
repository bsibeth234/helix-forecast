import type { Sql } from "@/lib/db";
import {
  lmsrProbabilities,
  quoteBuy,
  quoteSell,
  settlementPayoutMilli,
  sharesForBudget,
} from "@/lib/lmsr";
import { parseNumeric } from "@/lib/money";
import { canManageMarkets, canTrade, canViewMarket, type Role } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import type { Actor } from "./actor";

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type OutcomeRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  quantity: string | number;
  is_winner: boolean | null;
};

type MarketRow = {
  id: string;
  org_id: string;
  created_by: string;
  owner_user_id: string;
  title: string;
  description: string;
  market_type: string;
  status: string;
  scope: string;
  team_id: string | null;
  subject_user_id: string | null;
  subject_consent_at: string | null;
  privacy: string;
  kpi_id: string | null;
  measurement_period: string;
  resolution_statement: string;
  data_source: string;
  opens_at: string;
  closes_at: string;
  resolve_after: string;
  liquidity_b: string | number;
  max_position_milli: number;
  eligibility: string;
  featured: boolean;
  comments_enabled: boolean;
  auto_resolve: boolean;
  cancel_reason: string | null;
};

export async function loadOutcomes(sql: Sql, marketId: string): Promise<OutcomeRow[]> {
  return sql.query<OutcomeRow>(
    `select id, key, label, sort_order, quantity, is_winner
       from market_outcomes where market_id = $1 order by sort_order`,
    [marketId],
  );
}

function qty(outcomes: OutcomeRow[]): number[] {
  return outcomes.map((o) => parseNumeric(o.quantity));
}

export function bookProbabilities(outcomes: OutcomeRow[], b: number): number[] {
  return lmsrProbabilities(qty(outcomes), b);
}

export async function snapshotProbs(
  sql: Sql,
  marketId: string,
  outcomes: OutcomeRow[],
  b: number,
  at?: string,
) {
  const probs = lmsrProbabilities(qty(outcomes), b);
  const payload: Record<string, number> = {};
  outcomes.forEach((o, i) => {
    payload[o.id] = probs[i] ?? 0;
  });
  await sql.query(
    `insert into probability_ticks (id, market_id, captured_at, probs) values ($1,$2,$3,$4::jsonb)`,
    [newId("tick"), marketId, at ?? new Date().toISOString(), JSON.stringify(payload)],
  );
}

export async function audit(
  sql: Sql,
  orgId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown> = {},
) {
  await sql.query(
    `insert into audit_events (id, org_id, actor_user_id, action, entity_type, entity_id, payload)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [newId("aud"), orgId, actorUserId, action, entityType, entityId, JSON.stringify(payload)],
  );
}

export async function notify(
  sql: Sql,
  userId: string,
  type: string,
  title: string,
  body: string,
  href?: string,
) {
  await sql.query(
    `insert into notifications (id, user_id, type, title, body, href) values ($1,$2,$3,$4,$5,$6)`,
    [newId("ntf"), userId, type, title, body, href ?? null],
  );
}

export async function notifyMany(
  sql: Sql,
  userIds: string[],
  type: string,
  title: string,
  body: string,
  href?: string,
) {
  for (const userId of userIds) await notify(sql, userId, type, title, body, href);
}

async function debitWallet(sql: Sql, actor: Actor, amountMilli: number, kind: string, refId: string, note: string) {
  const rows = await sql.query<{ balance_milli: number }>(
    `update wallets set balance_milli = balance_milli - $1, updated_at = now()
      where id = $2 and user_id = $3 and balance_milli >= $1
      returning balance_milli`,
    [amountMilli, actor.walletId, actor.userId],
  );
  const next = rows[0];
  if (!next) throw new EngineError("Not enough virtual points for this forecast.");
  await sql.query(
    `insert into wallet_ledger (id, wallet_id, user_id, amount_milli, balance_after_milli, kind, ref_type, ref_id, note)
     values ($1,$2,$3,$4,$5,$6,'trade',$7,$8)`,
    [newId("led"), actor.walletId, actor.userId, -amountMilli, parseNumeric(next.balance_milli), kind, refId, note],
  );
  return parseNumeric(next.balance_milli);
}

async function creditWallet(sql: Sql, actor: Actor, amountMilli: number, kind: string, refId: string, note: string) {
  const rows = await sql.query<{ balance_milli: number }>(
    `update wallets set balance_milli = balance_milli + $1, updated_at = now()
      where id = $2 and user_id = $3
      returning balance_milli`,
    [amountMilli, actor.walletId, actor.userId],
  );
  const next = rows[0];
  if (!next) throw new EngineError("Wallet missing");
  await sql.query(
    `insert into wallet_ledger (id, wallet_id, user_id, amount_milli, balance_after_milli, kind, ref_type, ref_id, note)
     values ($1,$2,$3,$4,$5,$6,'trade',$7,$8)`,
    [newId("led"), actor.walletId, actor.userId, amountMilli, parseNumeric(next.balance_milli), kind, refId, note],
  );
  return parseNumeric(next.balance_milli);
}

export async function creditUser(
  sql: Sql,
  orgId: string,
  userId: string,
  amountMilli: number,
  kind: string,
  refId: string,
  note: string,
) {
  const rows = await sql.query<{ id: string; balance_milli: number }>(
    `update wallets set balance_milli = balance_milli + $1, updated_at = now()
      where org_id = $2 and user_id = $3
      returning id, balance_milli`,
    [amountMilli, orgId, userId],
  );
  const next = rows[0];
  if (!next) return;
  await sql.query(
    `insert into wallet_ledger (id, wallet_id, user_id, amount_milli, balance_after_milli, kind, ref_type, ref_id, note)
     values ($1,$2,$3,$4,$5,$6,'market',$7,$8)`,
    [newId("led"), next.id, userId, amountMilli, parseNumeric(next.balance_milli), kind, refId, note],
  );
}

function assertEligible(actor: Actor, market: MarketRow) {
  if (market.eligibility === "team" && market.team_id && actor.teamId !== market.team_id && !canManageMarkets(actor.role)) {
    throw new EngineError("This forecast is limited to the named team.");
  }
  if (market.eligibility === "managers" && actor.role !== "sales_manager" && !canManageMarkets(actor.role)) {
    throw new EngineError("This forecast is limited to sales managers.");
  }
}

export type TradeInput = {
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  spendMilli?: number;
  shares?: number;
  at?: string;
};

export async function executeTrade(sql: Sql, actor: Actor, input: TradeInput) {
  if (!canTrade(actor.role)) throw new EngineError("Observers can read forecasts but cannot take positions.");
  if (!actor.acceptedConductAt) {
    throw new EngineError("Accept the participation and conduct rules before forecasting.");
  }
  const markets = await sql.query<MarketRow>(`select * from markets where id = $1`, [input.marketId]);
  const market = markets[0];
  if (!market) throw new EngineError("Market not found", 404);
  if (
    !canViewMarket(
      { role: actor.role, userId: actor.userId, teamId: actor.teamId },
      {
        privacy: market.privacy as "public_org" | "team_only" | "restricted",
        teamId: market.team_id,
        subjectUserId: market.subject_user_id,
        ownerUserId: market.owner_user_id,
        status: market.status,
      },
    )
  ) {
    throw new EngineError("You do not have access to this market.", 403);
  }
  if (market.status !== "open") throw new EngineError("This market is not open for forecasting.");
  if (new Date(market.closes_at).getTime() <= Date.now() && !input.at) {
    throw new EngineError("This market has closed.");
  }
  assertEligible(actor, market);
  const outcomes = await loadOutcomes(sql, market.id);
  const index = outcomes.findIndex((o) => o.id === input.outcomeId);
  if (index < 0) throw new EngineError("Unknown outcome");
  const b = parseNumeric(market.liquidity_b);
  const quantities = qty(outcomes);

  let shares = input.shares ?? 0;
  if (input.side === "buy") {
    if (input.spendMilli && input.spendMilli > 0) {
      shares = sharesForBudget(quantities, index, input.spendMilli / 1000, b);
    }
    if (!(shares > 0.0001)) throw new EngineError("Increase the amount to take a position.");
    const quote = quoteBuy(quantities, index, shares, b);
    const exposureRows = await sql.query<{ total: number | string }>(
      `select coalesce(sum(cost_basis_milli),0) as total from positions where market_id = $1 and user_id = $2`,
      [market.id, actor.userId],
    );
    const exposure = parseNumeric(exposureRows[0]?.total) + quote.costMilli;
    if (exposure > parseNumeric(market.max_position_milli)) {
      throw new EngineError("This would exceed the position limit for the market.");
    }
    const tradeId = newId("trd");
    await debitWallet(sql, actor, quote.costMilli, "trade_debit", tradeId, `Buy ${outcomes[index]!.label}`);
    await sql.query(`update market_outcomes set quantity = $1 where id = $2`, [
      quote.nextQuantities[index]!.toFixed(8),
      outcomes[index]!.id,
    ]);
    await sql.query(
      `insert into trades (id, market_id, user_id, outcome_id, side, shares, cost_milli, avg_price, prob_before, prob_after, created_at)
       values ($1,$2,$3,$4,'buy',$5,$6,$7,$8,$9,$10)`,
      [
        tradeId,
        market.id,
        actor.userId,
        outcomes[index]!.id,
        quote.shares.toFixed(8),
        quote.costMilli,
        quote.avgPrice.toFixed(8),
        quote.probsBefore[index]!.toFixed(8),
        quote.probsAfter[index]!.toFixed(8),
        input.at ?? new Date().toISOString(),
      ],
    );
    const existing = await sql.query<{ id: string; shares: string | number; cost_basis_milli: number }>(
      `select id, shares, cost_basis_milli from positions where market_id = $1 and user_id = $2 and outcome_id = $3`,
      [market.id, actor.userId, outcomes[index]!.id],
    );
    if (existing[0]) {
      await sql.query(
        `update positions set shares = $1, cost_basis_milli = $2, updated_at = now() where id = $3`,
        [
          (parseNumeric(existing[0].shares) + quote.shares).toFixed(8),
          parseNumeric(existing[0].cost_basis_milli) + quote.costMilli,
          existing[0].id,
        ],
      );
    } else {
      await sql.query(
        `insert into positions (id, market_id, user_id, outcome_id, shares, cost_basis_milli)
         values ($1,$2,$3,$4,$5,$6)`,
        [newId("pos"), market.id, actor.userId, outcomes[index]!.id, quote.shares.toFixed(8), quote.costMilli],
      );
    }
    const nextOutcomes = outcomes.map((o, i) => ({ ...o, quantity: quote.nextQuantities[i]! }));
    await snapshotProbs(sql, market.id, nextOutcomes, b, input.at);
    await audit(sql, market.org_id, actor.userId, "trade.buy", "market", market.id, {
      outcome: outcomes[index]!.key,
      shares: quote.shares,
      costMilli: quote.costMilli,
    });
    const move = Math.abs(quote.probsAfter[index]! - quote.probsBefore[index]!);
    if (move >= 0.05) {
      const holders = await sql.query<{ user_id: string }>(
        `select distinct user_id from positions where market_id = $1 and user_id <> $2`,
        [market.id, actor.userId],
      );
      await notifyMany(
        sql,
        holders.map((h) => h.user_id),
        "prob_move",
        "Forecast moved",
        `${market.title} is now ${(quote.probsAfter[index]! * 100).toFixed(1)}% on ${outcomes[index]!.label}.`,
        `/markets/${market.id}`,
      );
    }
    await notify(
      sql,
      actor.userId,
      "trade",
      "Position recorded",
      `You committed ${(quote.costMilli / 1000).toFixed(1)} points on ${outcomes[index]!.label}.`,
      `/markets/${market.id}`,
    );
    return quote;
  }

  const held = await sql.query<{ id: string; shares: string | number; cost_basis_milli: number }>(
    `select id, shares, cost_basis_milli from positions where market_id = $1 and user_id = $2 and outcome_id = $3`,
    [market.id, actor.userId, outcomes[index]!.id],
  );
  const heldShares = parseNumeric(held[0]?.shares);
  if (!held[0] || heldShares <= 0) throw new EngineError("You do not hold this outcome.");
  if (!(shares > 0)) shares = heldShares;
  if (shares > heldShares + 1e-8) throw new EngineError("You cannot sell more than you hold.");
  const quote = quoteSell(quantities, index, Math.min(shares, heldShares), b);
  const tradeId = newId("trd");
  await creditWallet(sql, actor, quote.costMilli, "trade_credit", tradeId, `Sell ${outcomes[index]!.label}`);
  await sql.query(`update market_outcomes set quantity = $1 where id = $2`, [
    quote.nextQuantities[index]!.toFixed(8),
    outcomes[index]!.id,
  ]);
  await sql.query(
    `insert into trades (id, market_id, user_id, outcome_id, side, shares, cost_milli, avg_price, prob_before, prob_after, created_at)
     values ($1,$2,$3,$4,'sell',$5,$6,$7,$8,$9,$10)`,
    [
      tradeId,
      market.id,
      actor.userId,
      outcomes[index]!.id,
      quote.shares.toFixed(8),
      quote.costMilli,
      quote.avgPrice.toFixed(8),
      quote.probsBefore[index]!.toFixed(8),
      quote.probsAfter[index]!.toFixed(8),
      input.at ?? new Date().toISOString(),
    ],
  );
  const remain = heldShares - quote.shares;
  const remainBasis = remain <= 1e-8 ? 0 : Math.round((parseNumeric(held[0].cost_basis_milli) * remain) / heldShares);
  if (remain <= 1e-8) {
    await sql.query(`delete from positions where id = $1`, [held[0].id]);
  } else {
    await sql.query(`update positions set shares = $1, cost_basis_milli = $2, updated_at = now() where id = $3`, [
      remain.toFixed(8),
      remainBasis,
      held[0].id,
    ]);
  }
  const nextOutcomes = outcomes.map((o, i) => ({ ...o, quantity: quote.nextQuantities[i]! }));
  await snapshotProbs(sql, market.id, nextOutcomes, b, input.at);
  await audit(sql, market.org_id, actor.userId, "trade.sell", "market", market.id, {
    outcome: outcomes[index]!.key,
    shares: quote.shares,
    proceedsMilli: quote.costMilli,
  });
  return quote;
}

export async function syncMarketClocks(sql: Sql) {
  await sql.query(
    `update markets set status = 'open', updated_at = now()
      where status = 'upcoming' and opens_at <= now()`,
  );
  await sql.query(
    `update markets set status = 'closed', updated_at = now()
      where status in ('open','paused') and closes_at <= now()`,
  );
}

export async function resolveMarket(
  sql: Sql,
  actor: Actor,
  marketId: string,
  winningOutcomeId: string,
  sourceValue: string,
  note: string,
  auto = false,
) {
  if (!auto && !canManageMarkets(actor.role)) throw new EngineError("Only market administrators can resolve.", 403);
  const markets = await sql.query<MarketRow>(`select * from markets where id = $1`, [marketId]);
  const market = markets[0];
  if (!market) throw new EngineError("Market not found", 404);
  if (!["closed", "open", "paused", "disputed"].includes(market.status)) {
    throw new EngineError("This market cannot be resolved in its current state.");
  }
  const outcomes = await loadOutcomes(sql, market.id);
  const winner = outcomes.find((o) => o.id === winningOutcomeId);
  if (!winner) throw new EngineError("Winning outcome is not part of this market.");
  await sql.query(`update market_outcomes set is_winner = (id = $1) where market_id = $2`, [winner.id, market.id]);
  const positions = await sql.query<{ user_id: string; outcome_id: string; shares: string | number }>(
    `select user_id, outcome_id, shares from positions where market_id = $1 and shares > 0`,
    [market.id],
  );
  for (const pos of positions) {
    if (pos.outcome_id !== winner.id) continue;
    const payout = settlementPayoutMilli(parseNumeric(pos.shares));
    if (payout <= 0) continue;
    await creditUser(sql, market.org_id, pos.user_id, payout, "settlement", market.id, `Settlement · ${market.title}`);
    await notify(
      sql,
      pos.user_id,
      "settlement",
      "Market settled",
      `${market.title} resolved ${winner.label}. Your position paid ${(payout / 1000).toFixed(1)} points.`,
      `/markets/${market.id}`,
    );
  }
  const uniqueHolders = [...new Set(positions.map((p) => p.user_id))];
  for (const userId of uniqueHolders) {
    if (positions.some((p) => p.user_id === userId && p.outcome_id === winner.id)) continue;
    await notify(
      sql,
      userId,
      "settlement",
      "Market settled",
      `${market.title} resolved ${winner.label}. Positions on other outcomes did not pay.`,
      `/markets/${market.id}`,
    );
  }
  await sql.query(
    `insert into resolutions (id, market_id, resolved_by, winning_outcome_id, source_value, note, auto)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [newId("res"), market.id, actor.userId, winner.id, sourceValue, note, auto],
  );
  await sql.query(`update markets set status = 'resolved', updated_at = now() where id = $1`, [market.id]);
  await sql.query(`update disputes set status = 'dismissed', updated_at = now() where market_id = $1 and status in ('open','under_review')`, [
    market.id,
  ]);
  await audit(sql, market.org_id, actor.userId, auto ? "market.auto_resolve" : "market.resolve", "market", market.id, {
    winner: winner.key,
    sourceValue,
    note,
  });
}

export async function cancelMarket(sql: Sql, actor: Actor, marketId: string, reason: string) {
  if (!canManageMarkets(actor.role)) throw new EngineError("Only market administrators can cancel.", 403);
  const markets = await sql.query<MarketRow>(`select * from markets where id = $1`, [marketId]);
  const market = markets[0];
  if (!market) throw new EngineError("Market not found", 404);
  if (["resolved", "cancelled"].includes(market.status)) {
    throw new EngineError("This market is already finished.");
  }
  const positions = await sql.query<{ user_id: string; cost_basis_milli: number }>(
    `select user_id, cost_basis_milli from positions where market_id = $1 and shares > 0`,
    [market.id],
  );
  for (const pos of positions) {
    if (parseNumeric(pos.cost_basis_milli) <= 0) continue;
    await creditUser(
      sql,
      market.org_id,
      pos.user_id,
      parseNumeric(pos.cost_basis_milli),
      "refund",
      market.id,
      `Cancellation refund · ${market.title}`,
    );
    await notify(
      sql,
      pos.user_id,
      "cancel",
      "Market cancelled",
      `${market.title} was cancelled. Committed points were returned to your balance.`,
      `/markets/${market.id}`,
    );
  }
  await sql.query(`update positions set shares = 0, cost_basis_milli = 0, updated_at = now() where market_id = $1`, [
    market.id,
  ]);
  await sql.query(
    `update markets set status = 'cancelled', cancel_reason = $2, cancelled_at = now(), updated_at = now() where id = $1`,
    [market.id, reason],
  );
  await audit(sql, market.org_id, actor.userId, "market.cancel", "market", market.id, { reason });
}

export async function openDispute(sql: Sql, actor: Actor, marketId: string, reason: string) {
  const markets = await sql.query<MarketRow>(`select * from markets where id = $1`, [marketId]);
  const market = markets[0];
  if (!market) throw new EngineError("Market not found", 404);
  if (market.status !== "resolved") throw new EngineError("Disputes can be opened after resolution.");
  const existing = await sql.query<{ id: string }>(
    `select id from disputes where market_id = $1 and opened_by = $2 and status in ('open','under_review')`,
    [market.id, actor.userId],
  );
  if (existing[0]) throw new EngineError("You already have an open dispute on this market.");
  const id = newId("dsp");
  await sql.query(
    `insert into disputes (id, market_id, opened_by, reason, status) values ($1,$2,$3,$4,'open')`,
    [id, market.id, actor.userId, reason],
  );
  await sql.query(`update markets set status = 'disputed', updated_at = now() where id = $1`, [market.id]);
  await audit(sql, market.org_id, actor.userId, "dispute.open", "market", market.id, { reason });
  const admins = await sql.query<{ user_id: string }>(
    `select user_id from memberships where org_id = $1 and role in ('platform_admin','market_admin')`,
    [market.org_id],
  );
  await notifyMany(
    sql,
    admins.map((a) => a.user_id),
    "dispute",
    "Dispute opened",
    `${actor.name} disputed ${market.title}.`,
    `/markets/${market.id}`,
  );
  return id;
}

export async function reviewDispute(
  sql: Sql,
  actor: Actor,
  disputeId: string,
  decision: "upheld" | "dismissed" | "overturned",
  adminNote: string,
  winningOutcomeId?: string,
  sourceValue?: string,
) {
  if (!canManageMarkets(actor.role)) throw new EngineError("Only market administrators can review disputes.", 403);
  const rows = await sql.query<{ id: string; market_id: string; status: string }>(
    `select id, market_id, status from disputes where id = $1`,
    [disputeId],
  );
  const dispute = rows[0];
  if (!dispute) throw new EngineError("Dispute not found", 404);
  await sql.query(
    `update disputes set status = $2, admin_note = $3, reviewed_by = $4, updated_at = now() where id = $1`,
    [dispute.id, decision === "overturned" ? "overturned" : decision === "upheld" ? "upheld" : "dismissed", adminNote, actor.userId],
  );
  if (decision === "overturned" && winningOutcomeId) {
    await reverseSettlement(sql, dispute.market_id);
    await resolveMarket(sql, actor, dispute.market_id, winningOutcomeId, sourceValue ?? "Dispute overturn", adminNote, false);
  } else {
    await sql.query(`update markets set status = 'resolved', updated_at = now() where id = $1`, [dispute.market_id]);
  }
  await audit(sql, actor.orgId, actor.userId, "dispute.review", "dispute", dispute.id, { decision, adminNote });
}

async function reverseSettlement(sql: Sql, marketId: string) {
  const market = (await sql.query<MarketRow>(`select * from markets where id = $1`, [marketId]))[0];
  if (!market) return;
  const winner = (
    await sql.query<{ id: string }>(`select id from market_outcomes where market_id = $1 and is_winner = true`, [marketId])
  )[0];
  if (!winner) return;
  const positions = await sql.query<{ user_id: string; shares: string | number }>(
    `select user_id, shares from positions where market_id = $1 and outcome_id = $2`,
    [marketId, winner.id],
  );
  for (const pos of positions) {
    const payout = settlementPayoutMilli(parseNumeric(pos.shares));
    await creditUser(sql, market.org_id, pos.user_id, -payout, "settlement_reversal", market.id, "Dispute overturn — prior settlement reversed");
  }
}

export async function autoResolveReady(sql: Sql, actor: Actor) {
  const ready = await sql.query<MarketRow>(
    `select * from markets
      where auto_resolve = true and status = 'closed' and resolve_after <= now()`,
  );
  const resolved: string[] = [];
  for (const market of ready) {
    if (!market.kpi_id || !market.team_id) continue;
    const decision = await evaluateCrm(sql, market);
    if (!decision) continue;
    await resolveMarket(sql, actor, market.id, decision.outcomeId, decision.sourceValue, "Automated CRM resolution", true);
    resolved.push(market.id);
  }
  return resolved;
}

export async function evaluateCrm(sql: Sql, market: MarketRow): Promise<{ outcomeId: string; sourceValue: string } | null> {
  const kpi = await sql.query<{ key: string }>(`select key from kpis where id = $1`, [market.kpi_id]);
  const metrics = await sql.query<{
    quota_cents: number;
    closed_won_cents: number;
    pipeline_cents: number;
    deal_count: number;
    avg_cycle_days: string | number;
  }>(`select quota_cents, closed_won_cents, pipeline_cents, deal_count, avg_cycle_days from crm_team_metrics where team_id = $1 and period = $2`, [
    market.team_id,
    market.measurement_period,
  ]);
  const m = metrics[0];
  if (!m || !kpi[0]) return null;
  const outcomes = await loadOutcomes(sql, market.id);
  const yes = outcomes.find((o) => o.key === "yes");
  const no = outcomes.find((o) => o.key === "no");
  if (!yes || !no) return null;
  const key = kpi[0].key;
  let passed = false;
  let sourceValue = "";
  if (key === "quota_attainment") {
    const pct = m.quota_cents === 0 ? 0 : m.closed_won_cents / m.quota_cents;
    sourceValue = `${(pct * 100).toFixed(1)}% quota attainment (${(m.closed_won_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} / ${(m.quota_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })})`;
    passed = pct >= 1;
  } else if (key === "deal_count") {
    sourceValue = `${m.deal_count} closed-won deals`;
    passed = m.deal_count >= 12;
  } else if (key === "pipeline") {
    sourceValue = `${(m.pipeline_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} qualified pipeline`;
    passed = m.pipeline_cents >= 50_000_000;
  } else if (key === "cycle_time") {
    sourceValue = `${parseNumeric(m.avg_cycle_days).toFixed(1)} day average cycle`;
    passed = parseNumeric(m.avg_cycle_days) < 45;
  } else if (key === "ramp") {
    const rep = await sql.query<{ ramp_complete: boolean }>(
      `select ramp_complete from crm_reps where user_id = $1`,
      [market.subject_user_id],
    );
    sourceValue = rep[0]?.ramp_complete ? "Ramp milestone complete" : "Ramp milestone incomplete";
    passed = Boolean(rep[0]?.ramp_complete);
  } else {
    return null;
  }
  return { outcomeId: passed ? yes.id : no.id, sourceValue };
}

export type ActorLike = Actor;
export type { Role };
