import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { quoteBuy, quoteSell, sharesForBudget, quantitiesForBinaryProb, quantitiesForProbs } from "@/lib/lmsr";
import { parseNumeric } from "@/lib/money";
import { toIso, toIsoNull } from "@/lib/format";
import {
  canAdminOrg,
  canManageMarkets,
  canViewAdmin,
  canViewMarket,
  forbiddenTopicReason,
} from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { z } from "zod";
import { getActor, type Actor } from "./actor";
import { ensureSeeded } from "./seed";
import {
  audit,
  autoResolveReady,
  bookProbabilities,
  cancelMarket,
  EngineError,
  evaluateCrm,
  executeTrade,
  loadOutcomes,
  notify,
  openDispute,
  resolveMarket,
  reviewDispute,
  snapshotProbs,
  syncMarketClocks,
} from "./engine";

function fail(err: unknown): never {
  if (err instanceof EngineError) throw err;
  throw err;
}

const marketIdSchema = z.object({ marketId: z.string().min(1) });

type MarketListRow = {
  id: string;
  title: string;
  status: string;
  market_type: string;
  closes_at: string;
  opens_at: string;
  owner_user_id: string;
  owner_name: string;
  team_id: string | null;
  team_name: string | null;
  kpi_name: string | null;
  featured: boolean;
  privacy: string;
  scope: string;
  subject_user_id: string | null;
  liquidity_b: string | number;
  volume: number | string;
  participants: number | string;
};

async function toCards(actor: Actor, rows: MarketListRow[]) {
  const sql = await getSql();
  const cards = [];
  for (const row of rows) {
    if (
      !canViewMarket(
        { role: actor.role, userId: actor.userId, teamId: actor.teamId },
        {
          privacy: row.privacy as "public_org" | "team_only" | "restricted",
          teamId: row.team_id,
          subjectUserId: row.subject_user_id,
          ownerUserId: row.owner_user_id,
          status: row.status,
        },
      )
    ) {
      continue;
    }
    const outcomes = await loadOutcomes(sql, row.id);
    const b = parseNumeric(row.liquidity_b);
    const probs = bookProbabilities(outcomes, b);
    const primaryIndex = probs.reduce((best, p, i) => (p > (probs[best] ?? -1) ? i : best), 0);
    const primary = outcomes[primaryIndex] ? probs[primaryIndex] ?? 0 : 0;
    cards.push({
      id: row.id,
      title: row.title,
      status: row.status,
      marketType: row.market_type,
      closesAt: toIso(row.closes_at),
      opensAt: toIso(row.opens_at),
      ownerName: row.owner_name,
      teamName: row.team_name,
      kpiName: row.kpi_name,
      featured: row.featured,
      privacy: row.privacy,
      scope: row.scope,
      primaryProb: primary,
      primaryLabel: outcomes[primaryIndex]?.label ?? "Yes",
      outcomes: outcomes.map((o, i) => ({
        id: o.id,
        key: o.key,
        label: o.label,
        prob: probs[i] ?? 0,
      })),
      volumeMilli: parseNumeric(row.volume),
      participantCount: parseNumeric(row.participants),
    });
  }
  return cards;
}

const listSql = `
  select m.id, m.title, m.status, m.market_type, m.closes_at, m.opens_at, m.owner_user_id,
         u.name as owner_name, m.team_id, t.name as team_name, k.name as kpi_name,
         m.featured, m.privacy, m.scope, m.subject_user_id, m.liquidity_b,
         coalesce((select sum(abs(cost_milli)) from trades tr where tr.market_id = m.id),0) as volume,
         coalesce((select count(distinct user_id) from trades tr where tr.market_id = m.id),0) as participants
    from markets m
    join "user" u on u.id = m.owner_user_id
    left join teams t on t.id = m.team_id
    left join kpis k on k.id = m.kpi_id
`;

export const ensureDemoReady = createServerFn({ method: "POST" }).handler(async () => {
  await ensureSeeded();
  return { ok: true };
});

export const getBootstrap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await syncMarketClocks(sql);
    const unread = await sql.query<{ n: number }>(
      `select count(*)::int as n from notifications where user_id = $1 and read_at is null`,
      [actor.userId],
    );
    const gov = await sql.query<{
      leaderboard_visibility: string;
      employment_disclaimer: string;
      comments_enabled: boolean;
      auto_resolve_enabled: boolean;
      individual_markets_enabled: boolean;
      max_position_milli: number;
      default_allocation_milli: number;
    }>(`select * from governance where org_id = $1`, [actor.orgId]);
    return {
      actor,
      unread: parseNumeric(unread[0]?.n),
      governance: gov[0] ?? null,
    };
  });

export const acceptConduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ conflictDisclosed: z.boolean() }))
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await sql.query(
      `update memberships set accepted_conduct_at = now(), conflict_disclosed = $2 where user_id = $1 and org_id = $3`,
      [actor.userId, data.conflictDisclosed, actor.orgId],
    );
    await audit(sql, actor.orgId, actor.userId, "conduct.accept", "membership", actor.userId, {
      conflictDisclosed: data.conflictDisclosed,
    });
    return { ok: true };
  });

export const listMarkets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      q: z.string().optional(),
      status: z.string().optional(),
      teamId: z.string().optional(),
      kpiId: z.string().optional(),
      type: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await syncMarketClocks(sql);
    const clauses = ["m.org_id = $1"];
    const params: unknown[] = [actor.orgId];
    if (data.status && data.status !== "all") {
      params.push(data.status);
      clauses.push(`m.status = $${params.length}`);
    }
    if (data.teamId) {
      params.push(data.teamId);
      clauses.push(`m.team_id = $${params.length}`);
    }
    if (data.kpiId) {
      params.push(data.kpiId);
      clauses.push(`m.kpi_id = $${params.length}`);
    }
    if (data.type) {
      params.push(data.type);
      clauses.push(`m.market_type = $${params.length}`);
    }
    if (data.q?.trim()) {
      params.push(`%${data.q.trim()}%`);
      clauses.push(`(m.title ilike $${params.length} or m.description ilike $${params.length})`);
    }
    const rows = await sql.query<MarketListRow>(
      `${listSql} where ${clauses.join(" and ")} order by m.featured desc, m.closes_at asc`,
      params,
    );
    return toCards(actor, rows);
  });

export const getMarket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(marketIdSchema)
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await syncMarketClocks(sql);
    const rows = await sql.query<
      MarketListRow & {
        description: string;
        resolution_statement: string;
        data_source: string;
        measurement_period: string;
        eligibility: string;
        auto_resolve: boolean;
        comments_enabled: boolean;
        max_position_milli: number;
        cancel_reason: string | null;
        created_by: string;
        kpi_id: string | null;
        liquidity_b2: string | number;
      }
    >(
      `select m.id, m.title, m.status, m.market_type, m.closes_at, m.opens_at, m.owner_user_id,
              u.name as owner_name, m.team_id, t.name as team_name, k.name as kpi_name,
              m.featured, m.privacy, m.scope, m.subject_user_id, m.liquidity_b,
              coalesce((select sum(abs(cost_milli)) from trades tr where tr.market_id = m.id),0) as volume,
              coalesce((select count(distinct user_id) from trades tr where tr.market_id = m.id),0) as participants,
              m.description, m.resolution_statement, m.data_source, m.measurement_period,
              m.eligibility, m.auto_resolve, m.comments_enabled, m.max_position_milli, m.cancel_reason,
              m.created_by, m.kpi_id
         from markets m
         join "user" u on u.id = m.owner_user_id
         left join teams t on t.id = m.team_id
         left join kpis k on k.id = m.kpi_id
        where m.id = $1`,
      [data.marketId],
    );
    const row = rows[0];
    if (!row) throw new EngineError("Market not found", 404);
    if (
      !canViewMarket(
        { role: actor.role, userId: actor.userId, teamId: actor.teamId },
        {
          privacy: row.privacy as "public_org" | "team_only" | "restricted",
          teamId: row.team_id,
          subjectUserId: row.subject_user_id,
          ownerUserId: row.owner_user_id,
          status: row.status,
        },
      )
    ) {
      throw new EngineError("You do not have access to this market.", 403);
    }
    const outcomes = await loadOutcomes(sql, row.id);
    const b = parseNumeric(row.liquidity_b);
    const probs = bookProbabilities(outcomes, b);
    const ticks = await sql.query<{ captured_at: string; probs: unknown }>(
      `select captured_at, probs from probability_ticks where market_id = $1 order by captured_at asc`,
      [row.id],
    );
    const trades = await sql.query<{
      id: string;
      user_name: string;
      outcome_label: string;
      side: string;
      shares: string | number;
      cost_milli: number;
      prob_after: string | number;
      created_at: string;
    }>(
      `select tr.id, u.name as user_name, o.label as outcome_label, tr.side, tr.shares, tr.cost_milli, tr.prob_after, tr.created_at
         from trades tr
         join "user" u on u.id = tr.user_id
         join market_outcomes o on o.id = tr.outcome_id
        where tr.market_id = $1
        order by tr.created_at desc
        limit 40`,
      [row.id],
    );
    const comments = await sql.query<{
      id: string;
      user_name: string;
      body: string;
      anonymous: boolean;
      created_at: string;
    }>(
      `select c.id, u.name as user_name, c.body, c.anonymous, c.created_at
         from comments c join "user" u on u.id = c.user_id
        where c.market_id = $1 order by c.created_at desc limit 30`,
      [row.id],
    );
    const positions = await sql.query<{
      outcome_id: string;
      shares: string | number;
      cost_basis_milli: number;
      label: string;
    }>(
      `select p.outcome_id, p.shares, p.cost_basis_milli, o.label
         from positions p join market_outcomes o on o.id = p.outcome_id
        where p.market_id = $1 and p.user_id = $2 and p.shares > 0`,
      [row.id, actor.userId],
    );
    const auditRows = await sql.query<{ action: string; created_at: string; actor_user_id: string }>(
      `select action, created_at, actor_user_id from audit_events
        where entity_type = 'market' and entity_id = $1 order by created_at desc limit 40`,
      [row.id],
    );
    const resolution = await sql.query<{
      source_value: string;
      note: string | null;
      auto: boolean;
      resolved_at: string;
      winning_outcome_id: string;
    }>(`select source_value, note, auto, resolved_at, winning_outcome_id from resolutions where market_id = $1 order by resolved_at desc limit 1`, [
      row.id,
    ]);
    const disputes = await sql.query<{
      id: string;
      reason: string;
      status: string;
      admin_note: string | null;
      opened_by: string;
      created_at: string;
    }>(`select id, reason, status, admin_note, opened_by, created_at from disputes where market_id = $1 order by created_at desc`, [
      row.id,
    ]);
    const related = await sql.query<MarketListRow>(
      `${listSql} where m.org_id = $1 and m.id <> $2 and m.status in ('open','upcoming','closed') order by m.closes_at asc limit 4`,
      [actor.orgId, row.id],
    );
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      marketType: row.market_type,
      closesAt: toIso(row.closes_at),
      opensAt: toIso(row.opens_at),
      ownerName: row.owner_name,
      teamName: row.team_name,
      kpiName: row.kpi_name,
      featured: row.featured,
      privacy: row.privacy,
      scope: row.scope,
      resolutionStatement: row.resolution_statement,
      dataSource: row.data_source,
      period: row.measurement_period,
      eligibility: row.eligibility,
      autoResolve: row.auto_resolve,
      commentsEnabled: row.comments_enabled,
      maxPositionMilli: parseNumeric(row.max_position_milli),
      cancelReason: row.cancel_reason,
      liquidityB: b,
      volumeMilli: parseNumeric(row.volume),
      participantCount: parseNumeric(row.participants),
      canManage: canManageMarkets(actor.role),
      outcomes: outcomes.map((o, i) => ({
        id: o.id,
        key: o.key,
        label: o.label,
        quantity: parseNumeric(o.quantity),
        prob: probs[i] ?? 0,
        isWinner: o.is_winner,
      })),
      ticks: ticks.map((t) => ({
        at: t.captured_at,
        probs: (typeof t.probs === "string" ? JSON.parse(t.probs) : t.probs) as Record<string, number>,
      })),
      trades: trades.map((t) => ({
        id: t.id,
        userName: t.user_name,
        outcome: t.outcome_label,
        side: t.side,
        shares: parseNumeric(t.shares),
        costMilli: parseNumeric(t.cost_milli),
        probAfter: parseNumeric(t.prob_after),
        createdAt: toIso(t.created_at),
      })),
      comments: comments.map((c) => ({
        id: c.id,
        author: c.anonymous ? "Anonymous" : c.user_name,
        body: c.body,
        createdAt: toIso(c.created_at),
      })),
      myPositions: positions.map((p) => ({
        outcomeId: p.outcome_id,
        label: p.label,
        shares: parseNumeric(p.shares),
        costBasisMilli: parseNumeric(p.cost_basis_milli),
      })),
      audit: auditRows,
      resolution: resolution[0] ?? null,
      disputes,
      related: await toCards(actor, related),
      balanceMilli: actor.balanceMilli,
      role: actor.role,
    };
  });

export const quotePosition = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      marketId: z.string(),
      outcomeId: z.string(),
      side: z.enum(["buy", "sell"]),
      spendMilli: z.number().optional(),
      shares: z.number().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    const market = await sql.query<{ liquidity_b: string | number; status: string }>(
      `select liquidity_b, status from markets where id = $1`,
      [data.marketId],
    );
    if (!market[0]) throw new EngineError("Market not found", 404);
    const outcomes = await loadOutcomes(sql, data.marketId);
    const index = outcomes.findIndex((o) => o.id === data.outcomeId);
    if (index < 0) throw new EngineError("Unknown outcome");
    const b = parseNumeric(market[0].liquidity_b);
    const quantities = outcomes.map((o) => parseNumeric(o.quantity));
    let shares = data.shares ?? 0;
    if (data.side === "buy" && data.spendMilli) {
      shares = sharesForBudget(quantities, index, data.spendMilli / 1000, b);
    }
    if (!(shares > 0)) throw new EngineError("Enter an amount to preview the forecast.");
    const quote = data.side === "buy" ? quoteBuy(quantities, index, shares, b) : quoteSell(quantities, index, shares, b);
    return { ...quote, balanceMilli: actor.balanceMilli };
  });

export const placeTrade = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      marketId: z.string(),
      outcomeId: z.string(),
      side: z.enum(["buy", "sell"]),
      spendMilli: z.number().optional(),
      shares: z.number().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    try {
      const actor = await getActor(context.userId);
      const sql = await getSql();
      const quote = await executeTrade(sql, actor, data);
      const fresh = await getActor(context.userId);
      return { quote, balanceMilli: fresh.balanceMilli };
    } catch (err) {
      fail(err);
    }
  });

export const createMarket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      title: z.string().min(8).max(220),
      description: z.string().min(20).max(5000),
      marketType: z.enum(["binary", "multiple_choice", "numeric_range"]),
      outcomes: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).min(2).max(8),
      scope: z.enum(["organization", "team", "individual"]),
      teamId: z.string().nullable(),
      subjectUserId: z.string().nullable(),
      privacy: z.enum(["public_org", "team_only", "restricted"]),
      kpiId: z.string().nullable(),
      period: z.string().min(2),
      resolutionStatement: z.string().min(40),
      dataSource: z.string().min(4),
      opensAt: z.string(),
      closesAt: z.string(),
      resolveAfter: z.string(),
      liquidityB: z.number().min(10).max(2000),
      maxPositionPoints: z.number().min(50),
      eligibility: z.enum(["all", "team", "managers"]),
      startingYesProb: z.number().min(0.05).max(0.95).optional(),
      featured: z.boolean(),
      autoResolve: z.boolean(),
      publish: z.boolean(),
      subjectConsent: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    if (!canManageMarkets(actor.role)) throw new EngineError("Only market administrators can create markets.", 403);
    const banned = forbiddenTopicReason(`${data.title}\n${data.description}\n${data.resolutionStatement}`);
    if (banned) throw new EngineError(banned);
    if (data.scope === "individual" && !data.subjectConsent) {
      throw new EngineError("Individual-performance markets require documented consent.");
    }
    if (new Date(data.closesAt) <= new Date(data.opensAt)) {
      throw new EngineError("Close time must be after open time.");
    }
    const sql = await getSql();
    const id = newId("mkt");
    const status = data.publish ? (new Date(data.opensAt) <= new Date() ? "open" : "upcoming") : "draft";
    await sql.query(
      `insert into markets (
          id, org_id, created_by, owner_user_id, title, description, market_type, status, scope,
          team_id, subject_user_id, subject_consent_at, privacy, kpi_id, measurement_period,
          resolution_statement, data_source, opens_at, closes_at, resolve_after, liquidity_b,
          max_position_milli, eligibility, featured, comments_enabled, auto_resolve, published_at
       ) values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,true,$24,$25)`,
      [
        id,
        actor.orgId,
        actor.userId,
        data.title,
        data.description,
        data.marketType,
        status,
        data.scope,
        data.teamId,
        data.subjectUserId,
        data.subjectConsent ? new Date().toISOString() : null,
        data.privacy,
        data.kpiId,
        data.period,
        data.resolutionStatement,
        data.dataSource,
        data.opensAt,
        data.closesAt,
        data.resolveAfter,
        data.liquidityB,
        Math.round(data.maxPositionPoints * 1000),
        data.eligibility,
        data.featured,
        data.autoResolve,
        data.publish ? new Date().toISOString() : null,
      ],
    );
    const probs =
      data.marketType === "binary"
        ? [data.startingYesProb ?? 0.5, 1 - (data.startingYesProb ?? 0.5)]
        : data.outcomes.map(() => 1 / data.outcomes.length);
    const qs =
      data.marketType === "binary"
        ? quantitiesForBinaryProb(data.startingYesProb ?? 0.5, data.liquidityB)
        : quantitiesForProbs(probs, data.liquidityB);
    let order = 0;
    for (const outcome of data.outcomes) {
      await sql.query(
        `insert into market_outcomes (id, market_id, key, label, sort_order, quantity) values ($1,$2,$3,$4,$5,$6)`,
        [newId("out"), id, outcome.key, outcome.label, order, (qs[order] ?? 0).toFixed(8)],
      );
      order += 1;
    }
    const outcomes = await loadOutcomes(sql, id);
    await snapshotProbs(sql, id, outcomes, data.liquidityB);
    await audit(sql, actor.orgId, actor.userId, data.publish ? "market.publish" : "market.draft", "market", id, {
      title: data.title,
    });
    if (data.publish) {
      const members = await sql.query<{ user_id: string }>(`select user_id from memberships where org_id = $1`, [actor.orgId]);
      for (const m of members) {
        await notify(sql, m.user_id, "market_new", "New forecast published", data.title, `/markets/${id}`);
      }
    }
    return { id };
  });

export const setMarketStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ marketId: z.string(), status: z.enum(["open", "paused", "upcoming"]), publish: z.boolean().optional() }))
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    if (!canManageMarkets(actor.role)) throw new EngineError("Not allowed", 403);
    const sql = await getSql();
    await sql.query(`update markets set status = $2, published_at = coalesce(published_at, now()), updated_at = now() where id = $1`, [
      data.marketId,
      data.status,
    ]);
    await audit(sql, actor.orgId, actor.userId, "market.status", "market", data.marketId, { status: data.status });
    return { ok: true };
  });

export const resolveMarketFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      marketId: z.string(),
      winningOutcomeId: z.string(),
      sourceValue: z.string().min(2),
      note: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await resolveMarket(sql, actor, data.marketId, data.winningOutcomeId, data.sourceValue, data.note ?? "", false);
    return { ok: true };
  });

export const cancelMarketFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ marketId: z.string(), reason: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await cancelMarket(sql, actor, data.marketId, data.reason);
    return { ok: true };
  });

export const openDisputeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ marketId: z.string(), reason: z.string().min(12) }))
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    const id = await openDispute(sql, actor, data.marketId, data.reason);
    return { id };
  });

export const reviewDisputeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      disputeId: z.string(),
      decision: z.enum(["upheld", "dismissed", "overturned"]),
      adminNote: z.string().min(4),
      winningOutcomeId: z.string().optional(),
      sourceValue: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await reviewDispute(sql, actor, data.disputeId, data.decision, data.adminNote, data.winningOutcomeId, data.sourceValue);
    return { ok: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ marketId: z.string(), body: z.string().min(4).max(2000), anonymous: z.boolean() }))
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await sql.query(`insert into comments (id, market_id, user_id, body, anonymous) values ($1,$2,$3,$4,$5)`, [
      newId("cmt"),
      data.marketId,
      actor.userId,
      data.body,
      data.anonymous,
    ]);
    return { ok: true };
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    return sql.query<{
      id: string;
      type: string;
      title: string;
      body: string;
      href: string | null;
      read_at: string | null;
      created_at: string;
    }>(`select id, type, title, body, href, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 50`, [
      actor.userId,
    ]);
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await sql.query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [actor.userId]);
    return { ok: true };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    await syncMarketClocks(sql);
    const open = await sql.query<MarketListRow>(
      `${listSql} where m.org_id = $1 and m.status in ('open','upcoming') order by m.featured desc, m.closes_at asc limit 12`,
      [actor.orgId],
    );
    const active = await sql.query<MarketListRow>(
      `${listSql} where m.org_id = $1 and m.status = 'open' order by volume desc limit 5`,
      [actor.orgId],
    );
    const closing = await sql.query<MarketListRow>(
      `${listSql} where m.org_id = $1 and m.status = 'open' order by m.closes_at asc limit 5`,
      [actor.orgId],
    );
    const resolved = await sql.query<{
      title: string;
      source_value: string;
      resolved_at: string;
      winner: string;
    }>(
      `select m.title, r.source_value, r.resolved_at, o.label as winner
         from resolutions r
         join markets m on m.id = r.market_id
         join market_outcomes o on o.id = r.winning_outcome_id
        where m.org_id = $1
        order by r.resolved_at desc limit 6`,
      [actor.orgId],
    );
    const flags = await sql.query<{ n: number }>(
      `select count(*)::int as n from disputes d join markets m on m.id = d.market_id where m.org_id = $1 and d.status in ('open','under_review')`,
      [actor.orgId],
    );
    const pnl = actor.balanceMilli - actor.allocatedMilli;
    return {
      actor,
      pnl,
      open: await toCards(actor, open),
      active: await toCards(actor, active),
      closing: await toCards(actor, closing),
      resolved,
      openDisputes: parseNumeric(flags[0]?.n),
    };
  });

export const getPortfolio = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    const positions = await sql.query<{
      market_id: string;
      title: string;
      status: string;
      label: string;
      shares: string | number;
      cost_basis_milli: number;
      outcome_id: string;
    }>(
      `select p.market_id, m.title, m.status, o.label, p.shares, p.cost_basis_milli, p.outcome_id
         from positions p
         join markets m on m.id = p.market_id
         join market_outcomes o on o.id = p.outcome_id
        where p.user_id = $1 and p.shares > 0
        order by m.closes_at asc`,
      [actor.userId],
    );
    const ledger = await sql.query<{
      id: string;
      amount_milli: number;
      balance_after_milli: number;
      kind: string;
      note: string | null;
      created_at: string;
    }>(
      `select id, amount_milli, balance_after_milli, kind, note, created_at
         from wallet_ledger where user_id = $1 order by created_at desc limit 40`,
      [actor.userId],
    );
    const trades = await sql.query<{
      id: string;
      title: string;
      side: string;
      label: string;
      cost_milli: number;
      created_at: string;
    }>(
      `select tr.id, m.title, tr.side, o.label, tr.cost_milli, tr.created_at
         from trades tr join markets m on m.id = tr.market_id
         join market_outcomes o on o.id = tr.outcome_id
        where tr.user_id = $1 order by tr.created_at desc limit 30`,
      [actor.userId],
    );
    return {
      balanceMilli: actor.balanceMilli,
      allocatedMilli: actor.allocatedMilli,
      pnlMilli: actor.balanceMilli - actor.allocatedMilli,
      positions: positions.map((p) => ({
        marketId: p.market_id,
        title: p.title,
        status: p.status,
        label: p.label,
        shares: parseNumeric(p.shares),
        costBasisMilli: parseNumeric(p.cost_basis_milli),
      })),
      ledger,
      trades,
    };
  });

export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    const gov = await sql.query<{ leaderboard_visibility: string }>(`select leaderboard_visibility from governance where org_id = $1`, [
      actor.orgId,
    ]);
    const visibility = gov[0]?.leaderboard_visibility ?? "org";
    const rows = await sql.query<{
      user_id: string;
      name: string;
      team_name: string | null;
      role: string;
      balance_milli: number;
      allocated_milli: number;
      trades: number | string;
      resolved_markets: number | string;
      correct: number | string;
    }>(
      `select m.user_id, u.name, t.name as team_name, m.role, w.balance_milli, w.allocated_milli,
              (select count(*) from trades tr where tr.user_id = m.user_id) as trades,
              (select count(distinct p.market_id) from positions p join markets mk on mk.id = p.market_id where p.user_id = m.user_id and mk.status in ('resolved','disputed')) as resolved_markets,
              (select count(*) from positions p
                 join market_outcomes o on o.id = p.outcome_id
                 join markets mk on mk.id = p.market_id
                where p.user_id = m.user_id and mk.status = 'resolved' and o.is_winner = true and p.shares > 0) as correct
         from memberships m
         join "user" u on u.id = m.user_id
         join wallets w on w.user_id = m.user_id and w.org_id = m.org_id
         left join teams t on t.id = m.team_id
        where m.org_id = $1 and m.role <> 'observer'
        order by (w.balance_milli - w.allocated_milli) desc`,
      [actor.orgId],
    );
    const mapped = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      name: visibility === "private" && r.user_id !== actor.userId ? "Hidden" : r.name,
      teamName: r.team_name,
      role: r.role,
      pnlMilli: parseNumeric(r.balance_milli) - parseNumeric(r.allocated_milli),
      trades: parseNumeric(r.trades),
      resolved: parseNumeric(r.resolved_markets),
      correct: parseNumeric(r.correct),
      isYou: r.user_id === actor.userId,
    }));
    const filtered =
      visibility === "team" && actor.teamId
        ? mapped.filter((r) => r.teamName === actor.teamName || r.isYou)
        : mapped;
    return { visibility, rows: filtered, you: actor };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!canViewAdmin(actor.role)) throw new EngineError("Administrator access required.", 403);
    const sql = await getSql();
    const users = await sql.query<{
      user_id: string;
      name: string;
      email: string;
      role: string;
      title: string;
      team_name: string | null;
      balance_milli: number;
      accepted_conduct_at: string | null;
    }>(
      `select m.user_id, u.name, u.email, m.role, m.title, t.name as team_name, w.balance_milli, m.accepted_conduct_at
         from memberships m
         join "user" u on u.id = m.user_id
         join wallets w on w.user_id = m.user_id
         left join teams t on t.id = m.team_id
        where m.org_id = $1
        order by u.name`,
      [actor.orgId],
    );
    const teams = await sql.query<{ id: string; name: string; region: string; focus: string; n: number }>(
      `select t.id, t.name, t.region, t.focus, count(m.id)::int as n
         from teams t left join memberships m on m.team_id = t.id
        where t.org_id = $1 group by t.id order by t.name`,
      [actor.orgId],
    );
    const kpis = await sql.query<{ id: string; key: string; name: string; unit: string; description: string }>(
      `select id, key, name, unit, description from kpis where org_id = $1`,
      [actor.orgId],
    );
    const gov = await sql.query<{
      org_id: string;
      default_allocation_milli: number;
      max_position_milli: number;
      max_loss_milli: number;
      leaderboard_visibility: string;
      data_retention_days: number;
      comments_enabled: boolean;
      auto_resolve_enabled: boolean;
      individual_markets_enabled: boolean;
      voluntary_participation: boolean;
      employment_disclaimer: string;
      banned_topics: string;
    }>(`select * from governance where org_id = $1`, [actor.orgId]);
    const templates = await sql.query<{
      id: string;
      org_id: string;
      name: string;
      title_pattern: string;
      market_type: string;
      resolution_pattern: string;
      default_b: string;
      kpi_key: string | null;
    }>(`select * from market_templates where org_id = $1`, [actor.orgId]);
    const disputes = await sql.query<{
      id: string;
      title: string;
      status: string;
      reason: string;
      created_at: string;
    }>(
      `select d.id, m.title, d.status, d.reason, d.created_at
         from disputes d join markets m on m.id = d.market_id
        where m.org_id = $1 order by d.created_at desc`,
      [actor.orgId],
    );
    const auditRows = await sql.query<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      created_at: string;
      actor_user_id: string;
    }>(
      `select id, action, entity_type, entity_id, created_at, actor_user_id
         from audit_events where org_id = $1 order by created_at desc limit 80`,
      [actor.orgId],
    );
    return {
      canAdmin: canAdminOrg(actor.role),
      users,
      teams,
      kpis,
      governance: gov[0],
      templates,
      disputes,
      audit: auditRows,
    };
  });

export const updateRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string(), role: z.enum(["platform_admin", "market_admin", "sales_manager", "participant", "observer"]) }))
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    if (!canAdminOrg(actor.role)) throw new EngineError("Platform admin required.", 403);
    const sql = await getSql();
    await sql.query(`update memberships set role = $2 where user_id = $1 and org_id = $3`, [data.userId, data.role, actor.orgId]);
    await audit(sql, actor.orgId, actor.userId, "user.role", "user", data.userId, { role: data.role });
    return { ok: true };
  });

export const allocatePoints = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string(), points: z.number().min(1).max(100000) }))
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    if (!canAdminOrg(actor.role)) throw new EngineError("Platform admin required.", 403);
    const sql = await getSql();
    const milli = Math.round(data.points * 1000);
    const rows = await sql.query<{ id: string; balance_milli: number }>(
      `update wallets set balance_milli = balance_milli + $1, allocated_milli = allocated_milli + $1, updated_at = now()
        where org_id = $2 and user_id = $3 returning id, balance_milli`,
      [milli, actor.orgId, data.userId],
    );
    if (rows[0]) {
      await sql.query(
        `insert into wallet_ledger (id, wallet_id, user_id, amount_milli, balance_after_milli, kind, note)
         values ($1,$2,$3,$4,$5,'allocation','Admin allocation')`,
        [newId("led"), rows[0].id, data.userId, milli, parseNumeric(rows[0].balance_milli)],
      );
    }
    await audit(sql, actor.orgId, actor.userId, "wallet.allocate", "user", data.userId, { points: data.points });
    return { ok: true };
  });

export const updateGovernance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      leaderboardVisibility: z.enum(["private", "team", "org"]),
      maxPositionMilli: z.number(),
      commentsEnabled: z.boolean(),
      autoResolveEnabled: z.boolean(),
      individualMarketsEnabled: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    if (!canAdminOrg(actor.role)) throw new EngineError("Platform admin required.", 403);
    const sql = await getSql();
    await sql.query(
      `update governance
          set leaderboard_visibility = $2, max_position_milli = $3, comments_enabled = $4,
              auto_resolve_enabled = $5, individual_markets_enabled = $6
        where org_id = $1`,
      [
        actor.orgId,
        data.leaderboardVisibility,
        data.maxPositionMilli,
        data.commentsEnabled,
        data.autoResolveEnabled,
        data.individualMarketsEnabled,
      ],
    );
    await audit(sql, actor.orgId, actor.userId, "governance.update", "org", actor.orgId, data as unknown as Record<string, unknown>);
    return { ok: true };
  });

export const getCrm = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!canViewAdmin(actor.role) && actor.role !== "sales_manager" && actor.role !== "observer") {
      throw new EngineError("CRM view is limited to managers and administrators.", 403);
    }
    const sql = await getSql();
    const teams = await sql.query<{
      name: string;
      region: string;
      focus: string;
      period: string;
      quota_cents: number;
      closed_won_cents: number;
      pipeline_cents: number;
      deal_count: number;
      avg_cycle_days: string;
      team_id: string;
    }>(
      `select t.name, t.region, t.focus, m.period, m.quota_cents, m.closed_won_cents, m.pipeline_cents, m.deal_count, m.avg_cycle_days, t.id as team_id
         from crm_team_metrics m join teams t on t.id = m.team_id
        where m.org_id = $1 order by t.name, m.period`,
      [actor.orgId],
    );
    const reps = await sql.query<{
      id: string;
      name: string;
      team_name: string;
      seat: string;
      pipeline_cents: number;
      closed_won_cents: number;
      ramp_complete: boolean;
    }>(
      `select r.id, r.name, t.name as team_name, r.seat, r.pipeline_cents, r.closed_won_cents, r.ramp_complete
         from crm_reps r join teams t on t.id = r.team_id where r.org_id = $1 order by t.name, r.name`,
      [actor.orgId],
    );
    return { teams, reps };
  });

export const simulateCrmWeek = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!canManageMarkets(actor.role)) throw new EngineError("Not allowed", 403);
    const sql = await getSql();
    await sql.query(
      `update crm_team_metrics
          set closed_won_cents = closed_won_cents + 12000000,
              deal_count = deal_count + 2,
              avg_cycle_days = greatest(38, avg_cycle_days - 1.4),
              pipeline_cents = pipeline_cents + 8000000,
              updated_at = now()
        where team_id = 'tm_alpha' and period = 'Q3 2026'`,
    );
    await sql.query(
      `update crm_team_metrics
          set deal_count = deal_count + 3, closed_won_cents = closed_won_cents + 4500000, updated_at = now()
        where team_id = 'tm_alpha' and period = '2026-08'`,
    );
    await sql.query(`update crm_reps set ramp_complete = true where id = 'rep_harper'`);
    await audit(sql, actor.orgId, actor.userId, "crm.simulate", "crm", "northstar", { action: "advance_week" });
    return { ok: true };
  });

export const runSettlementJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!canManageMarkets(actor.role)) throw new EngineError("Not allowed", 403);
    const sql = await getSql();
    await syncMarketClocks(sql);
    const resolved = await autoResolveReady(sql, actor);
    return { resolved };
  });

export const previewCrmResolve = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(marketIdSchema)
  .handler(async ({ context, data }) => {
    const actor = await getActor(context.userId);
    if (!canManageMarkets(actor.role)) throw new EngineError("Not allowed", 403);
    const sql = await getSql();
    const market = (await sql.query(`select * from markets where id = $1`, [data.marketId]))[0] as Parameters<typeof evaluateCrm>[1] | undefined;
    if (!market) throw new EngineError("Market not found", 404);
    return evaluateCrm(sql, market);
  });

export const listLookups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    const sql = await getSql();
    const teams = await sql.query<{ id: string; name: string }>(`select id, name from teams where org_id = $1 order by name`, [actor.orgId]);
    const kpis = await sql.query<{ id: string; name: string; key: string }>(`select id, name, key from kpis where org_id = $1`, [actor.orgId]);
    const people = await sql.query<{ user_id: string; name: string; team_id: string | null }>(
      `select user_id, u.name, team_id from memberships m join "user" u on u.id = m.user_id where m.org_id = $1 order by u.name`,
      [actor.orgId],
    );
    const templates = await sql.query<{ id: string; name: string; title_pattern: string; resolution_pattern: string; market_type: string }>(
      `select id, name, title_pattern, resolution_pattern, market_type from market_templates where org_id = $1`,
      [actor.orgId],
    );
    return { teams, kpis, people, templates };
  });
