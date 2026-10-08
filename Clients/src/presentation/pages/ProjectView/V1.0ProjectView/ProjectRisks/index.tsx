import { useCallback, useState } from "react";
import { Project } from "../../../../../domain/types/Project";
import { useSearchParams } from "react-router";
import { getAllProjectRisksByProjectId } from "../../../../../application/repository/projectRisk.repository";
import RisksView from "../../../../components/RisksView";
import { RiskModel } from "../../../../../domain/models/Common/risks/risk.model";
import AiRiskSuggestions from "./AiRiskSuggestions";

const VWProjectRisks = ({ project }: { project?: Project }) => {
  const [searchParams] = useSearchParams();
  const rawProjectId = searchParams.get("projectId") ?? "0";
  // Extract numeric ID from composite IDs (e.g., "prefix-123" -> 123)
  const projectId = rawProjectId.includes("-")
    ? parseInt(rawProjectId.substring(rawProjectId.lastIndexOf("-") + 1), 10) || project!.id
    : parseInt(rawProjectId, 10) || project!.id;
  const [aiSuggestionRefreshTrigger, setAiSuggestionRefreshTrigger] = useState(0);

  // Create fetch function for use case risks
  const fetchProjectRisks = useCallback(
    async (filter = "active"): Promise<RiskModel[]> => {
      try {
        const response = await getAllProjectRisksByProjectId({
          projectId: String(projectId),
          filter: filter as "active" | "deleted" | "all",
        });
        return response.data || [];
      } catch (error) {
        console.error("Error fetching project risks:", error);
        throw error;
      }
    },
    [projectId],
  );

  return (
    <RisksView
      fetchRisks={fetchProjectRisks}
      title="Use case risks"
      readOnly
      refreshTrigger={aiSuggestionRefreshTrigger}
      actions={
        <AiRiskSuggestions onRiskSaved={() => setAiSuggestionRefreshTrigger((key) => key + 1)} />
      }
    />
  );
};

export default VWProjectRisks;
