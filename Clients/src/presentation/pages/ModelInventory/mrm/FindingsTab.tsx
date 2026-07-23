import { useMemo, useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import { MrmFindingSeverity, MrmFindingStage } from "../../../../domain/enums/mrm.enum";
import { IMrmFinding, IMrmFleetRow } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";
import {
  useCreateFinding,
  useFindings,
  useFleetTiering,
  useValidations,
} from "../../../../application/hooks/useMrm";
import FindingDrawer from "./FindingDrawer";
import {
  FINDING_SEVERITY_LABELS,
  FINDING_SEVERITY_OPTIONS,
  FINDING_STAGE_LABELS,
  FINDING_STAGE_ORDER,
  fleetModelName,
  findingSeverityChipVariant,
  findingStageChipVariant,
  mrmErrorMessage,
} from "./constants";
import {
  mrmPipelineCountStyle,
  mrmPipelineItemStyle,
  mrmPipelineStyle,
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
  mrmToolbarStyle,
} from "./mrmStyles";

interface FindingsTabProps {
  users: MrmUser[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const FindingsTab = ({ users, onError, onSuccess }: FindingsTabProps) => {
  const { data: findings = [], isLoading } = useFindings();
  const { data: fleet = [] } = useFleetTiering();
  const { data: validations = [] } = useValidations();
  const createFinding = useCreateFinding();

  const [selected, setSelected] = useState<IMrmFinding | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [validationId, setValidationId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<MrmFindingSeverity>(MrmFindingSeverity.MEDIUM);

  const fleetById = useMemo(() => {
    const map = new Map<number, IMrmFleetRow>();
    fleet.forEach((row) => map.set(row.id, row));
    return map;
  }, [fleet]);

  const modelName = (id: number): string => {
    const row = fleetById.get(id);
    return row ? fleetModelName(row) : `Model ${id}`;
  };

  const userName = (id?: number | null): string => {
    if (!id) return "—";
    const user = users.find((u) => Number(u.id) === Number(id));
    return user ? `${user.name ?? ""} ${user.surname ?? ""}`.trim() || `User ${id}` : `User ${id}`;
  };

  const stageCounts = useMemo(() => {
    const counts = {} as Record<MrmFindingStage, number>;
    FINDING_STAGE_ORDER.forEach((stage) => {
      counts[stage] = 0;
    });
    findings.forEach((f) => {
      counts[f.stage] = (counts[f.stage] ?? 0) + 1;
    });
    return counts;
  }, [findings]);

  const validationLabel = (validation: (typeof validations)[number]): string =>
    `${modelName(validation.model_inventory_id)} — validation #${validation.id}`;

  const handleCreate = async () => {
    if (!validationId) {
      onError("Select a validation to raise the finding against.");
      return;
    }
    if (!title.trim()) {
      onError("A finding title is required.");
      return;
    }
    try {
      await createFinding.mutateAsync({
        validationId: Number(validationId),
        payload: { title: title.trim(), severity },
      });
      onSuccess("Finding created");
      setCreateOpen(false);
      setValidationId("");
      setTitle("");
      setSeverity(MrmFindingSeverity.MEDIUM);
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to create finding"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        A finding links back to the validation that raised it and forward to the model&apos;s status
        — an open critical or high finding can restrict the model. Findings are audit records and
        are never deleted; they move through the lifecycle to closure.
      </Typography>

      <Box sx={mrmPipelineStyle}>
        {FINDING_STAGE_ORDER.map((stage) => (
          <Box key={stage} sx={mrmPipelineItemStyle}>
            <Typography component="span" sx={mrmPipelineCountStyle}>
              {stageCounts[stage]}
            </Typography>
            <span>{FINDING_STAGE_LABELS[stage]}</span>
          </Box>
        ))}
      </Box>

      <Box sx={mrmToolbarStyle}>
        <Box />
        <CustomizableButton
          variant="contained"
          text="Create finding"
          onClick={() => setCreateOpen(true)}
        />
      </Box>

      {isLoading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
      ) : findings.length === 0 ? (
        <EmptyState message="No findings raised yet. Findings are created from a validation." />
      ) : (
        <TableContainer sx={mrmTableContainerStyle}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={mrmTableHeadCellStyle}>Finding</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Model</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Severity</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Owner</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Remediation plan</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Due</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Stage</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {findings.map((finding) => (
                <TableRow
                  key={finding.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => setSelected(finding)}
                >
                  <TableCell sx={mrmTableCellStyle}>{finding.title}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    {modelName(finding.model_inventory_id)}
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    <Chip
                      label={FINDING_SEVERITY_LABELS[finding.severity]}
                      variant={findingSeverityChipVariant(finding.severity)}
                      uppercase={false}
                    />
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle}>{userName(finding.owner_id)}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>{finding.remediation_plan || "—"}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    {finding.due_date ? displayFormattedDate(finding.due_date) : "—"}
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    <Chip
                      label={FINDING_STAGE_LABELS[finding.stage]}
                      variant={findingStageChipVariant(finding.stage)}
                      uppercase={false}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <FindingDrawer
        finding={selected}
        users={users}
        onClose={() => setSelected(null)}
        onError={onError}
        onSuccess={onSuccess}
      />

      <StandardModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create finding"
        description="Raise a finding against a validation. It joins the register and tracks to closure."
        onSubmit={handleCreate}
        submitButtonText="Create"
        isSubmitting={createFinding.isPending}
        fitContent
      >
        <Stack sx={{ gap: "48px" }}>
          <Select
            id="mrm-finding-validation"
            label="Validation"
            placeholder="Select a validation"
            isRequired
            value={validationId}
            items={validations.map((v) => ({ _id: v.id, name: validationLabel(v) }))}
            onChange={(e) => setValidationId(Number(e.target.value))}
          />
          <Field
            id="mrm-finding-title"
            label="Finding"
            placeholder="Short description of the finding"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            isRequired
          />
          <Select
            id="mrm-finding-create-severity"
            label="Severity"
            placeholder="Select severity"
            value={severity}
            items={FINDING_SEVERITY_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
            onChange={(e) => setSeverity(e.target.value as MrmFindingSeverity)}
          />
        </Stack>
      </StandardModal>
    </Box>
  );
};

export default FindingsTab;
