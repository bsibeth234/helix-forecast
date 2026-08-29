import { hashPassword } from "better-auth/crypto";
import { getSql, type Sql } from "@/lib/db";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ORG_ID } from "@/lib/demo";
import { quantitiesForBinaryProb, quantitiesForProbs } from "@/lib/lmsr";
import { newId } from "@/lib/utils";
import type { Actor } from "./actor";
import { audit, cancelMarket, executeTrade, notify, openDispute, resolveMarket, snapshotProbs } from "./engine";

let seedLock: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedLock) {
    seedLock = seedIfEmpty().catch((err) => {
      seedLock = null;
      throw err;
    });
  }
  return seedLock;
}

function iso(msOffset: number) {
  return new Date(Date.now() + msOffset).toISOString();
}
const day = 86_400_000;

async function seedIfEmpty() {
  const sql = await getSql();
  const existing = await sql.query<{ id: string }>(`select id from organizations where id = $1`, [ORG_ID]);
  if (existing[0]) return;
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const account of DEMO_ACCOUNTS) {
    await sql.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1,$2,$3,true,now(),now())
       on conflict (id) do nothing`,
      [account.id, account.name, account.email],
    );
    await sql.query(
      `insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1,$2,'credential',$3,$4,now(),now())
       on conflict (id) do nothing`,
      [`acc_${account.id}`, account.id, account.id, passwordHash],
    );
  }

  await sql.query(`insert into organizations (id, name, slug) values ($1,$2,$3) on conflict (id) do nothing`, [
    ORG_ID,
    "Northstar Commerce",
    "northstar",
  ]);

  const teams = [
    { id: "tm_alpha", name: "Team Alpha", region: "West", focus: "Enterprise" },
    { id: "tm_bravo", name: "Team Bravo", region: "Central", focus: "Mid-market" },
    { id: "tm_charlie", name: "Team Charlie", region: "East", focus: "Commercial" },
  ];
  for (const team of teams) {
    await sql.query(`insert into teams (id, org_id, name, region, focus) values ($1,$2,$3,$4,$5)`, [
      team.id,
      ORG_ID,
      team.name,
      team.region,
      team.focus,
    ]);
  }

  const allocation = 10_000_000;
  for (const account of DEMO_ACCOUNTS) {
    const accepted = account.onboarded ? iso(-14 * day) : null;
    await sql.query(
      `insert into memberships (id, org_id, user_id, team_id, role, title, accepted_conduct_at, conflict_disclosed)
       values ($1,$2,$3,$4,$5,$6,$7,true)`,
      [`mem_${account.id}`, ORG_ID, account.id, account.teamId, account.role, account.title, accepted],
    );
    await sql.query(`insert into wallets (id, org_id, user_id, balance_milli, allocated_milli) values ($1,$2,$3,$4,$4)`, [
      `wal_${account.id}`,
      ORG_ID,
      account.id,
      allocation,
    ]);
    await sql.query(
      `insert into wallet_ledger (id, wallet_id, user_id, amount_milli, balance_after_milli, kind, note)
       values ($1,$2,$3,$4,$4,'allocation','Initial Helix point allocation')`,
      [`led_alloc_${account.id}`, `wal_${account.id}`, account.id, allocation],
    );
  }

  const kpis = [
    { id: "kpi_quota", key: "quota_attainment", name: "Quota attainment", unit: "percent", crm: "closed_won / quota", desc: "Closed-won revenue divided by approved quota." },
    { id: "kpi_deals", key: "deal_count", name: "Closed-won deals", unit: "count", crm: "deal_count", desc: "Count of closed-won opportunities in the period." },
    { id: "kpi_pipe", key: "pipeline", name: "Qualified pipeline", unit: "currency", crm: "pipeline_cents", desc: "Qualified pipeline generated in the measurement window." },
    { id: "kpi_cycle", key: "cycle_time", name: "Average sales cycle", unit: "days", crm: "avg_cycle_days", desc: "Mean days from opportunity create to close-won." },
    { id: "kpi_ramp", key: "ramp", name: "Ramp milestone", unit: "flag", crm: "ramp_complete", desc: "Whether a new representative has hit the defined ramp bar." },
  ];
  for (const kpi of kpis) {
    await sql.query(
      `insert into kpis (id, org_id, key, name, unit, description, crm_field) values ($1,$2,$3,$4,$5,$6,$7)`,
      [kpi.id, ORG_ID, kpi.key, kpi.name, kpi.unit, kpi.desc, kpi.crm],
    );
  }

  await sql.query(
    `insert into governance (
        org_id, default_allocation_milli, max_position_milli, max_loss_milli,
        leaderboard_visibility, data_retention_days, comments_enabled, auto_resolve_enabled,
        individual_markets_enabled, voluntary_participation, employment_disclaimer, banned_topics
     ) values ($1,$2,$3,$4,'org',365,true,true,true,true,$5,$6)`,
    [
      ORG_ID,
      allocation,
      2_500_000,
      2_500_000,
      "Helix results are a forecasting signal. They must not be the sole basis for hiring, promotion, compensation, or termination decisions.",
      "termination, compensation, health, leave, protected classes, misconduct",
    ],
  );

  await sql.query(
    `insert into market_templates (id, org_id, name, title_pattern, market_type, resolution_pattern, default_b, kpi_key)
     values
      ('tpl_quota',$1,'Team quota','Will {team} achieve at least 100% of its {period} quota?','binary','Resolve Yes if CRM quota attainment for {team} in {period} is at least 100%.',400,'quota_attainment'),
      ('tpl_deals',$1,'Deal count','Will {team} close at least {n} deals in {period}?','binary','Resolve Yes if CRM closed-won deal count for {team} in {period} is at least {n}.',350,'deal_count')`,
    [ORG_ID],
  );

  const crmTeams = [
    { id: "crm_alpha_q3", team: "tm_alpha", period: "Q3 2026", quota: 240_000_000, won: 218_400_000, pipe: 320_000_000, deals: 9, cycle: 47.2 },
    { id: "crm_bravo_q3", team: "tm_bravo", period: "Q3 2026", quota: 180_000_000, won: 187_200_000, pipe: 210_000_000, deals: 14, cycle: 41.0 },
    { id: "crm_charlie_q3", team: "tm_charlie", period: "Q3 2026", quota: 150_000_000, won: 111_000_000, pipe: 168_000_000, deals: 7, cycle: 52.5 },
    { id: "crm_alpha_aug", team: "tm_alpha", period: "2026-08", quota: 800_000_00, won: 612_000_00, pipe: 90_000_000, deals: 9, cycle: 46.0 },
  ];
  for (const row of crmTeams) {
    await sql.query(
      `insert into crm_team_metrics (id, org_id, team_id, period, quota_cents, closed_won_cents, pipeline_cents, deal_count, avg_cycle_days)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.id, ORG_ID, row.team, row.period, row.quota, row.won, row.pipe, row.deals, row.cycle],
    );
  }

  const reps = [
    { id: "rep_morgan", team: "tm_alpha", user: "usr_morgan", name: "Morgan Patel", seat: "Enterprise AE", quota: 80_000_000, pipe: 96_000_000, won: 61_000_000, deals: 3, cycle: 52, ramp: true, hire: "2023-03-12" },
    { id: "rep_quinn", team: "tm_alpha", user: "usr_quinn", name: "Quinn Brooks", seat: "Enterprise AE", quota: 80_000_000, pipe: 88_000_000, won: 54_000_000, deals: 2, cycle: 49, ramp: true, hire: "2022-11-02" },
    { id: "rep_alex", team: "tm_alpha", user: "usr_alex", name: "Alex Romero", seat: "Enterprise AE", quota: 80_000_000, pipe: 110_000_000, won: 72_000_000, deals: 4, cycle: 44, ramp: true, hire: "2021-06-18" },
    { id: "rep_reese", team: "tm_bravo", user: "usr_reese", name: "Reese Alvarez", seat: "Mid-market AE", quota: 60_000_000, pipe: 71_000_000, won: 64_000_000, deals: 5, cycle: 39, ramp: true, hire: "2024-01-08" },
    { id: "rep_taylor", team: "tm_bravo", user: "usr_taylor", name: "Taylor Kim", seat: "Mid-market AE", quota: 60_000_000, pipe: 66_000_000, won: 58_000_000, deals: 4, cycle: 42, ramp: true, hire: "2023-09-19" },
    { id: "rep_jamie", team: "tm_charlie", user: "usr_jamie", name: "Jamie Singh", seat: "Commercial AE", quota: 45_000_000, pipe: 52_000_000, won: 31_000_000, deals: 3, cycle: 51, ramp: true, hire: "2024-04-02" },
    { id: "rep_harper", team: "tm_charlie", user: "usr_harper", name: "Harper Ellis", seat: "New hire AE", quota: 30_000_000, pipe: 22_000_000, won: 4_200_000, deals: 1, cycle: 61, ramp: false, hire: "2026-06-16" },
  ];
  for (const r of reps) {
    await sql.query(
      `insert into crm_reps (id, org_id, team_id, user_id, name, seat, quota_cents, pipeline_cents, closed_won_cents, deal_count, avg_cycle_days, ramp_complete, hire_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [r.id, ORG_ID, r.team, r.user, r.name, r.seat, r.quota, r.pipe, r.won, r.deals, r.cycle, r.ramp, r.hire],
    );
  }

  type SeedOutcome = { key: string; label: string; q: number };
  type SeedMarket = {
    id: string;
    title: string;
    description: string;
    type: "binary" | "multiple_choice" | "numeric_range";
    status: string;
    scope: string;
    teamId: string | null;
    subjectUserId: string | null;
    consent: string | null;
    privacy: string;
    kpiId: string | null;
    period: string;
    resolution: string;
    source: string;
    opens: string;
    closes: string;
    resolveAfter: string;
    b: number;
    maxPos: number;
    eligibility: string;
    featured: boolean;
    auto: boolean;
    owner: string;
    outcomes: SeedOutcome[];
    published: string | null;
    cancelReason?: string;
  };

  const [qYes62, qNo62] = quantitiesForBinaryProb(0.52, 400);
  const [qYes40, qNo40] = quantitiesForBinaryProb(0.45, 350);
  const [qYes70, qNo70] = quantitiesForBinaryProb(0.62, 380);
  const regionQ = quantitiesForProbs([0.34, 0.38, 0.28], 450);
  const cycleQ = quantitiesForProbs([0.12, 0.28, 0.36, 0.24], 350);
  const [qYes55, qNo55] = quantitiesForBinaryProb(0.58, 250);
  const [qYes48, qNo48] = quantitiesForBinaryProb(0.48, 300);
  const [qYes80, qNo80] = quantitiesForBinaryProb(0.78, 350);
  const [qYes33, qNo33] = quantitiesForBinaryProb(0.33, 300);
  const [qYes50, qNo50] = quantitiesForBinaryProb(0.5, 300);
  const [qEven400Yes, qEven400No] = quantitiesForBinaryProb(0.5, 400);
  const [qDispYes, qDispNo] = quantitiesForBinaryProb(0.52, 300);

  const markets: SeedMarket[] = [
    {
      id: "mkt_alpha_q3",
      title: "Will Team Alpha achieve at least 100% of its Q3 quota?",
      description: "Team Alpha’s approved Q3 quota is $2.4M. The live CRM snapshot currently sits below the bar, but late-quarter enterprise slips often concentrate in September. Forecast the final attainment, not the current month-to-date number.",
      type: "binary",
      status: "open",
      scope: "team",
      teamId: "tm_alpha",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_quota",
      period: "Q3 2026",
      resolution: "Resolve “Yes” if the CRM reports that Team Alpha achieved at least 100% of its approved Q3 quota by 11:59 p.m. ET on September 30, 2026. Otherwise, resolve “No.”",
      source: "Simulated CRM · crm_team_metrics.closed_won_cents / quota_cents · Team Alpha · Q3 2026",
      opens: iso(-21 * day),
      closes: iso(32 * day),
      resolveAfter: iso(33 * day),
      b: 400,
      maxPos: 2_500_000,
      eligibility: "all",
      featured: true,
      auto: true,
      owner: "usr_jordan",
      published: iso(-21 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes62 },
        { key: "no", label: "No", q: qNo62 },
      ],
    },
    {
      id: "mkt_alpha_deals",
      title: "Will the enterprise team close at least 12 deals this month?",
      description: "Team Alpha is the enterprise motion. August has historically been slower; twelve closed-won records would be a strong finish. Count is CRM closed-won opportunities with close date in August 2026.",
      type: "binary",
      status: "open",
      scope: "team",
      teamId: "tm_alpha",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_deals",
      period: "2026-08",
      resolution: "Resolve “Yes” if the CRM reports Team Alpha closed at least 12 won deals with a close date in August 2026. Otherwise, resolve “No.”",
      source: "Simulated CRM · crm_team_metrics.deal_count · Team Alpha · 2026-08",
      opens: iso(-18 * day),
      closes: iso(2 * day),
      resolveAfter: iso(3 * day),
      b: 350,
      maxPos: 2_000_000,
      eligibility: "all",
      featured: true,
      auto: true,
      owner: "usr_jordan",
      published: iso(-18 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes40 },
        { key: "no", label: "No", q: qNo40 },
      ],
    },
    {
      id: "mkt_cohort_pipe",
      title: "Will the new sales cohort generate $500,000 in qualified pipeline within 60 days?",
      description: "The June 16 new-hire cohort (Harper Ellis and two ramping seats tracked in CRM) must create $500k of qualified pipeline by day 60. Pipeline is counted when an opportunity reaches stage “Qualified”.",
      type: "binary",
      status: "open",
      scope: "organization",
      teamId: "tm_charlie",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_pipe",
      period: "Cohort 2026-06",
      resolution: "Resolve “Yes” if CRM qualified pipeline created by the June 2026 new-hire cohort is at least $500,000 as of day 60 (August 15, 2026 close of business). Otherwise, resolve “No.”",
      source: "Simulated CRM · cohort pipeline rollup",
      opens: iso(-25 * day),
      closes: iso(8 * day),
      resolveAfter: iso(9 * day),
      b: 380,
      maxPos: 2_000_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: iso(-25 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes70 },
        { key: "no", label: "No", q: qNo70 },
      ],
    },
    {
      id: "mkt_cycle",
      title: "Will average sales-cycle duration fall below 45 days this quarter?",
      description: "Organization-wide mean days from opportunity created to close-won for Q3 2026. Enablement shipped a new mutual-close plan in July.",
      type: "numeric_range",
      status: "open",
      scope: "organization",
      teamId: null,
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_cycle",
      period: "Q3 2026",
      resolution: "Resolve to the CRM bucket that contains the organization-wide average closed-won sales cycle for Q3 2026, measured at 11:59 p.m. ET on September 30, 2026.",
      source: "Simulated CRM · average of crm_team_metrics.avg_cycle_days weighted by deal_count",
      opens: iso(-16 * day),
      closes: iso(30 * day),
      resolveAfter: iso(31 * day),
      b: 350,
      maxPos: 2_000_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: iso(-16 * day),
      outcomes: [
        { key: "lt40", label: "Under 40 days", q: cycleQ[0]! },
        { key: "40_45", label: "40–45 days", q: cycleQ[1]! },
        { key: "45_50", label: "45–50 days", q: cycleQ[2]! },
        { key: "gt50", label: "Over 50 days", q: cycleQ[3]! },
      ],
    },
    {
      id: "mkt_region",
      title: "Which regional team will achieve the highest Q3 quota attainment?",
      description: "Compares Team Alpha (West / Enterprise), Team Bravo (Central / Mid-market), and Team Charlie (East / Commercial). Ties resolve to the team with the higher closed-won dollar amount.",
      type: "multiple_choice",
      status: "open",
      scope: "organization",
      teamId: null,
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_quota",
      period: "Q3 2026",
      resolution: "Resolve to the team whose CRM quota attainment (closed-won ÷ approved quota) is highest for Q3 2026 at 11:59 p.m. ET on September 30, 2026. A tie is broken by higher closed-won revenue.",
      source: "Simulated CRM · crm_team_metrics for Q3 2026",
      opens: iso(-12 * day),
      closes: iso(32 * day),
      resolveAfter: iso(33 * day),
      b: 450,
      maxPos: 2_500_000,
      eligibility: "all",
      featured: true,
      auto: false,
      owner: "usr_jordan",
      published: iso(-12 * day),
      outcomes: [
        { key: "alpha", label: "Team Alpha", q: regionQ[0]! },
        { key: "bravo", label: "Team Bravo", q: regionQ[1]! },
        { key: "charlie", label: "Team Charlie", q: regionQ[2]! },
      ],
    },
    {
      id: "mkt_harper_ramp",
      title: "Will Harper Ellis reach the defined ramp milestone by the end of onboarding?",
      description: "Restricted individual-performance market. Visible to Harper, their manager, and market administrators. The ramp bar is $250k qualified pipeline plus one closed-won deal by day 90.",
      type: "binary",
      status: "open",
      scope: "individual",
      teamId: "tm_charlie",
      subjectUserId: "usr_harper",
      consent: iso(-10 * day),
      privacy: "restricted",
      kpiId: "kpi_ramp",
      period: "Onboarding 2026",
      resolution: "Resolve “Yes” if CRM marks Harper Ellis ramp_complete = true by 11:59 p.m. ET on September 14, 2026 (day 90). Otherwise, resolve “No.”",
      source: "Simulated CRM · crm_reps.ramp_complete · Harper Ellis",
      opens: iso(-10 * day),
      closes: iso(16 * day),
      resolveAfter: iso(17 * day),
      b: 250,
      maxPos: 1_000_000,
      eligibility: "team",
      featured: false,
      auto: true,
      owner: "usr_casey",
      published: iso(-10 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes55 },
        { key: "no", label: "No", q: qNo55 },
      ],
    },
    {
      id: "mkt_bravo_q3",
      title: "Will Team Bravo achieve at least 100% of its Q3 quota?",
      description: "Mid-market team. This market has already closed and is waiting on the CRM settlement job. Current snapshot is above the bar.",
      type: "binary",
      status: "closed",
      scope: "team",
      teamId: "tm_bravo",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_quota",
      period: "Q3 2026",
      resolution: "Resolve “Yes” if the CRM reports Team Bravo achieved at least 100% of its approved Q3 quota. Otherwise, resolve “No.”",
      source: "Simulated CRM · Team Bravo · Q3 2026",
      opens: iso(-40 * day),
      closes: iso(-1 * day),
      resolveAfter: iso(-1 * hour()),
      b: 350,
      maxPos: 2_000_000,
      eligibility: "all",
      featured: false,
      auto: true,
      owner: "usr_jordan",
      published: iso(-40 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes80 },
        { key: "no", label: "No", q: qNo80 },
      ],
    },
    {
      id: "mkt_q2_alpha",
      title: "Did Team Alpha hit 100% of Q2 quota?",
      description: "Historical market used to score calibration. Resolved from Q2 CRM actuals.",
      type: "binary",
      status: "open",
      scope: "team",
      teamId: "tm_alpha",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_quota",
      period: "Q2 2026",
      resolution: "Resolve “Yes” if Team Alpha Q2 quota attainment was at least 100%.",
      source: "Simulated CRM · Team Alpha · Q2 2026",
      opens: iso(-120 * day),
      closes: iso(-50 * day),
      resolveAfter: iso(-49 * day),
      b: 300,
      maxPos: 2_000_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: iso(-120 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes48 },
        { key: "no", label: "No", q: qNo48 },
      ],
    },
    {
      id: "mkt_q2_cycle",
      title: "Did average sales cycle fall below 45 days in Q2?",
      description: "Historical process-metric market. The cycle stayed above the bar.",
      type: "binary",
      status: "open",
      scope: "organization",
      teamId: null,
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_cycle",
      period: "Q2 2026",
      resolution: "Resolve “Yes” if organization average Q2 cycle was below 45 days.",
      source: "Simulated CRM · Q2 2026 cycle",
      opens: iso(-110 * day),
      closes: iso(-50 * day),
      resolveAfter: iso(-49 * day),
      b: 300,
      maxPos: 1_500_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: iso(-110 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes33 },
        { key: "no", label: "No", q: qNo33 },
      ],
    },
    {
      id: "mkt_paused",
      title: "Will the APAC expansion team book $1M in pipeline this quarter?",
      description: "Paused while RevOps investigates a CRM stage-mapping error. Trading is halted; positions remain.",
      type: "binary",
      status: "paused",
      scope: "organization",
      teamId: null,
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_pipe",
      period: "Q3 2026",
      resolution: "Resolve “Yes” if the APAC expansion team’s CRM qualified pipeline created in Q3 is at least $1,000,000.",
      source: "Simulated CRM · APAC expansion (mapping under review)",
      opens: iso(-8 * day),
      closes: iso(28 * day),
      resolveAfter: iso(29 * day),
      b: 300,
      maxPos: 1_500_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: iso(-8 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes50 },
        { key: "no", label: "No", q: qNo50 },
      ],
    },
    {
      id: "mkt_cancel",
      title: "Will the cancelled product launch produce $2M in pipeline?",
      description: "The launch was withdrawn. This market is cancelled and remaining positions are refunded.",
      type: "binary",
      status: "open",
      scope: "organization",
      teamId: null,
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_pipe",
      period: "Q3 2026",
      resolution: "Resolve “Yes” if launch-tagged pipeline is at least $2,000,000.",
      source: "Simulated CRM · launch campaign tag",
      opens: iso(-15 * day),
      closes: iso(20 * day),
      resolveAfter: iso(21 * day),
      b: 300,
      maxPos: 1_500_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: iso(-15 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qYes50 },
        { key: "no", label: "No", q: qNo50 },
      ],
      cancelReason: "Product launch withdrawn; question is no longer measurable.",
    },
    {
      id: "mkt_dispute",
      title: "Did mid-market win rate exceed 28% in July?",
      description: "Resolved, then disputed: a stage-change script may have double-counted two opportunities.",
      type: "binary",
      status: "open",
      scope: "team",
      teamId: "tm_bravo",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_deals",
      period: "2026-07",
      resolution: "Resolve “Yes” if Team Bravo July win rate (won / closed) was greater than 28%.",
      source: "Simulated CRM · July win rate",
      opens: iso(-70 * day),
      closes: iso(-28 * day),
      resolveAfter: iso(-27 * day),
      b: 300,
      maxPos: 1_500_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: iso(-70 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qDispYes },
        { key: "no", label: "No", q: qDispNo },
      ],
    },
    {
      id: "mkt_upcoming",
      title: "Will Team Charlie achieve at least 90% of its Q4 quota?",
      description: "Opens when Q4 planning locks. Eligibility is organization-wide; this is a team-scoped question.",
      type: "binary",
      status: "upcoming",
      scope: "team",
      teamId: "tm_charlie",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_quota",
      period: "Q4 2026",
      resolution: "Resolve “Yes” if Team Charlie Q4 quota attainment is at least 90% by 11:59 p.m. ET on December 31, 2026.",
      source: "Simulated CRM · Team Charlie · Q4 2026",
      opens: iso(5 * day),
      closes: iso(120 * day),
      resolveAfter: iso(121 * day),
      b: 400,
      maxPos: 2_000_000,
      eligibility: "all",
      featured: false,
      auto: true,
      owner: "usr_jordan",
      published: iso(-1 * day),
      outcomes: [
        { key: "yes", label: "Yes", q: qEven400Yes },
        { key: "no", label: "No", q: qEven400No },
      ],
    },
    {
      id: "mkt_draft",
      title: "Will enterprise win rate exceed 22% in September?",
      description: "Draft only — not visible to participants until published.",
      type: "binary",
      status: "draft",
      scope: "team",
      teamId: "tm_alpha",
      subjectUserId: null,
      consent: null,
      privacy: "public_org",
      kpiId: "kpi_deals",
      period: "2026-09",
      resolution: "Resolve “Yes” if Team Alpha September win rate exceeds 22%.",
      source: "Simulated CRM · Team Alpha · September",
      opens: iso(3 * day),
      closes: iso(33 * day),
      resolveAfter: iso(34 * day),
      b: 350,
      maxPos: 1_500_000,
      eligibility: "all",
      featured: false,
      auto: false,
      owner: "usr_jordan",
      published: null,
      outcomes: [
        { key: "yes", label: "Yes", q: 0 },
        { key: "no", label: "No", q: 0 },
      ],
    },
  ];

  for (const market of markets) {
    await sql.query(
      `insert into markets (
          id, org_id, created_by, owner_user_id, title, description, market_type, status, scope,
          team_id, subject_user_id, subject_consent_at, privacy, kpi_id, measurement_period,
          resolution_statement, data_source, opens_at, closes_at, resolve_after, liquidity_b,
          max_position_milli, eligibility, featured, comments_enabled, auto_resolve, published_at
       ) values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,true,$24,$25)`,
      [
        market.id, ORG_ID, market.owner, market.title, market.description, market.type, market.status === "closed" ? "open" : market.status,
        market.scope, market.teamId, market.subjectUserId, market.consent, market.privacy, market.kpiId, market.period,
        market.resolution, market.source, market.opens, market.closes, market.resolveAfter, market.b,
        market.maxPos, market.eligibility, market.featured, market.auto, market.published,
      ],
    );
    let order = 0;
    for (const outcome of market.outcomes) {
      await sql.query(
        `insert into market_outcomes (id, market_id, key, label, sort_order, quantity) values ($1,$2,$3,$4,$5,$6)`,
        [`out_${market.id}_${outcome.key}`, market.id, outcome.key, outcome.label, order, outcome.q.toFixed(8)],
      );
      order += 1;
    }
    const seededOutcomes = await sql.query<{ id: string; key: string; label: string; sort_order: number; quantity: string | number; is_winner: boolean | null }>(
      `select id, key, label, sort_order, quantity, is_winner from market_outcomes where market_id = $1 order by sort_order`,
      [market.id],
    );
    await snapshotProbs(sql, market.id, seededOutcomes, market.b, market.opens);
    await audit(sql, ORG_ID, market.owner, market.published ? "market.publish" : "market.draft", "market", market.id, { title: market.title });
  }

  const actor = (id: string): Actor => {
    const account = DEMO_ACCOUNTS.find((a) => a.id === id)!;
    return {
      userId: id,
      name: account.name,
      email: account.email,
      orgId: ORG_ID,
      role: account.role,
      teamId: account.teamId,
      teamName: teams.find((t) => t.id === account.teamId)?.name ?? null,
      title: account.title,
      acceptedConductAt: account.onboarded ? iso(-14 * day) : null,
      conflictDisclosed: true,
      walletId: `wal_${id}`,
      balanceMilli: allocation,
      allocatedMilli: allocation,
    };
  };

  const trades: Array<{ user: string; market: string; outcome: string; side: "buy" | "sell"; spend: number; at: string }> = [
    { user: "usr_morgan", market: "mkt_alpha_q3", outcome: "yes", side: "buy", spend: 120_000, at: iso(-18 * day) },
    { user: "usr_quinn", market: "mkt_alpha_q3", outcome: "no", side: "buy", spend: 80_000, at: iso(-16 * day) },
    { user: "usr_alex", market: "mkt_alpha_q3", outcome: "yes", side: "buy", spend: 100_000, at: iso(-12 * day) },
    { user: "usr_sam", market: "mkt_alpha_q3", outcome: "yes", side: "buy", spend: 70_000, at: iso(-9 * day) },
    { user: "usr_jordan", market: "mkt_alpha_q3", outcome: "yes", side: "buy", spend: 50_000, at: iso(-6 * day) },
    { user: "usr_reese", market: "mkt_alpha_deals", outcome: "no", side: "buy", spend: 100_000, at: iso(-14 * day) },
    { user: "usr_taylor", market: "mkt_alpha_deals", outcome: "no", side: "buy", spend: 70_000, at: iso(-10 * day) },
    { user: "usr_morgan", market: "mkt_alpha_deals", outcome: "yes", side: "buy", spend: 80_000, at: iso(-7 * day) },
    { user: "usr_casey", market: "mkt_cohort_pipe", outcome: "yes", side: "buy", spend: 90_000, at: iso(-20 * day) },
    { user: "usr_harper", market: "mkt_cohort_pipe", outcome: "no", side: "buy", spend: 40_000, at: iso(-8 * day) },
    { user: "usr_riley", market: "mkt_region", outcome: "bravo", side: "buy", spend: 120_000, at: iso(-10 * day) },
    { user: "usr_sam", market: "mkt_region", outcome: "alpha", side: "buy", spend: 80_000, at: iso(-8 * day) },
    { user: "usr_casey", market: "mkt_region", outcome: "charlie", side: "buy", spend: 50_000, at: iso(-5 * day) },
    { user: "usr_quinn", market: "mkt_cycle", outcome: "45_50", side: "buy", spend: 70_000, at: iso(-9 * day) },
    { user: "usr_alex", market: "mkt_cycle", outcome: "40_45", side: "buy", spend: 60_000, at: iso(-4 * day) },
    { user: "usr_casey", market: "mkt_harper_ramp", outcome: "yes", side: "buy", spend: 40_000, at: iso(-6 * day) },
    { user: "usr_harper", market: "mkt_harper_ramp", outcome: "yes", side: "buy", spend: 30_000, at: iso(-3 * day) },
    { user: "usr_reese", market: "mkt_bravo_q3", outcome: "yes", side: "buy", spend: 90_000, at: iso(-20 * day) },
    { user: "usr_taylor", market: "mkt_bravo_q3", outcome: "yes", side: "buy", spend: 70_000, at: iso(-12 * day) },
    { user: "usr_riley", market: "mkt_bravo_q3", outcome: "yes", side: "buy", spend: 50_000, at: iso(-5 * day) },
    { user: "usr_morgan", market: "mkt_q2_alpha", outcome: "yes", side: "buy", spend: 70_000, at: iso(-80 * day) },
    { user: "usr_quinn", market: "mkt_q2_alpha", outcome: "no", side: "buy", spend: 40_000, at: iso(-70 * day) },
    { user: "usr_alex", market: "mkt_q2_alpha", outcome: "yes", side: "buy", spend: 60_000, at: iso(-60 * day) },
    { user: "usr_sam", market: "mkt_q2_cycle", outcome: "no", side: "buy", spend: 60_000, at: iso(-75 * day) },
    { user: "usr_riley", market: "mkt_q2_cycle", outcome: "yes", side: "buy", spend: 35_000, at: iso(-65 * day) },
    { user: "usr_reese", market: "mkt_dispute", outcome: "yes", side: "buy", spend: 50_000, at: iso(-40 * day) },
    { user: "usr_taylor", market: "mkt_dispute", outcome: "no", side: "buy", spend: 40_000, at: iso(-36 * day) },
    { user: "usr_morgan", market: "mkt_cancel", outcome: "yes", side: "buy", spend: 50_000, at: iso(-12 * day) },
  ];

  for (const trade of trades) {
    const outcomeId = `out_${trade.market}_${trade.outcome}`;
    await executeTrade(sql, actor(trade.user), {
      marketId: trade.market,
      outcomeId,
      side: trade.side,
      spendMilli: trade.spend,
      at: trade.at,
    });
  }

  await sql.query(`update markets set status = 'closed' where id = 'mkt_bravo_q3'`);
  await sql.query(`update markets set status = 'closed' where id in ('mkt_q2_alpha','mkt_q2_cycle','mkt_dispute')`);

  await resolveMarket(sql, actor("usr_jordan"), "mkt_q2_alpha", "out_mkt_q2_alpha_yes", "104.6% quota attainment · Q2 CRM export", "Closed-won $2.51M against $2.40M quota.", false);
  await resolveMarket(sql, actor("usr_jordan"), "mkt_q2_cycle", "out_mkt_q2_cycle_no", "48.4 day average cycle · Q2 CRM export", "Cycle improved but stayed above 45 days.", false);
  await resolveMarket(sql, actor("usr_jordan"), "mkt_dispute", "out_mkt_dispute_yes", "29.1% July win rate", "Initial CRM extract.", false);
  await openDispute(sql, actor("usr_taylor"), "mkt_dispute", "Two July opportunities were double-counted after a stage-mapping script. Win rate should be recalculated from the corrected extract.");

  await cancelMarket(sql, actor("usr_jordan"), "mkt_cancel", "Product launch withdrawn; question is no longer measurable.");

  await sql.query(
    `insert into comments (id, market_id, user_id, body, anonymous) values
      ($1,'mkt_alpha_q3','usr_morgan','Three enterprise slips are in verbal commit with legal redlines. I still think we clear the bar in the last two weeks.', false),
      ($2,'mkt_alpha_q3','usr_quinn','Pipeline coverage is 1.3x with a heavy September weighting. That is thinner than last year.', false),
      ($3,'mkt_alpha_deals','usr_reese','Nine closed with two business days of useful runway. Twelve requires a miracle week.', false),
      ($4,'mkt_region','usr_riley','Bravo is already over quota. The question is whether Alpha’s late enterprise deals overtake us, not whether we finish above 100%.', false)`,
    [newId("cmt"), newId("cmt"), newId("cmt"), newId("cmt")],
  );

  for (const account of DEMO_ACCOUNTS) {
    await notify(sql, account.id, "market_new", "New forecasts in the room", "Q3 quota, August enterprise deals, and the regional race are open for forecasting.", "/markets");
  }
}

function hour() {
  return 3_600_000;
}

