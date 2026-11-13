import type { VWIconName } from "../VWIcon";

/**
 * Tab label (lower case) to VerifyWise icon, phase 1 only. A tab whose label
 * is not listed keeps its Lucide icon. Add a row here, not on the page.
 */
export const TAB_ICON_BY_LABEL: Readonly<Record<string, VWIconName>> = {
  "overview": "overview",
  "operations": "operations",
  "operations view": "operations",
  "executive": "executive",
  "executive view": "executive",
  "not decided": "not-decided",
  "network": "network",
  "code": "code",
  "sources": "sources",
  "evidence": "evidence",
  "matched": "matched",
  "register": "register",
  "feed": "feed",
  "your vendors": "your-vendors",
  "coverage": "coverage",
  "updates": "updates",
  "clauses": "clauses",
  "policy library": "policy-library",
  "due": "due",
  "experiments": "experiments",
  "scorers": "scorers",
  "bias audits": "bias-audits",
  "playground": "playground",
  "arena": "arena",
  "guardrails": "guardrails",
  "mcp servers": "mcp-servers",
  "keys": "keys",
  "api keys": "keys",
  "virtual keys": "keys",
  "logs": "logs",
  "request logs": "logs",
  "guardrail logs": "logs",
  "approvals": "approvals",
  "runs": "runs",
  "what changed": "what-changed",
  "colour system": "colour-system",
};

/** Icon for a tab: matched by label first, then by its value. */
export function tabIconName(label: string, value: string): VWIconName | undefined {
  return TAB_ICON_BY_LABEL[label.trim().toLowerCase()] ?? TAB_ICON_BY_LABEL[value.toLowerCase()];
}
