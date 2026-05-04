import { Stack } from "@mui/material";
import { useState, useEffect, useCallback } from "react";
import Field from "../Inputs/Field";
import useProjectRisks from "../../../application/hooks/useProjectRisks";
import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import LinkedRisksTable from "../Table/LinkedRisksTable";
import { useSearchParams } from "react-router-dom";
import StandardModal from "../Modals/StandardModal";

import { textfieldStyle } from "./styles";
import { LinkedRisksModalProps } from "../../types/interfaces/i.table";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";

export function LinkedRisksPopup({
  onClose,
  currentRisks,
  setSelectecRisks,
  _setDeletedRisks,
  projectId: propProjectId,
  frameworkId,
  isOrganizational = false,
}: LinkedRisksModalProps) {
  const [searchParams] = useSearchParams();
  const pId = searchParams.get("projectId");
  const projectId = propProjectId || parseInt(pId ?? "0");

  const [frameworkRisks, setFrameworkRisks] = useState<RiskModel[]>([]);

  const shouldUseProjectRisks = !isOrganizational && projectId > 0 && frameworkId !== 1;
  const { projectRisks } = useProjectRisks({
    projectId: shouldUseProjectRisks ? projectId : 0,
  });

  const fetchAllRisks = useCallback(async () => {
    try {
      const response = await getAllProjectRisks({ filter: "active" });
      setFrameworkRisks(response.data || []);
    } catch (error) {
      console.error("Error fetching risks:", error);
      setFrameworkRisks([]);
    }
  }, []);

  // Fetch risks when using organizational, EU AI Act, or fallback scenarios
  useEffect(() => {
    if (isOrganizational || frameworkId === 1 || projectId === 0) {
      fetchAllRisks();
    } else {
      setFrameworkRisks([]);
    }
  }, [isOrganizational, frameworkId, projectId, fetchAllRisks]);

  // Determine which risks to use
  // If organizational, EU AI Act (frameworkId=1), OR projectId is 0/invalid, use frameworkRisks
  // Otherwise, use projectRisks (project-specific risks)
  const risks =
    isOrganizational || frameworkId === 1 || projectId === 0 ? frameworkRisks : projectRisks;
  const [searchInput, setSearchInput] = useState<string>("");
  const [checkedRows, setCheckedRows] = useState<number[]>(currentRisks);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);

  const handleFormSubmit = () => {
    setSelectecRisks(checkedRows.filter((r) => !currentRisks.includes(r)));
    _setDeletedRisks(deletedRisks);
    onClose();
  };

  const handleOnTextFieldChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value);
  };

  const filteredRisks = risks.filter((risk) =>
    risk.risk_name.toLowerCase().includes(searchInput.toLowerCase()),
  );

  return (
    <StandardModal
      isOpen={true}
      onClose={onClose}
      title="Link a risk from risk database"
      description="Search from the risk database:"
      onSubmit={handleFormSubmit}
      submitButtonText="Use selected risks"
      maxWidth="1500px"
    >
      <Stack spacing={6}>
        <Field
          id="risk-input"
          width="350px"
          sx={textfieldStyle}
          value={searchInput}
          onChange={handleOnTextFieldChange}
          disabled={risks.length === 0}
        />
        <LinkedRisksTable
          projectRisksGroup={risks}
          filteredRisksGroup={filteredRisks}
          currentRisks={currentRisks}
          checkedRows={checkedRows}
          setCheckedRows={setCheckedRows}
          deletedRisks={deletedRisks}
          setDeletedRisks={setDeletedRisks}
        />
      </Stack>
    </StandardModal>
  );
}
