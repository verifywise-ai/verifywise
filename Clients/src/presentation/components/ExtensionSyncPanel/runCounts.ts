import { fill, pluralKey } from "../../../i18n/fill";

export type Translate = (key: string) => string;

/** One count in a run summary, with its English singular and plural templates. */
export interface RunCountPart {
  count: number;
  /** e.g. "{count} conflict" */
  one: string;
  /** e.g. "{count} conflicts" */
  other: string;
}

/**
 * "Sync completed: 2 use cases created, 1 use case updated" for a completed
 * run, or "Sync completed: no changes" when every count is zero. Each count is
 * a whole template picked by the active language's plural rules, and the
 * summary is one template around them, so the words translate in their own
 * order. Zero counts are left out; parts keep the order given.
 */
export function describeRunCounts(parts: RunCountPart[], t: Translate, lang: string): string {
  const shown = parts.filter((part) => part.count > 0);
  if (shown.length === 0) return t("Sync completed: no changes");
  const counts = shown
    .map((part) =>
      fill(t(pluralKey(lang, part.count, part.one, part.other)), { count: part.count }),
    )
    .join(", ");
  return fill(t("Sync completed: {counts}"), { counts });
}
