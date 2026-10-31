import allowedRoles from "../constants/permissions";
import {
  LIFECYCLE_STAGES,
  LifecycleStage,
  LifecycleStageCounts,
} from "../../domain/enums/lifecycleStage.enum";
import type { Project } from "../../domain/types/Project";

/**
 * Who may change an entry's lifecycle (use cases, AI apps): anyone holding
 * the entity's edit permission (useCase.edit, aiApp.edit), or the owner.
 * Auditors never. Mirrors canManageLifecycle in
 * Servers/controllers/lifecycle.ctrl.ts; `canEdit` comes from
 * useMyPermissions, the same per-org matrix the server checks, so custom
 * roles get the same answer as on the server.
 */
export function canManageLifecycle(
  role: string,
  userId: number | null,
  ownerId: number | undefined,
  canEdit: boolean,
): boolean {
  if (!role || role === "Auditor") return false;
  if (userId !== null && ownerId !== undefined && Number(ownerId) === userId) return true;
  return canEdit;
}

/** Built-in fallback while the permission list loads or fails. */
export const canEditUseCasesByRole = (role: string) => allowedRoles.projects.edit.includes(role);

/** A lifecycle tab's count: entities in the stage plus extra rows (e.g. intake submissions). */
export function lifecycleTabCount(
  stage: LifecycleStage,
  counts?: Partial<LifecycleStageCounts>,
  extraCounts?: Partial<LifecycleStageCounts>,
): number {
  return (counts?.[stage] ?? 0) + (extraCounts?.[stage] ?? 0);
}

/** Stage counts with pending intake requests added to In review (#5188). */
export function withPendingRequests(
  counts: LifecycleStageCounts,
  pendingRequests: number,
): LifecycleStageCounts {
  return {
    ...counts,
    [LifecycleStage.IN_REVIEW]: counts[LifecycleStage.IN_REVIEW] + pendingRequests,
  };
}

/**
 * Use cases per lifecycle stage. The one way stage counts are computed: the
 * Use cases tabs and the dashboard both count the same use cases list.
 */
export function countLifecycleStages(
  projects: Pick<Project, "lifecycle_stage" | "is_organizational">[],
): LifecycleStageCounts {
  const counts = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])) as LifecycleStageCounts;
  for (const project of projects) {
    if (project.is_organizational) continue;
    counts[project.lifecycle_stage ?? LifecycleStage.PLANNED] += 1;
  }
  return counts;
}
