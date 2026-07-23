import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import Checkbox from "../../../components/Inputs/Checkbox";
import StandardModal from "../../../components/Modals/StandardModal";
import { MrmFindingSeverity, MrmFindingStage } from "../../../../domain/enums/mrm.enum";
import { IMrmFinding } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";
import { useUpdateFinding } from "../../../../application/hooks/useMrm";
import {
  FINDING_SEVERITY_LABELS,
  FINDING_SEVERITY_OPTIONS,
  FINDING_STAGE_OPTIONS,
  findingSeverityChipVariant,
  mrmErrorMessage,
} from "./constants";
import { toIsoDateInput } from "./dateUtils";

interface FindingDrawerProps {
  finding: IMrmFinding | null;
  users: MrmUser[];
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const FindingDrawer = ({ finding, users, onClose, onError, onSuccess }: FindingDrawerProps) => {
  const updateFinding = useUpdateFinding();

  const [stage, setStage] = useState<MrmFindingStage>(MrmFindingStage.OPEN);
  const [severity, setSeverity] = useState<MrmFindingSeverity>(MrmFindingSeverity.MEDIUM);
  const [ownerId, setOwnerId] = useState<number | "">("");
  const [remediation, setRemediation] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [closedVerified, setClosedVerified] = useState(false);

  useEffect(() => {
    if (finding) {
      setStage(finding.stage);
      setSeverity(finding.severity);
      setOwnerId(finding.owner_id ?? "");
      setRemediation(finding.remediation_plan ?? "");
      setDueDate(toIsoDateInput(finding.due_date));
      setClosedVerified(finding.closed_verified);
    }
  }, [finding]);

  const handleSave = async () => {
    if (!finding) return;
    if (stage === MrmFindingStage.CLOSED && !closedVerified) {
      onError("A finding must be verified before it can be closed.");
      return;
    }
    try {
      await updateFinding.mutateAsync({
        id: finding.id,
        payload: {
          stage,
          severity,
          owner_id: ownerId === "" ? null : Number(ownerId),
          remediation_plan: remediation.trim() || null,
          due_date: dueDate || null,
          closed_verified: closedVerified,
        },
      });
      onSuccess("Finding updated");
      onClose();
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to update finding"));
    }
  };

  return (
    <StandardModal
      isOpen={!!finding}
      onClose={onClose}
      title="Finding"
      description={finding?.title ?? ""}
      onSubmit={handleSave}
      submitButtonText="Save"
      isSubmitting={updateFinding.isPending}
      maxWidth="720px"
      headerActions={
        finding ? (
          <Chip
            label={FINDING_SEVERITY_LABELS[finding.severity]}
            variant={findingSeverityChipVariant(finding.severity)}
            uppercase={false}
          />
        ) : undefined
      }
    >
      <Stack sx={{ gap: "48px" }}>
        <Stack direction="row" sx={{ gap: "48px" }}>
          <Box sx={{ flex: 1 }}>
            <Select
              id="mrm-finding-stage"
              label="Stage"
              placeholder="Select stage"
              value={stage}
              items={FINDING_STAGE_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
              onChange={(e) => setStage(e.target.value as MrmFindingStage)}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Select
              id="mrm-finding-severity"
              label="Severity"
              placeholder="Select severity"
              value={severity}
              items={FINDING_SEVERITY_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
              onChange={(e) => setSeverity(e.target.value as MrmFindingSeverity)}
            />
          </Box>
        </Stack>

        <Stack direction="row" sx={{ gap: "48px" }}>
          <Box sx={{ flex: 1 }}>
            <Select
              id="mrm-finding-owner"
              label="Owner"
              placeholder="Select an owner"
              isOptional
              value={ownerId}
              items={users.map((u) => ({
                _id: Number(u.id),
                name: u.name ?? "",
                surname: u.surname ?? "",
              }))}
              onChange={(e) => setOwnerId(Number(e.target.value))}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Field
              id="mrm-finding-due"
              label="Due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              isOptional
            />
          </Box>
        </Stack>

        <Field
          id="mrm-finding-remediation"
          label="Remediation plan"
          placeholder="How will this finding be remediated?"
          value={remediation}
          onChange={(e) => setRemediation(e.target.value)}
          multiline
          minRows={3}
          isOptional
        />

        <Box>
          <Checkbox
            id="mrm-finding-verified"
            label="Verified — remediation confirmed effective"
            isChecked={closedVerified}
            value="closed_verified"
            onChange={(e) => setClosedVerified(e.target.checked)}
          />
          <Typography
            sx={{ fontSize: "12px", color: "text.tertiary", marginTop: "4px", marginLeft: "28px" }}
          >
            A finding must be verified before it can be closed.
          </Typography>
        </Box>
      </Stack>
    </StandardModal>
  );
};

export default FindingDrawer;
