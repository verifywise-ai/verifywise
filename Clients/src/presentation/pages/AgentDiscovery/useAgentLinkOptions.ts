import { useMemo } from "react";
import { useProjects } from "../../../application/hooks/useProjects";
import { useModelInventories } from "../../../application/hooks/useModelInventories";
import { formatModelLabel } from "./agentLabels";

/** One choice in an agent link picker (a use case or a model). */
export interface AgentLinkOption {
  id: number;
  name: string;
}

/**
 * The use cases and models an agent can be linked to, for the add/edit drawer
 * and the review panel's link drawer. Both lists come from cached queries and
 * each is fetched only while its flag is true. Only use cases are offered, not
 * organizational (framework) projects.
 */
export function useAgentLinkOptions({
  useCases: useCasesEnabled,
  models: modelsEnabled,
}: {
  useCases: boolean;
  models: boolean;
}) {
  const { approvedProjects, isError: useCasesFailed } = useProjects({ enabled: useCasesEnabled });
  const { data: inventory, isError: modelsFailed } = useModelInventories({
    enabled: modelsEnabled,
  });

  const useCases = useMemo<AgentLinkOption[]>(
    () =>
      approvedProjects
        .filter((p) => !p.is_organizational)
        .map((p) => ({ id: Number(p.id), name: p.project_title })),
    [approvedProjects],
  );
  const models = useMemo<AgentLinkOption[]>(
    () =>
      (inventory ?? [])
        .filter((m): m is typeof m & { id: number } => m.id != null)
        .map((m) => ({ id: Number(m.id), name: formatModelLabel(m) })),
    [inventory],
  );

  return { useCases, models, useCasesFailed, modelsFailed };
}
