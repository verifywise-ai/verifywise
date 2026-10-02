import { useCallback, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import { Project } from "../../../../../domain/types/Project";
import { useSearchParams } from "react-router";
import { getAllProjectRisksByProjectId } from "../../../../../application/repository/projectRisk.repository";
import RisksView from "../../../../components/RisksView";
import { RiskModel } from "../../../../../domain/models/Common/risks/risk.model";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import StandardModal from "../../../../components/Modals/StandardModal";
import AddNewRiskForm from "../../../../components/AddNewRiskForm";
import { riskInitialState } from "../../../../components/AddNewRiskForm/hooks/useRiskForm";
import Alert from "../../../../components/Alert";
import { handleAlert } from "../../../../../application/tools/alertUtils";
import useUsers from "../../../../../application/hooks/useUsers";
import { useAuth } from "../../../../../application/hooks/useAuth";
import allowedRoles from "../../../../../application/constants/permissions";

const VWProjectRisks = ({ project }: { project?: Project }) => {
  const [searchParams] = useSearchParams();
  const rawProjectId = searchParams.get("projectId") ?? "0";
  // Extract numeric ID from composite IDs (e.g., "prefix-123" -> 123)
  const projectId = rawProjectId.includes("-")
    ? parseInt(rawProjectId.substring(rawProjectId.lastIndexOf("-") + 1), 10) || project!.id
    : parseInt(rawProjectId, 10) || project!.id;

  const { users, loading: usersLoading } = useUsers();
  const { userRoleName } = useAuth();
  const canCreateRisk = allowedRoles.projectRisks.create.includes(userRoleName);

  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    body: string;
  } | null>(null);
  const onSubmitRef = useRef<(() => void) | null>(null);

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

  const showToast = (variant: "success" | "error", body: string) => {
    handleAlert({ variant, body, setAlert });
    setTimeout(() => setAlert(null), 3000);
  };

  // Pre-link the new risk to this use case so it lands in this tab's list
  const initialRiskValues = useMemo(
    () => ({ ...riskInitialState, applicableProjects: [projectId] }),
    [projectId],
  );

  const handleCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
    showToast("success", "Risk created successfully");
  };

  const addRiskButton = (
    <CustomizableButton
      variant="contained"
      text="Add new risk"
      onClick={() => setIsRiskModalOpen(true)}
      isDisabled={!canCreateRisk}
    />
  );

  return (
    <>
      {alert && (
        <Box>
          <Alert
            variant={alert.variant}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        </Box>
      )}

      <RisksView
        fetchRisks={fetchProjectRisks}
        title="Use case risks"
        actions={addRiskButton}
        refreshTrigger={refreshTrigger}
        readOnly
      />

      <StandardModal
        isOpen={isRiskModalOpen}
        onClose={() => setIsRiskModalOpen(false)}
        title="Add a new risk"
        description="Create a detailed breakdown of risks and their mitigation strategies to assist in documenting your risk management activities effectively."
        onSubmit={() => onSubmitRef.current?.()}
        submitButtonText="Save"
        maxWidth="1039px"
      >
        <AddNewRiskForm
          closePopup={() => setIsRiskModalOpen(false)}
          popupStatus="new"
          initialRiskValues={initialRiskValues}
          onSuccess={handleCreated}
          onError={(message) => showToast("error", message)}
          users={users}
          usersLoading={usersLoading}
          onSubmitRef={onSubmitRef}
        />
      </StandardModal>
    </>
  );
};

export default VWProjectRisks;
