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
import {
  MrmBreachAction,
  MrmThresholdOp,
  MrmThresholdSeverity,
} from "../../../../domain/enums/mrm.enum";
import { IMrmThreshold } from "../../../../domain/interfaces/i.mrm";
import {
  useCreateThreshold,
  useDeleteThreshold,
  useFleetTiering,
  useThresholds,
  useUpdateThreshold,
} from "../../../../application/hooks/useMrm";
import {
  BREACH_ACTION_OPTIONS,
  breachActionLabel,
  fleetModelName,
  mrmErrorMessage,
  THRESHOLD_SEVERITY_OPTIONS,
  THRESHOLD_SHAPE_OPTIONS,
  thresholdOpLabel,
  thresholdSeverityChipVariant,
  thresholdSeverityLabel,
  thresholdSummary,
} from "./constants";
import {
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
} from "./mrmStyles";

interface DefaultThresholdsSectionProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

interface ThresholdForm {
  modelId: number | "";
  metric: string;
  op: MrmThresholdOp | "";
  valueNum: string;
  valueLo: string;
  valueHi: string;
  severity: MrmThresholdSeverity;
  breachAction: MrmBreachAction;
}

const emptyForm: ThresholdForm = {
  modelId: "",
  metric: "",
  op: "",
  valueNum: "",
  valueLo: "",
  valueHi: "",
  severity: MrmThresholdSeverity.WARN,
  breachAction: MrmBreachAction.NOTIFY,
};

const DefaultThresholdsSection = ({ onError, onSuccess }: DefaultThresholdsSectionProps) => {
  const { data: fleet = [] } = useFleetTiering();
  const { data: thresholds = [] } = useThresholds();
  const createThreshold = useCreateThreshold();
  const updateThreshold = useUpdateThreshold();
  const deleteThreshold = useDeleteThreshold();

  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState<IMrmThreshold | null>(null);
  const [form, setForm] = useState<ThresholdForm>(emptyForm);

  const modelName = useMemo(() => {
    const byId = new Map(fleet.map((row) => [row.id, fleetModelName(row)]));
    return (id: number) => byId.get(id) ?? "Unknown model";
  }, [fleet]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (t: IMrmThreshold) => {
    setEditing(t);
    setForm({
      modelId: t.model_inventory_id,
      metric: t.metric,
      op: t.op,
      valueNum: t.value_num != null ? String(t.value_num) : "",
      valueLo: t.value_lo != null ? String(t.value_lo) : "",
      valueHi: t.value_hi != null ? String(t.value_hi) : "",
      severity: t.severity,
      breachAction: t.breach_action,
    });
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const isBand = form.op === MrmThresholdOp.OUTSIDE;

  const handleSubmit = async () => {
    if (!editing && form.modelId === "") {
      onError("Select a model for this threshold.");
      return;
    }
    if (!form.metric.trim()) {
      onError("Enter the metric key this threshold applies to.");
      return;
    }
    if (form.op === "") {
      onError("Select a threshold shape.");
      return;
    }
    if (isBand) {
      const lo = Number(form.valueLo);
      const hi = Number(form.valueHi);
      if (!form.valueLo || !form.valueHi || Number.isNaN(lo) || Number.isNaN(hi)) {
        onError("A band needs both a minimum and a maximum value.");
        return;
      }
      if (lo >= hi) {
        onError("The band minimum must be below the maximum.");
        return;
      }
    } else if (!form.valueNum || Number.isNaN(Number(form.valueNum))) {
      onError("Enter a numeric threshold value.");
      return;
    }

    const shared = {
      op: form.op as MrmThresholdOp,
      value_num: isBand ? null : Number(form.valueNum),
      value_lo: isBand ? Number(form.valueLo) : null,
      value_hi: isBand ? Number(form.valueHi) : null,
      severity: form.severity,
      breach_action: form.breachAction,
    };

    try {
      if (editing) {
        await updateThreshold.mutateAsync({ id: editing.id, payload: shared });
        onSuccess("Threshold updated");
      } else {
        await createThreshold.mutateAsync({
          modelId: Number(form.modelId),
          payload: { metric: form.metric.trim(), ...shared },
        });
        onSuccess("Threshold created");
      }
      close();
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to save threshold"));
    }
  };

  const handleDelete = async (t: IMrmThreshold) => {
    try {
      await deleteThreshold.mutateAsync(t.id);
      onSuccess("Threshold deleted");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to delete threshold"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Thresholds VerifyWise evaluates ingested metrics against. Five shapes cover the common
        cases: floor (≥), above (&gt;), ceiling (≤), below (&lt;) and band (a min–max the value must
        stay inside). A breach raises an alert and can flag the model for revalidation.
      </Typography>

      <Box sx={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <CustomizableButton
          variant="contained"
          text="Add threshold"
          onClick={openCreate}
          testId="mrm-add-threshold-btn"
        />
      </Box>

      {thresholds.length === 0 ? (
        <EmptyState message="No thresholds defined yet. Add one so ingested metrics can be evaluated." />
      ) : (
        <TableContainer sx={mrmTableContainerStyle}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={mrmTableHeadCellStyle}>Model</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Metric</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Shape</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Threshold</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Severity</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>On breach</TableCell>
                <TableCell sx={mrmTableHeadCellStyle} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {thresholds.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell sx={mrmTableCellStyle}>{modelName(t.model_inventory_id)}</TableCell>
                  <TableCell sx={{ ...mrmTableCellStyle, fontFamily: "monospace" }}>
                    {t.metric}
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle}>{thresholdOpLabel(t.op)}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>{thresholdSummary(t)}</TableCell>
                  <TableCell sx={mrmTableCellStyle}>
                    <Chip
                      label={thresholdSeverityLabel(t.severity)}
                      variant={thresholdSeverityChipVariant(t.severity)}
                      uppercase={false}
                    />
                  </TableCell>
                  <TableCell sx={mrmTableCellStyle}>{breachActionLabel(t.breach_action)}</TableCell>
                  <TableCell sx={mrmTableCellStyle} align="right">
                    <Stack direction="row" sx={{ gap: "8px", justifyContent: "flex-end" }}>
                      <CustomizableButton
                        variant="outlined"
                        size="small"
                        text="Edit"
                        onClick={() => openEdit(t)}
                        testId="mrm-edit-threshold-btn"
                      />
                      <CustomizableButton
                        variant="outlined"
                        size="small"
                        text="Delete"
                        onClick={() => handleDelete(t)}
                        isDisabled={deleteThreshold.isPending}
                        testId="mrm-delete-threshold-btn"
                      />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <StandardModal
        isOpen={isOpen}
        onClose={close}
        title={editing ? "Edit threshold" : "Add threshold"}
        description="Set the metric, shape and severity VerifyWise evaluates ingested points against."
        onSubmit={handleSubmit}
        submitButtonText="Save"
        isSubmitting={createThreshold.isPending || updateThreshold.isPending}
        fitContent
      >
        <Stack sx={{ gap: "16px" }}>
          {!editing && (
            <Select
              id="mrm-threshold-model"
              label="Model"
              placeholder="Select a model"
              isRequired
              value={form.modelId}
              items={fleet.map((row) => ({ _id: row.id, name: fleetModelName(row) }))}
              onChange={(e) => setForm((p) => ({ ...p, modelId: Number(e.target.value) }))}
            />
          )}
          <Field
            id="mrm-threshold-metric"
            label="Metric key"
            placeholder="e.g. psi, gini, auc"
            isRequired
            value={form.metric}
            disabled={editing !== null}
            onChange={(e) => setForm((p) => ({ ...p, metric: e.target.value }))}
          />
          <Select
            id="mrm-threshold-shape"
            label="Shape"
            placeholder="Select a shape"
            isRequired
            value={form.op}
            items={THRESHOLD_SHAPE_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
            onChange={(e) => setForm((p) => ({ ...p, op: e.target.value as MrmThresholdOp }))}
          />
          {isBand ? (
            <Stack direction="row" sx={{ gap: "16px" }}>
              <Field
                id="mrm-threshold-lo"
                label="Minimum"
                type="number"
                isRequired
                value={form.valueLo}
                onChange={(e) => setForm((p) => ({ ...p, valueLo: e.target.value }))}
              />
              <Field
                id="mrm-threshold-hi"
                label="Maximum"
                type="number"
                isRequired
                value={form.valueHi}
                onChange={(e) => setForm((p) => ({ ...p, valueHi: e.target.value }))}
              />
            </Stack>
          ) : (
            <Field
              id="mrm-threshold-value"
              label="Value"
              type="number"
              isRequired
              value={form.valueNum}
              onChange={(e) => setForm((p) => ({ ...p, valueNum: e.target.value }))}
            />
          )}
          <Select
            id="mrm-threshold-severity"
            label="Severity"
            value={form.severity}
            items={THRESHOLD_SEVERITY_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
            onChange={(e) =>
              setForm((p) => ({ ...p, severity: e.target.value as MrmThresholdSeverity }))
            }
          />
          <Select
            id="mrm-threshold-breach-action"
            label="On breach"
            value={form.breachAction}
            items={BREACH_ACTION_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
            onChange={(e) =>
              setForm((p) => ({ ...p, breachAction: e.target.value as MrmBreachAction }))
            }
          />
        </Stack>
      </StandardModal>
    </Box>
  );
};

export default DefaultThresholdsSection;
