# Architecture

- **App:** TanStack Start + React 19 + Tailwind v4.
- **Auth:** Better Auth at `/api/auth/*` (Google, X, email/password). `authMiddleware` on every data function.
- **Data:** Postgres via `@/lib/db` (Neon deployed, PGLite in preview). Schema in `migrations/0002_helix.sql`. Seed in `src/lib/server/seed.ts`.
- **Market maker:** `src/lib/lmsr.ts`. Engine: `src/lib/server/engine.ts`.
- **Permissions:** role + privacy checks in `src/lib/permissions.ts`, enforced again in the engine.
- **CRM:** tables `crm_team_metrics` and `crm_reps`. `evaluateCrm` maps KPI keys to Yes/No. `simulateCrmWeek` mutates the sim; `runSettlementJob` auto-resolves closed markets.

No `.env` file is required for the preview. Deploy injects `DATABASE_URL` and auth credentials.
