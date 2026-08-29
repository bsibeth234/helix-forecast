# Helix trading mathematics (LMSR)

Helix uses Robin Hanson’s Logarithmic Market Scoring Rule.

## Cost and price

For inventory vector `q` and liquidity `b > 0`:

```
C(q) = b · ln( Σ_i exp(q_i / b) )
p_i  = exp(q_i / b) / Σ_j exp(q_j / b)
```

Implementation uses the log-sum-exp rewrite to avoid overflow.

## Trade

Buying `Δ` shares of outcome `i` costs `C(q + Δ e_i) − C(q)` and raises `p_i`.
Selling is the reverse. Each share pays **1 virtual point** if `i` is the resolved outcome, otherwise 0.

Costs are rounded to millipoints (1 point = 1000 millipoints) with `Math.round`.

## Worked example

`b = 100`, `q = [0, 0]` (50% / 50%).

`C = 100 · ln(2) ≈ 69.3147`

Buy 10 Yes shares:

```
q' = [10, 0]
C' = 100 · ln(e^{0.1} + 1) ≈ 74.4385
cost ≈ 5.1249 points
p_yes' = e^{0.1} / (e^{0.1}+1) ≈ 52.50%
```

If Yes wins, payout = 10 points, profit ≈ 4.90 points.

Selling those 10 shares returns the same 5.1048 points (exact in real arithmetic; millipoint rounding may differ by 0.001).

## Budget to shares

The UI asks for a point budget. Helix binary-searches `Δ` such that `C(q+Δe_i)−C(q) ≤ budget`.

## Limits

- Wallet balance cannot go negative.
- Cost basis on a market cannot exceed the market’s position cap.
- Observers cannot trade.
- Individual-performance markets are consent-gated and hidden from peers.
