# Security, privacy, workplace ethics

## Security (this prototype)

- Session auth via Better Auth (Google, X, email/password). Server functions use `authMiddleware` and a verified `userId`.
- Authorization is membership- and role-scoped on the server, not only hidden in the UI.
- Wallets debit with `balance >= cost` so balances cannot go negative.
- No cash rails. No deposits, withdrawals, or transferable assets.

## Privacy

- Organization directory is the default visibility.
- Team-only and restricted individual markets are filtered in the query path.
- Leaderboards can be private, team, or organization. They rank forecasting P&L, not employment ratings.

## Workplace ethics

Helix is a forecasting instrument:

- Virtual points only; no cash value.
- Voluntary participation; a written conduct code.
- Forbidden topics include termination, compensation, health, leave, protected characteristics, and misconduct allegations.
- Individual markets require consent and restricted visibility.
- Results must not be the sole basis for employment decisions.
- Operating activity must not be manipulated to move a market.
- Cancellation refunds remaining cost basis. Disputes are first-class.
- Production deployment requires legal, employment, privacy, and gaming review in each jurisdiction.
