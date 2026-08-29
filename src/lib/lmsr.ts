import { MILLI, pointsToMilli } from "./money.ts";

/**
 * Logarithmic Market Scoring Rule (Hanson).
 *
 * Cost C(q) = b * ln(Σ exp(q_i / b))
 * Price p_i = exp(q_i / b) / Σ exp(q_j / b)
 *
 * A share of outcome i pays 1 point if i wins, otherwise 0.
 * Buying Δ shares of i costs C(q + Δ e_i) − C(q) and raises p_i.
 */
export function logSumExp(values: number[]): number {
  if (values.length === 0) return Number.NEGATIVE_INFINITY;
  let max = values[0]!;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i]! > max) max = values[i]!;
  }
  let sum = 0;
  for (const value of values) sum += Math.exp(value - max);
  return max + Math.log(sum);
}

export function lmsrCost(quantities: number[], b: number): number {
  if (!(b > 0)) throw new Error("Liquidity b must be positive");
  return b * logSumExp(quantities.map((q) => q / b));
}

export function lmsrProbabilities(quantities: number[], b: number): number[] {
  if (!(b > 0)) throw new Error("Liquidity b must be positive");
  if (quantities.length === 0) return [];
  const scaled = quantities.map((q) => q / b);
  const lse = logSumExp(scaled);
  const raw = scaled.map((s) => Math.exp(s - lse));
  const total = raw.reduce((a, n) => a + n, 0);
  return raw.map((p) => p / total);
}

export function quantitiesForBinaryProb(probYes: number, b: number): [number, number] {
  const p = Math.min(0.95, Math.max(0.05, probYes));
  const qYes = b * Math.log(p);
  const qNo = b * Math.log(1 - p);
  return [qYes, qNo];
}

export function quantitiesForProbs(probs: number[], b: number): number[] {
  const safe = probs.map((p) => Math.max(1e-6, p));
  const sum = safe.reduce((a, n) => a + n, 0);
  return safe.map((p) => b * Math.log(p / sum));
}

export type Quote = {
  shares: number;
  costPoints: number;
  costMilli: number;
  avgPrice: number;
  probsBefore: number[];
  probsAfter: number[];
  nextQuantities: number[];
  payoutIfWin: number;
  profitIfWin: number;
};

function assertShares(shares: number) {
  if (!(shares > 0) || !Number.isFinite(shares)) {
    throw new Error("Share amount must be a positive number");
  }
}

export function quoteBuy(
  quantities: number[],
  index: number,
  shares: number,
  b: number,
): Quote {
  assertShares(shares);
  if (index < 0 || index >= quantities.length) throw new Error("Unknown outcome");
  const next = quantities.slice();
  next[index] = next[index]! + shares;
  const costPoints = lmsrCost(next, b) - lmsrCost(quantities, b);
  const costMilli = pointsToMilli(costPoints);
  const avgPrice = costPoints / shares;
  return {
    shares,
    costPoints,
    costMilli,
    avgPrice,
    probsBefore: lmsrProbabilities(quantities, b),
    probsAfter: lmsrProbabilities(next, b),
    nextQuantities: next,
    payoutIfWin: shares,
    profitIfWin: shares - costPoints,
  };
}

export function quoteSell(
  quantities: number[],
  index: number,
  shares: number,
  b: number,
): Quote {
  assertShares(shares);
  if (index < 0 || index >= quantities.length) throw new Error("Unknown outcome");
  if (shares > quantities[index]! + 1e-9) {
    throw new Error("Cannot sell more shares than the market holds");
  }
  const next = quantities.slice();
  next[index] = next[index]! - shares;
  const costPoints = lmsrCost(quantities, b) - lmsrCost(next, b);
  const costMilli = pointsToMilli(costPoints);
  const avgPrice = costPoints / shares;
  return {
    shares,
    costPoints,
    costMilli,
    avgPrice,
    probsBefore: lmsrProbabilities(quantities, b),
    probsAfter: lmsrProbabilities(next, b),
    nextQuantities: next,
    payoutIfWin: 0,
    profitIfWin: costPoints,
  };
}

/** Largest share count purchasable with a point budget (binary search). */
export function sharesForBudget(
  quantities: number[],
  index: number,
  budgetPoints: number,
  b: number,
): number {
  if (!(budgetPoints > 0)) return 0;
  let lo = 0;
  let hi = Math.max(budgetPoints * 8, b * 4);
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    const cost = quoteBuy(quantities, index, mid, b).costPoints;
    if (cost <= budgetPoints) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function priceImpact(before: number, after: number): number {
  return after - before;
}

/** Potential payout in millipoints if `shares` of a winning outcome settle at 1 point each. */
export function settlementPayoutMilli(shares: number): number {
  return Math.round(shares * MILLI);
}
