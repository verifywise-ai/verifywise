/**
 * Progress estimate for the demo data loader.
 *
 * The demo data request reports nothing until it finishes, so the bar is an
 * estimate from elapsed time against one pass of the committee (each animal
 * speaks once, about 14 s). It eases up to 90% by then, then creeps toward
 * 97% so it keeps moving on a slow server but never claims to be done before
 * the request is. The animals keep talking for as long as the request runs.
 */
import { ONE_PASS_MS } from "./committee";

/** How long a run is expected to take. */
export const EXPECTED_MS = ONE_PASS_MS;

/** Share of the bar reached at the expected time. */
const ON_TIME_SHARE = 0.9;
/** The bar never passes this until the request has finished. */
const CEILING = 0.97;

/** Estimated share done, 0 to 0.97, after `elapsedMs` of a run expected to take `expectedMs`. */
export function estimateProgress(elapsedMs: number, expectedMs: number = EXPECTED_MS): number {
  if (!(elapsedMs > 0) || !(expectedMs > 0)) return 0;
  const ratio = elapsedMs / expectedMs;
  if (ratio < 1) {
    return ON_TIME_SHARE * (1 - Math.pow(1 - ratio, 1.3));
  }
  return ON_TIME_SHARE + (CEILING - ON_TIME_SHARE) * (1 - Math.exp(-(ratio - 1) * 1.5));
}

/**
 * Plain-language time left. Fixed phrases rather than a live count of seconds,
 * because the DOM translator matches whole strings.
 */
export function remainingLabel(elapsedMs: number, expectedMs: number = EXPECTED_MS): string {
  return expectedMs - Math.max(0, elapsedMs) > 5_000 ? "A few seconds left" : "Almost there";
}
