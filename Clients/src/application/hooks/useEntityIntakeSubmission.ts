import { useQuery } from "@tanstack/react-query";
import {
  getEntityIntakeSubmission,
  type EntityIntakeSubmission,
} from "../repository/intakeForm.repository";

/**
 * Fetches the original intake form submission for an entity.
 * Returns null if the entity was not created from an intake form.
 */
export function useEntityIntakeSubmission(
  entityType: "use_case" | "model",
  entityId: number | null
) {
  return useQuery<EntityIntakeSubmission | null>({
    queryKey: ["entity-intake-submission", entityType, entityId],
    queryFn: ({ signal }) =>
      getEntityIntakeSubmission(entityType, entityId!, signal),
    enabled: !!entityId && entityId > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
