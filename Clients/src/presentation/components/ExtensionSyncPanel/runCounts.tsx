import { Fragment, type ReactNode } from "react";
/**
 * "Sync completed: 2 created, 1 updated" for a completed run, or "Sync
 * completed: no changes" with no parts. Every count and word is its own text
 * node so the words translate; build the parts in display order.
 */
export function describeRunCounts(parts: Array<{ count: number; label: string }>): ReactNode {
  return (
    <>
      {"Sync completed: "}
      {parts.length === 0
        ? "no changes"
        : parts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && ", "}
              {part.count} {part.label}
            </Fragment>
          ))}
    </>
  );
}
