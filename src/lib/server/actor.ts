import { getSql, type Sql } from "@/lib/db";
import { DEMO_ACCOUNTS, ORG_ID } from "@/lib/demo";
import { isRole, type Role } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { ensureSeeded } from "./seed";
import { parseNumeric } from "@/lib/money";
import { toIsoNull } from "@/lib/format";

export type Actor = {
  userId: string;
  name: string;
  email: string | null;
  orgId: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  title: string;
  acceptedConductAt: string | null;
  conflictDisclosed: boolean;
  walletId: string;
  balanceMilli: number;
  allocatedMilli: number;
};

export async function getActor(userId: string): Promise<Actor> {
  await ensureSeeded();
  const sql = await getSql();
  const existing = await loadActor(sql, userId);
  if (existing) return existing;
  await provision(sql, userId);
  const created = await loadActor(sql, userId);
  if (!created) throw new Error("Unable to provision membership");
  return created;
}

async function loadActor(sql: Sql, userId: string): Promise<Actor | null> {
  const rows = await sql.query<{
    user_id: string;
    name: string;
    email: string | null;
    org_id: string;
    role: string;
    team_id: string | null;
    team_name: string | null;
    title: string;
    accepted_conduct_at: string | null;
    conflict_disclosed: boolean;
    wallet_id: string;
    balance_milli: number;
    allocated_milli: number;
  }>(
    `select m.user_id, u.name, u.email, m.org_id, m.role, m.team_id, t.name as team_name,
            m.title, m.accepted_conduct_at, m.conflict_disclosed,
            w.id as wallet_id, w.balance_milli, w.allocated_milli
       from memberships m
       join "user" u on u.id = m.user_id
       join wallets w on w.user_id = m.user_id and w.org_id = m.org_id
       left join teams t on t.id = m.team_id
      where m.user_id = $1
      limit 1`,
    [userId],
  );
  const row = rows[0];
  if (!row || !isRole(row.role)) return null;
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    orgId: row.org_id,
    role: row.role,
    teamId: row.team_id,
    teamName: row.team_name,
    title: row.title,
    acceptedConductAt: toIsoNull(row.accepted_conduct_at),
    conflictDisclosed: row.conflict_disclosed,
    walletId: row.wallet_id,
    balanceMilli: parseNumeric(row.balance_milli),
    allocatedMilli: parseNumeric(row.allocated_milli),
  };
}

async function provision(sql: Sql, userId: string) {
  const users = await sql.query<{ id: string; name: string; email: string | null }>(
    `select id, name, email from "user" where id = $1`,
    [userId],
  );
  const user = users[0];
  if (!user) throw new Error("Unknown user");
  const demo = DEMO_ACCOUNTS.find((a) => a.email === user.email);
  const gov = await sql.query<{ default_allocation_milli: number }>(
    `select default_allocation_milli from governance where org_id = $1`,
    [ORG_ID],
  );
  const allocation = parseNumeric(gov[0]?.default_allocation_milli) || 10_000_000;
  const role: Role = demo?.role ?? "participant";
  const teamId = demo?.teamId ?? null;
  const title = demo?.title ?? "Contributor";
  const membershipId = newId("mem");
  const walletId = newId("wal");
  const accepted = demo?.onboarded ? new Date().toISOString() : null;
  await sql.query(
    `insert into memberships (id, org_id, user_id, team_id, role, title, accepted_conduct_at, conflict_disclosed)
     values ($1,$2,$3,$4,$5,$6,$7,false)
     on conflict (org_id, user_id) do nothing`,
    [membershipId, ORG_ID, userId, teamId, role, title, accepted],
  );
  await sql.query(
    `insert into wallets (id, org_id, user_id, balance_milli, allocated_milli)
     values ($1,$2,$3,$4,$4)
     on conflict (org_id, user_id) do nothing`,
    [walletId, ORG_ID, userId, allocation],
  );
  const wallet = await sql.query<{ id: string; balance_milli: number }>(
    `select id, balance_milli from wallets where org_id = $1 and user_id = $2`,
    [ORG_ID, userId],
  );
  if (wallet[0]) {
    await sql.query(
      `insert into wallet_ledger (id, wallet_id, user_id, amount_milli, balance_after_milli, kind, note)
       values ($1,$2,$3,$4,$4,'allocation','Initial Helix point allocation')`,
      [newId("led"), wallet[0].id, userId, parseNumeric(wallet[0].balance_milli)],
    );
  }
  await sql.query(
    `insert into notifications (id, user_id, type, title, body, href)
     values ($1,$2,'welcome','Welcome to Helix','You have been allocated virtual points to forecast measurable sales outcomes. Points have no cash value.','/onboarding')`,
    [newId("ntf"), userId],
  );
}
