/**
 * Display labels shared by the AI agents list, detail page and drawers.
 */

import { fill } from "../../../i18n/fill";

// Friendly display names for known discovery sources. Falls back to the raw
// source_system key (title-cased) for any source not listed here.
export const SOURCE_LABELS: Record<string, string> = {
  "azure-ai-foundry": "Azure AI Foundry",
};

export function formatSourceLabel(sourceSystem: string): string {
  if (SOURCE_LABELS[sourceSystem]) return SOURCE_LABELS[sourceSystem];
  return sourceSystem
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The subset of a model inventory row needed to label it. */
export interface ModelLabelSource {
  id: number | string;
  provider?: string | null;
  model?: string | null;
  provider_model?: string | null;
  model_name?: string | null;
  name?: string | null;
}

/**
 * Label a model inventory row as "<provider> · <model>". The inventory exposes
 * the model name as `model` (with `provider` and `provider_model`); fall back
 * progressively to whatever is present, then to "Model #<id>".
 */
export function formatModelLabel(model: ModelLabelSource): string {
  const modelName = model.model || model.provider_model || model.model_name || model.name;
  if (!modelName) return `Model #${model.id}`;
  return model.provider ? `${model.provider} · ${modelName}` : modelName;
}

// ── Review status ────────────────────────────────────────────────────────────

/** Chip variant for a review status. */
export type ReviewStatusVariant = "info" | "success" | "error" | "default";

/**
 * Display label and chip variant for an agent's stored review status, in the
 * vocabulary the status filter and the stat cards use. Staleness is shown
 * separately (its own column, filter and card), never folded into the status.
 */
const REVIEW_STATUS_DISPLAY: Record<string, { label: string; variant: ReviewStatusVariant }> = {
  unreviewed: { label: "Unreviewed", variant: "info" },
  confirmed: { label: "Confirmed", variant: "success" },
  rejected: { label: "Rejected", variant: "error" },
};

export function getReviewStatusDisplay(status: string | null | undefined): {
  label: string;
  variant: ReviewStatusVariant;
} {
  if (status && REVIEW_STATUS_DISPLAY[status]) return REVIEW_STATUS_DISPLAY[status];
  if (!status) return { label: "Unknown", variant: "default" };
  return { label: status.charAt(0).toUpperCase() + status.slice(1), variant: "default" };
}

// ── Owners and user names ────────────────────────────────────────────────────

/**
 * An agent's owners, primary first. The owner set (`owner_ids`) is the source
 * of truth. The legacy single owner_id stands in only when the set is empty and
 * it is not a manual agent's user id: a synced agent's source-reported owner
 * (e.g. an email), or free text a manual agent got from the old single-owner
 * API. A manual agent's numeric owner_id with no owner set names someone who
 * is no longer a user, so it is not shown as an owner.
 *
 * Values are user ids as strings, except that legacy text, which is returned as
 * is (see isUserIdLike).
 */
export function getAgentOwnerIds(agent: {
  owner_ids?: number[];
  owner_id: string | null;
  is_manual: boolean;
}): string[] {
  if (agent.owner_ids && agent.owner_ids.length > 0) return agent.owner_ids.map(String);
  if (!agent.owner_id) return [];
  if (agent.is_manual && isUserIdLike(agent.owner_id)) return [];
  return [agent.owner_id];
}

/** User id (as a string) → display name. */
export type UserNameMap = Record<string, string>;

/** Build a user-id → "First Last" map from a user list. */
export function buildUserNameMap(
  users: Array<{ id: number | string; name?: string | null; surname?: string | null }>,
): UserNameMap {
  const map: UserNameMap = {};
  users.forEach((u) => {
    const name = `${u.name ?? ""} ${u.surname ?? ""}`.trim();
    if (name) map[String(u.id)] = name;
  });
  return map;
}

/** True for a value that can be a user id (a positive decimal integer). */
export function isUserIdLike(value: number | string): boolean {
  return /^\d+$/.test(String(value).trim());
}

/**
 * How to show an owner or other user reference:
 * - a numeric id of a user in the map → that user's name;
 * - a numeric id not in the map (e.g. a deleted user) → the translated
 *   "User #{id}" fallback;
 * - any other value → the value itself. Synced agents carry the owner reported
 *   by the source system (e.g. an email), which is not a VerifyWise user id.
 *
 * `t` is the translator from useTranslation; the fallback is filled after
 * translation so it reaches the dictionary as one template.
 */
export function formatUserName(
  userId: number | string,
  usersMap: UserNameMap,
  t: (key: string) => string,
): string {
  const key = String(userId).trim();
  if (!isUserIdLike(key)) return key;
  return usersMap[key] || fill(t("User #{id}"), { id: key });
}

/**
 * First and last name for an owner's avatar initials. A known user gives their
 * name; a source-reported value (e.g. an email) gives its first character; an
 * unknown numeric id gives none, so the avatar shows "?".
 */
export function getAvatarName(
  userId: number | string,
  usersMap: UserNameMap,
): { firstname: string; lastname: string } {
  const key = String(userId).trim();
  const name = usersMap[key];
  if (name) {
    const [firstname, ...rest] = name.split(" ");
    return { firstname, lastname: rest.join(" ") };
  }
  return { firstname: isUserIdLike(key) ? "" : key, lastname: "" };
}
