/**
 * Per-user snooze persistence for the deadline warning banner.
 *
 * Stored under `verifywise_deadline_snooze_<userId>` as `{ snoozeUntil: number }`,
 * where `snoozeUntil` is a Unix epoch (ms) timestamp. The banner is hidden while
 * `Date.now() < snoozeUntil` and reappears automatically once that time passes.
 *
 * Access goes through the StorageService, so a disabled/full localStorage never
 * breaks the banner.
 */

import { storageService, dynamicKeys } from "../../infrastructure/storage";

interface SnoozeState {
  snoozeUntil: number;
}

/** Returns the snooze expiry timestamp (ms), or null if not snoozed / unreadable. */
export const getSnoozeExpiry = (userId: number): number | null => {
  const parsed = storageService.getRaw<Partial<SnoozeState> | null>(
    dynamicKeys.deadlineSnooze(userId),
    null,
  );
  return typeof parsed?.snoozeUntil === "number" ? parsed.snoozeUntil : null;
};

/** True when the banner is currently snoozed for this user. */
export const isSnoozed = (userId: number): boolean => {
  const expiry = getSnoozeExpiry(userId);
  return expiry !== null && Date.now() < expiry;
};

/** Snooze the banner for `durationMs` from now. */
export const setSnooze = (userId: number, durationMs: number): void => {
  const state: SnoozeState = { snoozeUntil: Date.now() + durationMs };
  storageService.setRaw(dynamicKeys.deadlineSnooze(userId), state);
};

/** Clear any existing snooze for this user. */
export const clearSnooze = (userId: number): void => {
  storageService.remove(dynamicKeys.deadlineSnooze(userId));
};
