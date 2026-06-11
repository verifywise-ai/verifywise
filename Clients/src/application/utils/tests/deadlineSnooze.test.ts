import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSnoozeExpiry, isSnoozed, setSnooze, clearSnooze } from "../deadlineSnooze";

const USER_ID = 42;
const STORAGE_KEY = `verifywise_deadline_snooze_${USER_ID}`;
const ONE_HOUR = 60 * 60 * 1000;

describe("deadlineSnooze", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setSnooze persists a future expiry and isSnoozed reports true", () => {
    setSnooze(USER_ID, ONE_HOUR);

    const expiry = getSnoozeExpiry(USER_ID);
    expect(expiry).not.toBeNull();
    expect(expiry!).toBeGreaterThan(Date.now());
    expect(isSnoozed(USER_ID)).toBe(true);
  });

  it("getSnoozeExpiry returns null when nothing is stored", () => {
    expect(getSnoozeExpiry(USER_ID)).toBeNull();
    expect(isSnoozed(USER_ID)).toBe(false);
  });

  it("isSnoozed returns false once the snooze has expired", () => {
    // Write an already-expired snooze directly.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ snoozeUntil: Date.now() - 1000 }));

    expect(isSnoozed(USER_ID)).toBe(false);
    // Expiry value is still readable, it's just in the past.
    expect(getSnoozeExpiry(USER_ID)).toBeLessThan(Date.now());
  });

  it("clearSnooze removes the stored snooze", () => {
    setSnooze(USER_ID, ONE_HOUR);
    expect(isSnoozed(USER_ID)).toBe(true);

    clearSnooze(USER_ID);
    expect(getSnoozeExpiry(USER_ID)).toBeNull();
    expect(isSnoozed(USER_ID)).toBe(false);
  });

  it("getSnoozeExpiry returns null for corrupted JSON instead of throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => getSnoozeExpiry(USER_ID)).not.toThrow();
    expect(getSnoozeExpiry(USER_ID)).toBeNull();
  });

  it("scopes snooze per user id", () => {
    setSnooze(USER_ID, ONE_HOUR);
    expect(isSnoozed(USER_ID)).toBe(true);
    expect(isSnoozed(999)).toBe(false);
  });
});
