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
import StandardModal from "../../../components/Modals/StandardModal";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import { MrmValidationStage } from "../../../../domain/enums/mrm.enum";
import { IMrmFleetRow, IMrmValidation } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";
import {
  useCreateValidation,
  useFleetTiering,
  useValidations,
} from "../../../../application/hooks/useMrm";
import ValidationReportDrawer from "./ValidationReportDrawer";
import {
  fleetModelName,
  mrmErrorMessage,
  tierLabel,
  tierChipVariant,
  VALIDATION_STAGE_LABELS,
  VALIDATION_STAGE_ORDER,
  validationStageChipVariant,
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

interface ValidationTabProps {
  users: MrmUser[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const ValidationTab = ({ users, onError, onSuccess }: ValidationTabProps) => {
  const { data: validations = [], isLoading } = useValidations();
  const { data: fleet = [] } = useFleetTiering();
  const createValidation = useCreateValidation();

  const [selected, setSelected] = useState<IMrmValidation | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [startModelId, setStartModelId] = useState<number | "">("");

  const fleetById = useMemo(() => {
    const map = new Map<number, IMrmFleetRow>();
    fleet.forEach((row) => map.set(row.id, row));
    return map;
  }, [fleet]);

  /** Models that already have an active validation cycle (in_validation or under_review). */
  const activeModelIds = useMemo(() => {
    const ids = new Set<number>();
    validations.forEach((v) => {
      if (
        v.stage === MrmValidationStage.IN_VALIDATION ||
        v.stage === MrmValidationStage.UNDER_REVIEW
      ) {
        ids.add(v.model_inventory_id);
      }
    });
    return ids;
  }, [validations]);

  const availableFleetItems = useMemo(
    () =>
      fleet
        .filter((row) => !activeModelIds.has(row.id))
        .map((row) => ({ _id: row.id, name: fleetModelName(row) })),
    [fleet, activeModelIds],
  );

  const userName = (id?: number | null): string => {
    if (!id) return "—";
    const user = users.find((u) => Number(u.id) === Number(id));
    return user ? `${user.name ?? ""} ${user.surname ?? ""}`.trim() || `User ${id}` : `User ${id}`;
  };

  const stageCounts = useMemo(() => {
    const counts: Record<MrmValidationStage, number> = {
      [MrmValidationStage.NOT_STARTED]: 0,
      [MrmValidationStage.IN_VALIDATION]: 0,
      [MrmValidationStage.UNDER_REVIEW]: 0,
      [MrmValidationStage.VALIDATED]: 0,
    };
    validations.forEach((v) => {
      counts[v.stage] = (counts[v.stage] ?? 0) + 1;
    });
    return counts;
  }, [validations]);

  const modelName = (id: number): string => {
    const row = fleetById.get(id);
    return row ? fleetModelName(row) : `Model ${id}`;
  };

  const handleStart = async () => {
    if (!startModelId) {
      onError("Select a model to start a validation.");
      return;
    }
    try {
      await createValidation.mutateAsync({ modelId: Number(startModelId), payload: {} });
      onSuccess("Validation started");
      setStartOpen(false);
      setStartModelId("");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to start validation"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Staged validation workflow. Each model moves through a defined lifecycle with a
        validation-report template. The validator is separate from the owner.
      </Typography>

      <Box sx={mrmPipelineStyle}>
        {VALIDATION_STAGE_ORDER.map((stage) => (
          <Box key={stage} sx={mrmPipelineItemStyle}>
            <Typography component="span" sx={mrmPipelineCountStyle}>
              {stageCounts[stage]}
            </Typography>
            <span>{VALIDATION_STAGE_LABELS[stage]}</span>
          </Box>
        ))}
      </Box>

      <Box sx={mrmToolbarStyle}>
        <Box />
        <CustomizableButton
          variant="contained"
          text="Start validation"
          onClick={() => setStartOpen(true)}
          testId="mrm-start-validation-btn"
        />
      </Box>

      {isLoading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
      ) : validations.length === 0 ? (
        <EmptyState message="No validations yet. Start a validation to open a report." />
      ) : (
        <TableContainer sx={mrmTableContainerStyle}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={mrmTableHeadCellStyle}>Model</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Tier</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Stage</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Validator</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Report</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Last validated</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Next due</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {validations.map((validation) => {
                const fleetRow = fleetById.get(validation.model_inventory_id);
                return (
                  <TableRow
                    key={validation.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setSelected(validation)}
                  >
                    <TableCell sx={mrmTableCellStyle}>
                      {modelName(validation.model_inventory_id)}
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      <Chip
                        label={tierLabel(fleetRow?.mrm_tier ?? null)}
                        variant={tierChipVariant(fleetRow?.mrm_tier ?? null)}
                        uppercase={false}
                      />
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      <Chip
                        label={VALIDATION_STAGE_LABELS[validation.stage]}
                        variant={validationStageChipVariant(validation.stage)}
                        uppercase={false}
                      />
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      {userName(validation.validator_id)}
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      {validation.report_version || "Draft"}
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      {validation.signed_off_at
                        ? displayFormattedDate(validation.signed_off_at)
                        : "—"}
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      {validation.next_due ? displayFormattedDate(validation.next_due) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ValidationReportDrawer
        validation={selected}
        modelName={selected ? modelName(selected.model_inventory_id) : ""}
        onClose={() => setSelected(null)}
        onError={onError}
        onSuccess={onSuccess}
      />

      <StandardModal
        isOpen={startOpen}
        onClose={() => setStartOpen(false)}
        title="Start validation"
        description="Open a new validation cycle for a model. Only one validation can be in progress per model."
        onSubmit={handleStart}
        submitButtonText="Start"
        isSubmitting={createValidation.isPending}
        fitContent
      >
        <Stack sx={{ gap: "48px" }}>
          <Select
            id="mrm-start-validation-model"
            label="Model"
            placeholder="Select a model"
            isRequired
            value={startModelId}
            items={availableFleetItems}
            onChange={(e) => setStartModelId(Number(e.target.value))}
          />
        </Stack>
      </StandardModal>
    </Box>
  );
};

export default ValidationTab;
