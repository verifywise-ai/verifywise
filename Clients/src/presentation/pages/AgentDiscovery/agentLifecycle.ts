import { AgentPrimitiveRow } from "src/domain/interfaces/i.agentDiscovery";

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

/** Resolve a user id to a display name with the shared formatter; null when unset. */
function resolveUser(
  userId: number | string | null | undefined,
  formatUser: (userId: number | string) => string,
): string | null {
  if (userId == null || userId === "") return null;
  return formatUser(userId);
}

export function getAgentLifecycle(
  agent: AgentPrimitiveRow,
  formatDateTime: (iso: string) => string,
  formatUser: (userId: number | string) => string,
): LifecycleStep[] {
  const status = agent.review_status;

  const addedOwner = agent.is_manual ? resolveUser(agent.owner_id, formatUser) : null;
  const reviewer = resolveUser(agent.reviewed_by, formatUser);
  const reviewedAt = agent.reviewed_at ? formatDateTime(agent.reviewed_at) : null;
  const addedAt = agent.created_at ? formatDateTime(agent.created_at) : null;

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
