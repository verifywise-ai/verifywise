/**
 * @fileoverview Shared helper — map a regulation/deadline status string to a
 * Chip variant so the colour logic lives in one place.
 *
 * @module pages/RegulationsTracker/statusVariant
 */

import type { ChipVariant } from "../../types/interfaces/i.chip";

/**
 * Return the semantic Chip variant for a regulation or deadline status value.
 *
 * Known feed values:
 *   "in-force"           → success  (green  — active & enforceable)
 *   "passed-not-active"  → info     (blue   — passed, not yet live)
 *   "proposed"           → warning  (amber  — pending)
 *   "policy-only"        → default  (gray   — non-binding)
 *   "voluntary"          → default  (gray   — non-binding)
 *   anything else        → default
 */
export function regulationStatusVariant(status?: string): ChipVariant {
  const s = (status ?? "").toLowerCase().trim();
  if (s.includes("in-force") || s.includes("in force") || s === "active" || s === "enacted") {
    return "success";
  }
  if (s.includes("passed")) {
    return "info"; // passed-not-active
  }
  if (s.includes("proposed") || s.includes("draft")) {
    return "warning";
  }
  // policy-only, voluntary, unknown → default
  return "default";
}
