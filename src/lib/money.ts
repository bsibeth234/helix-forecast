/** One point = 1000 millipoints. All persisted balances are integers. */
export const MILLI = 1000;

export function pointsToMilli(points: number): number {
  return Math.round(points * MILLI);
}

export function milliToPoints(milli: number): number {
  return milli / MILLI;
}

export function roundMilli(value: number): number {
  return Math.round(value);
}

export function parseNumeric(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "bigint") return Number(value);
  return 0;
}

export function formatPoints(milli: number, digits = 1): string {
  const points = milliToPoints(milli);
  return points.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSignedPoints(milli: number, digits = 1): string {
  const sign = milli > 0 ? "+" : "";
  return `${sign}${formatPoints(milli, digits)}`;
}

export function formatUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
