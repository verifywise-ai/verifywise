/**
 * Day-level, timezone-safe comparison keys for files.expiry_date (a DATE column
 * written as YYYY-MM-DD). Comparing only the date components — never hours —
 * avoids a "midnight UTC" file rendering as expired for viewers west of UTC.
 * Returns null when the input is missing, empty, or not parseable.
 */
const expiryDateKey = (expiryDate: string | Date | null | undefined): number | null => {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return null;
  return expiry.getUTCFullYear() * 10000 + (expiry.getUTCMonth() + 1) * 100 + expiry.getUTCDate();
};

const todayKey = (): number => {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
};

/**
 * True when a file's expiry_date is strictly before today. Files with a
 * null/empty/invalid expiry_date, or one on/after today, are not expired.
 */
export const isFileExpired = (expiryDate: string | Date | null | undefined): boolean => {
  const key = expiryDateKey(expiryDate);
  if (key === null) return false;
  return key < todayKey();
};

/**
 * True when a file is inside the 7-day pre-expiry window (0..6 days remaining),
 * matching the server-side fileExpirySweep window. Mutually exclusive with
 * isFileExpired — a file already past its expiry date returns false here.
 */
export const isFileExpiringSoon = (expiryDate: string | Date | null | undefined): boolean => {
  const key = expiryDateKey(expiryDate);
  if (key === null) return false;
  const today = todayKey();
  // Same YMD key numeric comparison works only for same year/month; convert
  // both keys to day-since-epoch via Date.UTC for a true day delta.
  const toEpochDays = (k: number): number => {
    const y = Math.floor(k / 10000);
    const m = Math.floor((k % 10000) / 100);
    const d = k % 100;
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };
  const daysRemaining = toEpochDays(key) - toEpochDays(today);
  return daysRemaining >= 0 && daysRemaining <= 6;
};

/**
 * Reduce a list of files to the earliest expiry_date, or null if none set.
 * Callers use this to feed <FileExpiryChip> for a group of files (e.g. all
 * evidence_files under one evidence_hub row) — the earliest date drives the
 * worst state, which is exactly what the chip's expired-wins contract wants.
 * Accepts loosely-typed rows with an `expiry_date` field; missing/invalid
 * values are ignored. Day-key comparison stays TZ-safe.
 */
export const earliestFileExpiry = (
  files: { expiry_date?: string | Date | null }[] | null | undefined,
): string | null => {
  if (!files || files.length === 0) return null;
  let bestKey: number | null = null;
  let bestValue: string | null = null;
  for (const f of files) {
    const key = expiryDateKey(f?.expiry_date);
    if (key === null) continue;
    if (bestKey === null || key < bestKey) {
      bestKey = key;
      bestValue = typeof f.expiry_date === "string" ? f.expiry_date : f.expiry_date!.toISOString();
    }
  }
  return bestValue;
};
