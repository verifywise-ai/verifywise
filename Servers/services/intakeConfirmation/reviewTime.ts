// Servers/services/intakeConfirmation/reviewTime.ts
// The agreed review time of an intake submission: the due date in business
// days and the sentence the submitter's confirmation email uses for it. Pure
// functions, so they are tested without a DB. The email body is English, so
// the sentence is English too.
import { MAX_REVIEW_DAYS, MIN_REVIEW_DAYS } from "../../constants/intakeReviewTime";

/**
 * The timezone business days are counted in. Organizations have no stored
 * timezone yet, so this is UTC for every organization; the maths below takes
 * the zone as a parameter so a per-organization setting can be passed later.
 */
export const REVIEW_TIME_ZONE = "UTC";

/** Names listed in full before the rest are counted ("and 2 others"). */
export const MAX_NAMED_REVIEWERS = 3;

/** A whole number of business days in range, or null. */
export function parseReviewDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < MIN_REVIEW_DAYS || value > MAX_REVIEW_DAYS) return null;
  return value;
}

/** The calendar date ("YYYY-MM-DD") of an instant in a timezone. */
export function localDateIn(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * The date ("YYYY-MM-DD") that is `days` business days after the day `from`
 * falls on in `timeZone`. Counting starts the next day and skips Saturdays
 * and Sundays, so a Friday or weekend submission with 1 day is due on Monday.
 * Public holidays are not known and count as business days.
 */
export function addBusinessDays(from: Date, days: number, timeZone: string): string {
  const [year, month, day] = localDateIn(from, timeZone).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

/** Whether a "YYYY-MM-DD" due date is before today in `timeZone`. */
export function isPastDue(dueDate: string, now: Date, timeZone: string): boolean {
  return dueDate < localDateIn(now, timeZone);
}

/** "Thursday, November 5, 2026" for a "YYYY-MM-DD" date. */
export function formatReviewDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "Ann Lee", "Ann Lee and Ben Ross", "A, B, C and 2 others"; null without names. */
export function reviewerNamesText(names: string[]): string | null {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const rest = clean.length - MAX_NAMED_REVIEWERS;
  const items =
    rest > 0
      ? [...clean.slice(0, MAX_NAMED_REVIEWERS), rest === 1 ? "1 other" : `${rest} others`]
      : clean;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The sentence naming who reviews and, when `due` is given, by when. Without
 * reviewer names it names the governance team.
 */
export function reviewSentence(
  reviewers: string | null,
  due: { days: number; date: string } | null,
): string {
  const who = reviewers ?? "The governance team";
  if (!due) return `${who} will review your submission.`;
  const span = due.days === 1 ? "1 business day" : `${due.days} business days`;
  return `${who} will review your submission within ${span}, by ${formatReviewDate(due.date)}.`;
}
