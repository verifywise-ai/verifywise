import type { VWIconName } from "../VWIcon";
import type { UiPermissionKey } from "../../../application/constants/permissions";

/** Sidebar groups, top to bottom. The id also picks the group's part colour. */
export type NavGroupId = "automate" | "record" | "track" | "enforce" | "workspace";

/**
 * Who sees an entry, as data. The sidebar component evaluates it; each form
 * copies a condition today's navigation already applies.
 * - permission: `useCan(key)`. `whenDenied: "disable"` keeps the entry visible
 *   but disabled with `deniedTooltip` (today's Extensions button); the default
 *   hides it.
 * - superAdmin: `useAuth().isSuperAdmin`.
 * - evalsArena: the organization's Arena setting is on (`useArenaSetting`).
 * - flag: a constant in application/config/featureFlags.ts is true.
 */
export type NavGate =
  | { permission: UiPermissionKey; whenDenied?: "hide" | "disable"; deniedTooltip?: string }
  | { superAdmin: true }
  | { evalsArena: true }
  | { flag: "SHOW_AI_GATEWAY_PROMPTS" };

/** Counts the sidebar shows next to an entry; each one is today's sidebar count. */
export type NavCountKey =
  | "openTasks"
  | "aiTrustIndexTracked"
  | "shadowAiTools"
  | "shadowAiAlerts"
  | "aiDetectionRepositories"
  | "aiDetectionHistory"
  | "evalsExperiments"
  | "evalsDatasets"
  | "evalsScorers"
  | "evalsModels"
  | "evalsArena"
  | "aiGatewayEndpoints"
  | "aiGatewayPrompts";

/** Extra blocks an item renders inside its open section, kept from today's module sidebars. */
export type NavExtra =
  | "evalsProjectSelector"
  | "evalsRecentExperiments"
  | "evalsRecentProjects"
  | "recentScans"
  | "recentTools";

export interface NavSubItem {
  id: string;
  label: string;
  /** Route; LLM Evals sub-items use `/evals#<tab>` like today's hash navigation. */
  path: string;
  gate?: NavGate;
  countKey?: NavCountKey;
  /** Other route prefixes that also make this sub-item active. */
  matchPrefixes?: string[];
  /** Heading of the block this sub-item sits in, inside its item. */
  section?: string;
  /** Disabled until an Evals project is selected (today's Experiments and Reports). */
  requiresEvalsProject?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: VWIconName;
  /** Route for a plain item. Expandable items have `children` instead. */
  path?: string;
  children?: NavSubItem[];
  gate?: NavGate;
  countKey?: NavCountKey;
  /** Other route prefixes that also make this item active. */
  matchPrefixes?: string[];
  extras?: NavExtra[];
}

export interface NavGroup {
  id: NavGroupId;
  /** Shown above the group; the top group has none. */
  heading?: string;
  /** Rendered below the scrolling nav, just above the footer (Workspace). */
  pinned?: boolean;
  items: NavItem[];
}

/** A route from today's navigation that the unified sidebar leaves where it is. */
export interface KeptElsewhere {
  path: string;
  reason: string;
}

export interface NavActive {
  itemId: string;
  subId?: string;
}
