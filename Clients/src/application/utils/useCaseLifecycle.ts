import allowedRoles from "../constants/permissions";
import type { LifecycleStage, LifecycleStageCounts } from "../../domain/enums/lifecycleStage.enum";

/**
 * Who may change a use case's lifecycle: Admin/Editor, or the owner. Auditors
 * never. Mirrors canManageLifecycle in Servers/controllers/useCaseLifecycle.ctrl.ts.
 */
export function canManageUseCaseLifecycle(
  role: string,
  userId: number | null,
  ownerId: number | undefined,
): boolean {
  if (!role || role === "Auditor") return false;
  if (userId !== null && ownerId !== undefined && Number(ownerId) === userId) return true;
  return allowedRoles.projects.edit.includes(role);
}

/** A lifecycle tab's count: entities in the stage plus extra rows (e.g. intake submissions). */
export function lifecycleTabCount(
  stage: LifecycleStage,
  counts?: Partial<LifecycleStageCounts>,
  extraCounts?: Partial<LifecycleStageCounts>,
): number {
  return (counts?.[stage] ?? 0) + (extraCounts?.[stage] ?? 0);
}
