const SCALE = 1e18;

export function lmsrCost(qYes: bigint, qNo: bigint, b: bigint): bigint {
  // Convert to numbers; this assumes values are within safe numeric ranges.
  const bNum = Number(b);
  const a = Number(qYes) / bNum;
  const c = Number(qNo) / bNum;

  const expA = Math.exp(a);
  const expC = Math.exp(c);
  const sum = expA + expC;
  const lnSum = Math.log(sum);

  const cost = bNum * lnSum;

  // Return fixed-point scaled value
  const scaled = Math.round(cost * SCALE);
  return BigInt(scaled);
}