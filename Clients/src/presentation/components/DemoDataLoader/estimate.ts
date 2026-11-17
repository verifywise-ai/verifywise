/**
 * Progress estimate for the demo data loader.
 *
 * The demo data request reports nothing until it finishes, so the bar is an
 * estimate from elapsed time against how long a run usually takes. It eases
 * up to 90% at the expected time, then creeps toward 97% so it keeps moving
 * on a slow server but never claims to be done before the request is.
 */
import { storageService } from "../../../infrastructure/storage";

/** How long seeding usually takes when this browser has never timed a run. */
export const DEFAULT_EXPECTED_MS = 60_000;

const MIN_EXPECTED_MS = 15_000;
const MAX_EXPECTED_MS = 5 * 60_000;

/** Share of the bar reached at the expected time. */
const ON_TIME_SHARE = 0.9;
/** The bar never passes this until the request has finished. */
const CEILING = 0.97;

/** Estimated share done, 0 to 0.97, after `elapsedMs` of a run expected to take `expectedMs`. */
export function estimateProgress(elapsedMs: number, expectedMs: number): number {
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
export function remainingLabel(elapsedMs: number, expectedMs: number): string {
  const left = expectedMs - Math.max(0, elapsedMs);
  if (left > 90_000) return "A couple of minutes left";
  if (left > 50_000) return "About a minute left";
  if (left > 35_000) return "Less than a minute left";
  if (left > 20_000) return "About 30 seconds left";
  if (left > 5_000) return "A few seconds left";
  return "Almost there";
}

/** Expected run time, from the last run this browser timed when there is one. */
export function readExpectedMs(): number {
  try {
    const stored = storageService.get("demoDataSeedMs", 0);
    if (typeof stored === "number" && stored >= MIN_EXPECTED_MS && stored <= MAX_EXPECTED_MS) {
      return stored;
    }
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return DEFAULT_EXPECTED_MS;
}

/** Remembers how long a successful run took, so the next estimate is closer. */
export function recordRunMs(durationMs: number): void {
  if (!(durationMs > 0)) return;
  const clamped = Math.min(MAX_EXPECTED_MS, Math.max(MIN_EXPECTED_MS, Math.round(durationMs)));
  try {
    storageService.set("demoDataSeedMs", clamped);
  } catch {
    // Not worth surfacing; the next run falls back to the default.
  }
}
