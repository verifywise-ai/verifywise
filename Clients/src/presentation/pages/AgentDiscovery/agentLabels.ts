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
 * An agent's owners as user-id strings, primary first: the full owner set, or
 * the legacy single owner_id when the set is empty.
 */
export function getAgentOwnerIds(agent: {
  owner_ids?: number[];
  owner_id: string | null;
}): string[] {
  if (agent.owner_ids && agent.owner_ids.length > 0) return agent.owner_ids.map(String);
  return agent.owner_id ? [agent.owner_id] : [];
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

/**
 * A user's display name, or the translated "User #{id}" fallback for an id
 * that is not in the map (e.g. a deleted user). `t` is the translator from
 * useTranslation; the fallback is filled after translation so it reaches the
 * dictionary as one template.
 */
export function formatUserName(
  userId: number | string,
  usersMap: UserNameMap,
  t: (key: string) => string,
): string {
  return usersMap[String(userId)] || fill(t("User #{id}"), { id: userId });
}
