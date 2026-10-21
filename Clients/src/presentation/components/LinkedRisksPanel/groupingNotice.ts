import { fill } from "../../../i18n/fill";

/**
 * The notice shown once a hierarchy pass is queued. Shared by the risk and
 * vendor risk panels so their wording, and its singular forms, stay the same.
 * Callers handle `enqueued === 0` themselves: each panel explains it differently.
 */
export function groupingNotice(
  t: (key: string) => string,
  result: { enqueued: number; skipped: number },
): string {
  const grouping = fill(
    t(
      result.enqueued === 1
        ? "Grouping {count} cluster of related risks. Suggestions appear here as they finish."
        : "Grouping {count} clusters of related risks. Suggestions appear here as they finish.",
    ),
    { count: result.enqueued },
  );
  if (result.skipped === 0) return grouping;
  const skipped = fill(
    t(
      result.skipped === 1
        ? "{count} cluster was too large to group in one pass."
        : "{count} clusters were too large to group in one pass.",
    ),
    { count: result.skipped },
  );
  return `${grouping} ${skipped}`;
}
