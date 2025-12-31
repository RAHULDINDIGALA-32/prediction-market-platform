import Decimal from "decimal.js";

const SCALE = new Decimal("1e18");

// Configure Decimal precision and rounding appropriate for financial calculations.
Decimal.set({ precision: 80, rounding: Decimal.ROUND_HALF_UP });

export function lmsrCost(qYes: bigint, qNo: bigint, b: bigint): bigint {
  // Convert inputs to Decimal using integer values interpreted as base units.
  const qYesD = new Decimal(qYes.toString());
  const qNoD = new Decimal(qNo.toString());
  const bD = new Decimal(b.toString());

  // Compute exponent arguments: q / b
  const a = qYesD.div(bD);
  const c = qNoD.div(bD);

  // exp(a) + exp(c)
  const expA = a.exp();
  const expC = c.exp();
  const sum = expA.plus(expC);

  // ln(sum)
  const lnSum = sum.ln();

  // cost = b * ln(sum)
  const cost = bD.mul(lnSum);

  // Scale cost to fixed-point (SCALE) and return bigint
  const scaled = cost.mul(SCALE).toFixed(0);
  return BigInt(scaled);
}