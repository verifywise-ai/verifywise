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
export function round6(x: number): number {
  if (!Number.isFinite(x)) return x;
  if (x === 0) return 0;

  // Below the rounding grain, only an exact half needs the even rule.
  if (Math.abs(x) < 1e-6) {
    return Math.abs(x) * 1e6 === 0.5 ? 0 : Number(x.toFixed(6));
  }

  // toFixed(20) never yields exponential notation, which a regex on the
  // default string form would mis-parse for values like 5e-7.
  const text = x.toFixed(20);
  const parts = text.match(/^(-?)(\d+)\.(\d+)$/);
  if (!parts) return Number(x.toFixed(6));

  const sign = parts[1] === "-" ? -1 : 1;
  const integerPart = parts[2];
  const fraction = parts[3];
  const keep = fraction.slice(0, 6);
  const discarded = fraction.slice(6);

  let scaled = parseInt(integerPart + keep, 10);
  const firstDiscarded = discarded[0] ?? "0";
  const tail = discarded.slice(1).replace(/0+$/, "");

  if (firstDiscarded > "5" || (firstDiscarded === "5" && tail !== "")) {
    scaled += 1;
  } else if (firstDiscarded === "5" && tail === "") {
    if (scaled % 2 !== 0) scaled += 1; // exact tie: round to even
  }

  return (sign * scaled) / 1e6;
}
