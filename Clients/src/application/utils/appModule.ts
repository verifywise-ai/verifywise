import type { AppModule } from "../redux/ui/uiSlice";

/**
 * Organization-wide pages (Management in the sidebar footer). They belong to no
 * module, so opening one keeps the sidebar of the module the user came from.
 */
const GLOBAL_PATH_PREFIXES = ["/settings", "/event-tracker"];

/**
 * True when `pathname` is `prefix` or a path below it (`/tasks` and
 * `/tasks/3`, not `/tasks-archive`). `/` matches only itself.
 */
export function isPathUnder(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isGlobalPath(pathname: string): boolean {
  return GLOBAL_PATH_PREFIXES.some((prefix) => isPathUnder(pathname, prefix));
}

/**
 * Maps a URL pathname to its application module.
 * "main" is the Governance module (root routes); other modules live
 * under their own top-level path prefixes.
 */
export function getAppModuleFromPath(pathname: string): AppModule {
  if (pathname.startsWith("/evals")) {
    return "evals";
  }
  if (pathname.startsWith("/ai-detection")) {
    return "ai-detection";
  }
  if (pathname.startsWith("/shadow-ai")) {
    return "shadow-ai";
  }
  if (pathname.startsWith("/ai-gateway")) {
    return "ai-gateway";
  }
  if (pathname.startsWith("/ai-trust-index")) {
    return "ai-trust-index";
  }
  if (pathname.startsWith("/super-admin")) {
    return "super-admin";
  }
  return "main";
}
