/** Private: convert a fractional tolerance (0.03) to integer basis points (300) for bigint maths. */
export function pctToBps(pct: number): bigint {
  return BigInt(Math.round(pct * 10_000));
}
