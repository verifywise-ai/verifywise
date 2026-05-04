import { useState, useEffect } from "react";
import {
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import StandardModal from "../../../components/Modals/StandardModal";
import Checkbox from "../../../components/Inputs/Checkbox";
import Chip from "../../../components/Chip";
import { getAllProjectRisksByProjectId } from "../../../../application/repository/projectRisk.repository";

interface FriaRiskImportModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  existingLinkedRiskIds: number[];
  onImport: (
    risks: Array<{
      risk_description: string;
      likelihood: string;
      severity: string;
      linked_project_risk_id: number;
    }>,
  ) => void;
}

const FriaRiskImportModal = ({
  open,
  onClose,
  projectId,
  existingLinkedRiskIds,
  onImport,
}: FriaRiskImportModalProps) => {
  const theme = useTheme();
  const [risks, setRisks] = useState<
    Array<{
      id: number;
      risk_name?: string;
      risk_description?: string;
      likelihood?: string;
      severity?: string;
      final_risk_level?: string;
    }>
  >([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setSelectedIds([]);
    getAllProjectRisksByProjectId({ projectId, filter: "active" })
      .then((data: { data?: unknown[] } | unknown[]) => {
        const riskList =
          (data && typeof data === "object" && "data" in data ? data.data : data) || [];
        setRisks(Array.isArray(riskList) ? (riskList as typeof risks) : []);
      })
      .catch(() => setRisks([]))
      .finally(() => setIsLoading(false));
  }, [open, projectId]);

  const toggleRisk = (riskId: number) => {
    setSelectedIds((prev) =>
      prev.includes(riskId) ? prev.filter((id) => id !== riskId) : [...prev, riskId],
    );
  };

  const handleImport = () => {
    const selected = risks
      .filter((r) => selectedIds.includes(r.id))
      .map((r) => ({
        risk_description: r.risk_name || r.risk_description || "Imported risk",
        likelihood: r.likelihood || "Medium",
        severity: r.severity || r.final_risk_level || "Medium",
        linked_project_risk_id: r.id,
      }));
    onImport(selected);
    onClose();
  };

  const availableRisks = risks.filter((r) => !existingLinkedRiskIds.includes(r.id));

  return (
    <StandardModal
      isOpen={open}
      onClose={onClose}
      title="Import from project risks"
      description="Select project risks to import into the FRIA risk register."
      onSubmit={selectedIds.length > 0 ? handleImport : undefined}
      submitButtonText={`Import${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
      maxWidth="700px"
    >
      <Stack spacing={2}>
        {isLoading ? (
          <Typography
            sx={{ fontSize: 13, color: theme.palette.text.secondary, textAlign: "center", py: 4 }}
          >
            Loading project risks...
          </Typography>
        ) : availableRisks.length === 0 ? (
          <Typography
            sx={{ fontSize: 13, color: theme.palette.text.secondary, textAlign: "center", py: 4 }}
          >
            {risks.length === 0
              ? "No project risks found."
              : "All project risks are already linked."}
          </Typography>
        ) : (
          <>
            {selectedIds.length > 0 && (
              <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                {selectedIds.length} selected
              </Typography>
            )}
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ width: 40 }} />
                    <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>Risk name</TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 600, width: 100 }}>
                      Likelihood
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 600, width: 100 }}>
                      Severity
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {availableRisks.map((risk) => (
                    <TableRow
                      key={risk.id}
                      hover
                      onClick={() => toggleRisk(risk.id)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          id={`risk-${risk.id}`}
                          label=""
                          isChecked={selectedIds.includes(risk.id)}
                          value={String(risk.id)}
                          onChange={() => toggleRisk(risk.id)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 13 }}>
                          {risk.risk_name || risk.risk_description || `Risk #${risk.id}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {risk.likelihood && <Chip label={risk.likelihood} size="small" />}
                      </TableCell>
                      <TableCell>
                        {(risk.severity || risk.final_risk_level) && (
                          <Chip label={risk.severity || risk.final_risk_level || ""} size="small" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Stack>
    </StandardModal>
  );
};

export default FriaRiskImportModal;
