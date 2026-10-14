/**
 * Round to 6 decimal places, matching Python's `round(x, 6)`.
 *
 * Python rounds half to EVEN. JavaScript has no builtin that does: both
 * `Math.round(x * 1e6) / 1e6` and `Number(x.toFixed(6))` round half UP.
 *
 * Over 22,773 values spanning the ratios impact ratios actually take,
 * `toFixed(6)` disagrees with Python on 14, every one an exact binary
 * fraction:
 *
 *   1/128   = 0.0078125   Python 0.007812   toFixed 0.007813
 *   29/128  = 0.2265625   Python 0.226562   toFixed 0.226563
 *   1/256   = 0.00390625  Python 0.003906   toFixed 0.003906  (agrees)
 *
 * A group of 128 candidates with 1 selected produces the first of those
 * rates exactly, so this is reachable in ordinary data rather than
 * contrived.
 *
 * Scaling by 1e6 and inspecting the remainder does not work either: a
 * decimal half such as 0.1234575 is not exactly representable, so
 * `x * 1e6` carries floating-point error and a tie test on it misfires.
 * The decision therefore reads the decimal expansion, and half-to-even
 * applies only where the discarded tail is exactly "5" with nothing after
 * it.
 */
/** Python's `f"{x:.1%}"`: scale by 100, then one decimal, half to even. */
export function formatPercent(x: number): string {
  // Python scales in floating point and then rounds the exact decimal half
  // to even, so 1/16 prints "6.2%" where toFixed would print "6.3%".
  return `${roundHalfEven(x * 100, 1).toFixed(1)}%`;
}

export function round6(x: number): number {
  return roundHalfEven(x, 6);
}

/**
 * Round to `digits` decimal places, half to even, like Python's
 * `round(x, digits)`. `round6` is this with six digits; see its comment for
 * why `toFixed` and `Math.round` cannot be used.
 */
export function roundHalfEven(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  if (x === 0) return 0;

  const grain = 10 ** digits;

  // Read the exact decimal expansion of the double. toFixed never yields
  // exponential notation (which a regex on the default string form would
  // mis-parse for values like 5e-7), and 100 digits is the maximum it
  // allows: enough that near-ties around 1e-6 to 1e-4 (2.5e-6, 3.5e-6,
  // 4.5e-6) are not collapsed into false exact ties. There is deliberately
  // no shortcut for tiny values: a float like 0.05 multiplies by 10 to
  // exactly 0.5 yet is really slightly above a half.
  const text = x.toFixed(100);
  const parts = text.match(/^(-?)(\d+)\.(\d+)$/);
  if (!parts) return Number(x.toFixed(digits));

  const sign = parts[1] === "-" ? -1 : 1;
  const integerPart = parts[2];
  const fraction = parts[3];
  const keep = fraction.slice(0, digits);
  const discarded = fraction.slice(digits);

  let scaled = parseInt(integerPart + keep, 10);
  const firstDiscarded = discarded[0] ?? "0";
  const tail = discarded.slice(1).replace(/0+$/, "");

  if (firstDiscarded > "5" || (firstDiscarded === "5" && tail !== "")) {
    scaled += 1;
  } else if (firstDiscarded === "5" && tail === "") {
    if (scaled % 2 !== 0) scaled += 1; // exact tie: round to even
  }

  return (sign * scaled) / grain;
}
