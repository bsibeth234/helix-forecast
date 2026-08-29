# Helix — Implementation plan

## Stack

TanStack Start, React 19, Tailwind v4, Radix/shadcn-style primitives, Postgres via `@/lib/db` (Neon in production, PGLite in preview), Better Auth, Zod, Recharts, node:test.

## Milestones

1. **Foundation** — schema, LMSR + money math with unit tests, permissions, design tokens, auth routes.
2. **Seed & engine** — demo org, CRM adapter, trade/resolve/cancel/dispute, audit + notifications.
3. **App surfaces** — login, onboarding, dashboard, directory, market detail, create wizard, portfolio, leaderboard, admin, CRM, docs.
4. **Verification** — unit tests for math, typecheck, production build, desktop + mobile browser QA of the twelve required journeys.

## Permission model

Every server function uses `authMiddleware`. The verified `context.userId` is resolved to a membership; authorization is role- and org-scoped. Client-supplied user ids are never trusted.

## Market maker

LMSR with log-sum-exp, millipoint rounding, optimistic balance updates, immutable trade + wallet ledgers.

## Status

Prototype implemented and verified: schema, LMSR, seed, trading/resolution, dashboards, admin, CRM sim, docs. Seeded LMSR liquidity is b≈250–450 so featured books stay in a tradable 55–75% range. Typecheck, unit tests, production build, desktop/mobile smoke, and the twelve demo journeys all pass.

