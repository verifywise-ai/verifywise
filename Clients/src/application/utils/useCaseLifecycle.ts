import allowedRoles from "../constants/permissions";
import {
  LIFECYCLE_STAGES,
  LifecycleStage,
  LifecycleStageCounts,
} from "../../domain/enums/lifecycleStage.enum";
import type { Project } from "../../domain/types/Project";

/**
 * Who may change a use case's lifecycle: anyone holding useCase.edit, or the
 * owner. Auditors never. Mirrors canManageLifecycle in
 * Servers/controllers/useCaseLifecycle.ctrl.ts; `canEditUseCases` comes from
 * useHasPermission("useCase.edit"), the same per-org permission matrix the
 * server checks, so custom roles get the same answer as on the server.
 */
export function canManageUseCaseLifecycle(
  role: string,
  userId: number | null,
  ownerId: number | undefined,
  canEditUseCases: boolean,
): boolean {
  if (!role || role === "Auditor") return false;
  if (userId !== null && ownerId !== undefined && Number(ownerId) === userId) return true;
  return canEditUseCases;
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
