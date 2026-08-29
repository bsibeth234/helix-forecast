import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lmsrCost,
  lmsrProbabilities,
  quantitiesForBinaryProb,
  quoteBuy,
  quoteSell,
  sharesForBudget,
} from "./lmsr.ts";
import { pointsToMilli } from "./money.ts";

const EPS = 1e-6;

describe("LMSR", () => {
  it("prices a neutral binary market at 50/50", () => {
    const p = lmsrProbabilities([0, 0], 100);
    assert.ok(Math.abs(p[0]! - 0.5) < EPS);
    assert.ok(Math.abs(p[1]! - 0.5) < EPS);
    assert.ok(Math.abs(lmsrCost([0, 0], 100) - 100 * Math.log(2)) < EPS);
  });

  it("matches the worked b=100, +10 Yes shares example", () => {
    const quote = quoteBuy([0, 0], 0, 10, 100);
    assert.ok(Math.abs(quote.costPoints - 5.124948) < 1e-5);
    assert.ok(Math.abs(quote.probsAfter[0]! - 0.524979) < 1e-5);
    assert.ok(Math.abs(quote.payoutIfWin - 10) < EPS);
    assert.equal(quote.costMilli, pointsToMilli(quote.costPoints));
  });

  it("sells back to the original cost (round trip within rounding)", () => {
    const buy = quoteBuy([0, 0], 0, 10, 100);
    const sell = quoteSell(buy.nextQuantities, 0, 10, 100);
    assert.ok(Math.abs(buy.costPoints - sell.costPoints) < 1e-9);
    assert.ok(Math.abs(sell.probsAfter[0]! - 0.5) < 1e-9);
  });

  it("never produces probabilities outside (0,1) or an unnormalized book", () => {
    const q = [40, -10, 5];
    const p = lmsrProbabilities(q, 25);
    const sum = p.reduce((a, n) => a + n, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12);
    for (const n of p) {
      assert.ok(n > 0 && n < 1);
    }
  });

  it("finds a share count whose cost does not exceed the budget", () => {
    const budget = 20;
    const shares = sharesForBudget([0, 0], 0, budget, 80);
    const quote = quoteBuy([0, 0], 0, shares, 80);
    assert.ok(quote.costPoints <= budget + 1e-6);
    const plus = quoteBuy([0, 0], 0, shares * 1.02, 80);
    assert.ok(plus.costPoints > quote.costPoints);
  });

  it("initializes a binary book at a requested probability", () => {
    const q = quantitiesForBinaryProb(0.7, 120);
    const p = lmsrProbabilities(q, 120);
    assert.ok(Math.abs(p[0]! - 0.7) < 1e-6);
  });

  it("rejects non-positive liquidity and share sizes", () => {
    assert.throws(() => lmsrCost([0, 0], 0));
    assert.throws(() => quoteBuy([0, 0], 0, 0, 10));
    assert.throws(() => quoteBuy([0, 0], 2, 1, 10));
  });
});
