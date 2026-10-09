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

/**
 * The Source column label of an agent: "Manually entered" for a manual agent,
 * else its source's display name. Shared by the column, the group-by headers
 * and the Source filter so all three read the same. Rendered as plain text, so
 * the DOM translator translates "Manually entered" like the rest of the table.
 */
export function getAgentSourceLabel(agent: { is_manual: boolean; source_system: string }): string {
  if (agent.is_manual) return "Manually entered";
  return agent.source_system ? formatSourceLabel(agent.source_system) : "Unknown";
}

/**
 * Source filter options for the agents shown: the value is the raw source key
 * (what the filter matches), the label is the Source column's.
 */
export function getSourceFilterOptions(
  agents: { is_manual: boolean; source_system: string }[],
): { value: string; label: string }[] {
  const sources = new Map<string, string>();
  agents.forEach((agent) => {
    if (agent.source_system && !sources.has(agent.source_system)) {
      sources.set(agent.source_system, getAgentSourceLabel(agent));
    }
  });
  return Array.from(sources, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
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
 * The owners recorded in an owner audit value, in order. `owner_ids` values
 * are a JSON array (e.g. `["3","Doe, Jane"]`); rows written before that are a
 * comma-joined list, split as before. An `owner_id` value is always one owner,
 * so a text owner containing a comma is never split.
 */
export function parseOwnerAuditValue(
  value: string | null | undefined,
  field: "owner_id" | "owner_ids",
): string[] {
  const raw = (value ?? "").trim();
  if (raw === "") return [];
  if (field === "owner_id") return [raw];
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v) => v !== null && v !== undefined)
          .map((v) => String(v).trim())
          .filter((v) => v !== "");
      }
    } catch {
      // Not JSON after all: fall through to the legacy comma split.
    }
  }
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

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
