import { isPathUnder } from "../../../application/utils/appModule";
import type { ChangeNoticeEntry } from "../../../domain/types/changeNotice.types";
import { CHANGE_NOTICES } from "./notices";

/**
 * The page entry for a path. Global entries are ignored here. When several
 * entries match, the one with the longest matching route prefix wins, so
 * /ai-gateway/mcp/runs gets the Agent controls notice and never the AI Gateway one.
 */
export function resolveNotice(
  pathname: string,
  entries: readonly ChangeNoticeEntry[] = CHANGE_NOTICES,
): ChangeNoticeEntry | null {
  let best: ChangeNoticeEntry | null = null;
  let bestLength = -1;
  for (const entry of entries) {
    if (entry.global) continue;
    for (const route of entry.routes) {
      if (isPathUnder(pathname, route) && route.length > bestLength) {
        best = entry;
        bestLength = route.length;
      }
    }
  }
  return best;
}
