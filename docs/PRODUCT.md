# Helix — Product specification

Helix is a private, company-operated **forecasting room** for sales organizations. Managers and authorized employees express conviction about measurable sales outcomes using **virtual points**. Points have no cash value, cannot be withdrawn, and cannot be transferred outside the organization.

Helix is a forecasting and gamification tool, not a workplace gambling product.

## Purpose

- Improve forecasting accuracy through scored, accountable predictions.
- Surface collective intelligence about likely performance earlier than CRM snapshots alone.
- Encourage healthy competition between teams without ranking people on sensitive employment outcomes.
- Help leadership see risk and opportunity while there is still time to act.

## Users

| Role | Intent |
| --- | --- |
| Platform administrator | Organization, people, teams, points, governance |
| Market administrator | Create, publish, pause, cancel, resolve markets; review disputes |
| Sales manager | Forecast, monitor team-relevant markets, read team dashboards |
| Participant | Forecast eligible markets, track positions and calibration |
| Observer / executive | Read aggregated forecasts without trading |

## Market types

- Binary yes/no
- Multiple choice (3–8 outcomes)
- Numeric range, stored as labeled buckets

Default scope is **team or organization**. Individual-performance markets require consent, restricted visibility, and cannot be used as the sole basis for employment decisions.

## Trading

Helix uses a **Logarithmic Market Scoring Rule (LMSR)** automated market maker.

- Prices are shown as **probabilities**.
- Buying an outcome raises its implied probability; selling lowers it.
- Each share pays **1 point** if that outcome is resolved true, otherwise 0.
- The interface leads with cost, new probability, and potential payout — not trader jargon.

See [TRADING-MATH.md](./TRADING-MATH.md).

## Guardrails

- Virtual points only. No deposits, withdrawals, cash, crypto, or transferable rewards.
- Voluntary participation and a written conduct code.
- Position and loss limits.
- Forbidden topics: protected characteristics, termination, health, leave, compensation, misconduct allegations, and other sensitive personal matters.
- Transparent resolution criteria and a complete audit trail.
- Cancellation refunds remaining cost basis.
- A dispute window exists after resolution.

## Seeded demonstration

One organization (**Northstar Commerce**), three regional teams, thirteen people across every role, fourteen markets in mixed states, simulated CRM metrics, and a trading history that produces readable probability charts.
