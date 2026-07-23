import { AgentPrimitiveRow } from "src/domain/interfaces/i.agentDiscovery";
import { displayFormattedDateTime } from "../../tools/isoDateToString";

/**
 * The visual lifecycle of an agent, derived entirely from existing data
 * (review_status + is_stale). There is no dedicated lifecycle column on the
 * backend — this keeps the UI narrative and the stored state in sync without
 * net-new schema.
 *
 *   Added → Under review → Confirmed → Active
 *                        ↘ Rejected (terminal)
 *
 * A confirmed agent that has gone quiet (is_stale) is still "Active" but flagged.
 * Each step also carries who was responsible for it (owner) and when, so the
 * page can show who is in charge of each stage.
 */
export interface LifecycleStep {
  key: string;
  label: string;
  // "done" = a stage the agent has passed, "current" = where it is now,
  // "upcoming" = not yet reached, "rejected" = terminal error branch.
  state: "done" | "current" | "upcoming" | "rejected";
  // Who is responsible for this stage (resolved name), and when it happened.
  owner?: string | null;
  timestamp?: string | null;
}

/**
 * Resolve a user id to a display name via the supplied map, falling back to a
 * readable placeholder.
 */
function resolveUser(
  userId: number | string | null | undefined,
  usersMap: Record<string, string>,
): string | null {
  if (userId == null || userId === "") return null;
  return usersMap[String(userId)] || `User #${userId}`;
}

/**
 * The single lifecycle stage an agent is currently in, in the same vocabulary
 * as the stepper's end-state. Used by the list table's Status column so the
 * table and the detail page tell the same story (a confirmed, active agent
 * reads "Active", not the raw "confirmed").
 */
export function getAgentLifecycleStatus(agent: AgentPrimitiveRow): {
  label: string;
  variant: "success" | "error" | "warning" | "info" | "default";
} {
  if (agent.review_status === "rejected") return { label: "Rejected", variant: "error" };
  if (agent.review_status === "confirmed") {
    return agent.is_stale
      ? { label: "Stale", variant: "warning" }
      : { label: "Active", variant: "success" };
  }
  // unreviewed (or anything else) — awaiting review
  return { label: "Under review", variant: "info" };
}

export function getAgentLifecycle(
  agent: AgentPrimitiveRow,
  usersMap: Record<string, string> = {},
): LifecycleStep[] {
  const status = agent.review_status;

  const addedOwner = agent.is_manual ? resolveUser(agent.owner_id, usersMap) : null;
  const reviewer = resolveUser(agent.reviewed_by, usersMap);
  const reviewedAt = agent.reviewed_at ? displayFormattedDateTime(agent.reviewed_at) : null;
  const addedAt = agent.created_at ? displayFormattedDateTime(agent.created_at) : null;

  // Rejected is a terminal branch — collapse to Added → Under review → Rejected.
  if (status === "rejected") {
    return [
      { key: "added", label: "Added", state: "done", owner: addedOwner, timestamp: addedAt },
      { key: "under_review", label: "Under review", state: "done" },
      {
        key: "rejected",
        label: "Rejected",
        state: "rejected",
        owner: reviewer,
        timestamp: reviewedAt,
      },
    ];
  }

  const confirmed = status === "confirmed";

  return [
    { key: "added", label: "Added", state: "done", owner: addedOwner, timestamp: addedAt },
    {
      key: "under_review",
      label: "Under review",
      state: confirmed ? "done" : "current",
      owner: confirmed ? null : reviewer,
    },
    {
      key: "confirmed",
      label: "Confirmed",
      state: confirmed ? "done" : "upcoming",
      owner: confirmed ? reviewer : null,
      timestamp: confirmed ? reviewedAt : null,
    },
    {
      key: "active",
      label: agent.is_stale ? "Active (stale)" : "Active",
      state: confirmed ? "current" : "upcoming",
    },
  ];
}
