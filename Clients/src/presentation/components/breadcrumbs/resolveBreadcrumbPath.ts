/**
 * Link target for one auto-generated breadcrumb.
 *
 * Crumbs are built by walking URL segments, so a detail URL such as
 * `/ai-detection/scans/:scanId` produces a crumb for `/ai-detection/scans`,
 * which is not a page. A path that matches a registered route keeps its own
 * URL. A path that does not is linked to the nav item whose `matchPrefixes`
 * claim it (longest prefix). The next detail URL needs a route and, when the
 * parent segment is not a page, a `matchPrefixes` entry — not a one-off map.
 */

import { matchPath } from "react-router";
import { isPathUnder } from "../../../application/utils/appModule";
import { NAV_GROUPS } from "../UnifiedSidebar/navConfig";
import { routePatterns } from "./routePatterns";

function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.replace(/\/+$/, "");
  return pathname;
}

/** True when `pathname` is a page in `routes.tsx`, including `:param` routes. */
export function isRegisteredRoute(pathname: string): boolean {
  const path = normalize(pathname);
  return routePatterns.some((pattern) => matchPath(pattern, path) != null);
}

/**
 * Nav path that claims `pathname` through `matchPrefixes`, or null.
 * The longest prefix wins, so `/ai-detection/scans` belongs to scan history
 * rather than the broader `/ai-detection` prefix.
 */
function pathClaimedByNav(pathname: string): string | null {
  let bestLength = -1;
  let best: string | null = null;

  const consider = (prefix: string, destination: string) => {
    const target = destination.split("#")[0];
    if (!target || !isPathUnder(pathname, prefix) || prefix.length <= bestLength) return;
    bestLength = prefix.length;
    best = target;
  };

  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path) {
        for (const prefix of item.matchPrefixes ?? []) consider(prefix, item.path);
      }
      for (const sub of item.children ?? []) {
        for (const prefix of sub.matchPrefixes ?? []) consider(prefix, sub.path);
      }
    }
  }

  return best;
}

/** URL a breadcrumb for `pathname` should open. */
export function resolveBreadcrumbPath(pathname: string): string {
  const path = normalize(pathname);
  if (isRegisteredRoute(path)) return path;
  return pathClaimedByNav(path) ?? path;
}
