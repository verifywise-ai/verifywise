import type { AppModule } from "../redux/ui/uiSlice";

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
  if (pathname.startsWith("/bias-audit")) {
    return "bias-audit";
  }
  if (pathname.startsWith("/super-admin")) {
    return "super-admin";
  }
  return "main";
}
