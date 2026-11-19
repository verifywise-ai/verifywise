/**
 * Route patterns taken from `application/config/routes.tsx`.
 *
 * Breadcrumbs need to know which paths are real pages. Importing the route
 * module would pull every page into this component, so the source is read as
 * text and the `path` attributes are collected here. The catch-all `*` is
 * left out: it matches every URL, and a missing path must stay missing.
 */

import routesSource from "../../../application/config/routes.tsx?raw";

/** Drop block and line comments so a commented-out route is not a pattern. */
export function stripRouteComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Absolute patterns, with nested relative paths joined onto their parent
 * (`path="risks"` under `/vendors` becomes `/vendors/risks`).
 */
export function extractRoutePatterns(source: string): string[] {
  const code = stripRouteComments(source);
  const patterns: string[] = [];
  const stack: string[] = [];
  let cursor = 0;

  while (cursor < code.length) {
    const open = code.indexOf("<Route", cursor);
    const close = code.indexOf("</Route>", cursor);
    if (open === -1 && close === -1) break;

    if (close !== -1 && (open === -1 || close < open)) {
      stack.pop();
      cursor = close + "</Route>".length;
      continue;
    }

    const boundary = code[open + "<Route".length];
    if (boundary !== undefined && /[A-Za-z0-9]/.test(boundary)) {
      cursor = open + "<Route".length;
      continue;
    }

    const tagEnd = endOfOpeningTag(code, open);
    if (tagEnd === -1) break;

    const tag = code.slice(open, tagEnd + 1);
    const path = tag.match(/\bpath="([^"]*)"/)?.[1];
    const parent = stack[stack.length - 1] ?? "";
    const full = path === undefined || path === "*" ? null : toAbsolute(parent, path);
    if (full !== null) patterns.push(full);

    if (!/\/\s*>$/.test(tag)) stack.push(full ?? parent);
    cursor = tagEnd + 1;
  }

  return patterns;
}

function toAbsolute(parent: string, path: string): string {
  if (path.startsWith("/")) return path;
  const base = parent.endsWith("/") ? parent.slice(0, -1) : parent;
  return `${base}/${path}`;
}

/** Index of the `>` that closes the JSX opening tag, ignoring `>` inside expressions. */
function endOfOpeningTag(code: string, open: number): number {
  let quote: "'" | '"' | "`" | null = null;
  let braces = 0;

  for (let i = open + 1; i < code.length; i++) {
    const char = code[i];
    if (quote) {
      if (char === quote && code[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") braces += 1;
    else if (char === "}") braces = Math.max(0, braces - 1);
    else if (char === ">" && braces === 0) return i;
  }

  return -1;
}

export const routePatterns: readonly string[] = extractRoutePatterns(routesSource);
