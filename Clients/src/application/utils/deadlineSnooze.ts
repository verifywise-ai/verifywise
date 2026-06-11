/**
 * Per-user snooze persistence for the deadline warning banner.
 *
 * Stored under `verifywise_deadline_snooze_<userId>` as `{ snoozeUntil: number }`,
 * where `snoozeUntil` is a Unix epoch (ms) timestamp. The banner is hidden while
 * `Date.now() < snoozeUntil` and reappears automatically once that time passes.
 *
 * All access is wrapped in try/catch so a disabled/full localStorage never breaks
 * the banner (mirrors the pattern in useTipManager / paginationStorage).
 */

interface SnoozeState {
  snoozeUntil: number;
}

const snoozeKey = (userId: number): string => `verifywise_deadline_snooze_${userId}`;

/** Returns the snooze expiry timestamp (ms), or null if not snoozed / unreadable. */
export const getSnoozeExpiry = (userId: number): number | null => {
  try {
    const raw = localStorage.getItem(snoozeKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SnoozeState>;
    return typeof parsed?.snoozeUntil === "number" ? parsed.snoozeUntil : null;
  } catch {
    return null;
  }
};

/** True when the banner is currently snoozed for this user. */
export const isSnoozed = (userId: number): boolean => {
  const expiry = getSnoozeExpiry(userId);
  return expiry !== null && Date.now() < expiry;
};

/** Snooze the banner for `durationMs` from now. */
export const setSnooze = (userId: number, durationMs: number): void => {
  try {
    const state: SnoozeState = { snoozeUntil: Date.now() + durationMs };
    localStorage.setItem(snoozeKey(userId), JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode / quota) — snooze is best-effort.
  }
};

/** Clear any existing snooze for this user. */
export const clearSnooze = (userId: number): void => {
  try {
    localStorage.removeItem(snoozeKey(userId));
  } catch {
    // No-op if storage is unavailable.
  }
};
