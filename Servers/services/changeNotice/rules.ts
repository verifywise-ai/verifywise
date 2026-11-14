/** Stops showing a notice after this many visits. */
export const MAX_VIEWS = 3;
/** Stops showing a notice this many days after the user first saw it. */
export const MAX_DAYS = 90;
/** A user holds at most this many notice keys; a new id beyond it is refused. */
export const MAX_KEYS = 200;
/** Notice ids are lowercase slugs. */
export const NOTICE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

export type NoticeState = {
  /** Null when the notice was dismissed before it was ever viewed. */
  first_seen_at: string | null;
  views: number;
  dismissed_at: string | null;
};

export type DecideShowInput = {
  state: NoticeState | undefined;
  accountCreatedAt: Date;
  /** Earliest first_seen_at for this notice across the organization; null when nobody has seen it. */
  orgFirstSeenAt: Date | null;
  /** How many notice keys the user already holds. */
  keyCount: number;
  now: Date;
};

/**
 * Whether the notice should be shown on this visit. First rule to stop it wins:
 * dismissed, shown MAX_VIEWS times, or MAX_DAYS since the user first saw it.
 * A user who has never seen it is skipped when their account is newer than the
 * first time anyone in their organization saw it, or when they are at the key limit.
 */
export function decideShow({
  state,
  accountCreatedAt,
  orgFirstSeenAt,
  keyCount,
  now,
}: DecideShowInput): boolean {
  if (!state) {
    if (keyCount >= MAX_KEYS) return false;
    return !orgFirstSeenAt || accountCreatedAt.getTime() <= orgFirstSeenAt.getTime();
  }
  if (state.dismissed_at) return false;
  if (state.views >= MAX_VIEWS) return false;
  // No view yet (dismiss-created state): the 90-day clock has not started.
  if (state.first_seen_at === null) return true;
  const firstSeen = new Date(state.first_seen_at).getTime();
  if (Number.isNaN(firstSeen)) return false;
  return now.getTime() - firstSeen <= MAX_DAYS * DAY_MS;
}
