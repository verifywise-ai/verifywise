import { useState } from "react";
import { Box } from "@mui/material";
import dayjs from "dayjs";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import DatePicker from "../../../components/Inputs/Datepicker";
import { CustomizableButton } from "../../../components/button/customizable-button";
import type {
  IntakeSuggestedRisk,
  SuggestedRiskPatch,
  SuggestionLikelihood,
  SuggestionSeverity,
} from "../../../../application/repository/intakeForm.repository";

export const LIKELIHOODS: SuggestionLikelihood[] = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost Certain",
];
export const SEVERITIES: SuggestionSeverity[] = [
  "Negligible",
  "Minor",
  "Moderate",
  "Major",
  "Catastrophic",
];
export const MODEL_RISK_CATEGORIES = [
  "Performance",
  "Bias & Fairness",
  "Security",
  "Data Quality",
  "Compliance",
];
export const MODEL_RISK_LEVELS = ["Low", "Medium", "High", "Critical"];

const items = (values: string[]) => values.map((v) => ({ _id: v, name: v }));

const NAME_MAX = 200;
const TEXT_MAX = 1000;

export interface SuggestedRiskEditorProps {
  risk: IntakeSuggestedRisk;
  isModel: boolean;
  saving: boolean;
  onSave(patch: SuggestedRiskPatch): void;
  onCancel(): void;
}

/** Inline edit of one suggested risk; sends only the fields that changed. */
function SuggestedRiskEditor({
  risk,
  isModel,
  saving,
  onSave,
  onCancel,
}: SuggestedRiskEditorProps) {
  const [draft, setDraft] = useState({
    name: risk.name,
    description: risk.description,
    likelihood: risk.likelihood,
    severity: risk.severity,
    mitigationPlan: risk.mitigationPlan,
    implementationStrategy: risk.implementationStrategy,
    deadline: risk.deadline,
    modelRiskCategory: risk.modelRiskCategory ?? "",
    modelRiskLevel: risk.modelRiskLevel ?? "",
  });
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const nameError = !draft.name.trim()
    ? "Name is required"
    : draft.name.trim().length > NAME_MAX
      ? `Name must be at most ${NAME_MAX} characters`
      : undefined;
  const tooLong = (v: string) =>
    v.trim().length > TEXT_MAX ? `Must be at most ${TEXT_MAX} characters` : undefined;
  const mitigationError =
    risk.state === "accepted" && !draft.mitigationPlan.trim()
      ? "An accepted risk needs a mitigation plan"
      : tooLong(draft.mitigationPlan);
  const invalid =
    !!nameError ||
    !!tooLong(draft.description) ||
    !!mitigationError ||
    !!tooLong(draft.implementationStrategy);

  function handleSave() {
    const patch: SuggestedRiskPatch = {};
    if (draft.name.trim() !== risk.name) patch.name = draft.name.trim();
    if (draft.description.trim() !== risk.description) patch.description = draft.description.trim();
    if (draft.likelihood !== risk.likelihood) patch.likelihood = draft.likelihood;
    if (draft.severity !== risk.severity) patch.severity = draft.severity;
    if (draft.mitigationPlan.trim() !== risk.mitigationPlan) {
      patch.mitigationPlan = draft.mitigationPlan.trim();
    }
    if (draft.implementationStrategy.trim() !== risk.implementationStrategy) {
      patch.implementationStrategy = draft.implementationStrategy.trim();
    }
    if (draft.deadline !== risk.deadline) patch.deadline = draft.deadline;
    if (isModel && draft.modelRiskCategory && draft.modelRiskCategory !== risk.modelRiskCategory) {
      patch.modelRiskCategory = draft.modelRiskCategory;
    }
    if (isModel && draft.modelRiskLevel && draft.modelRiskLevel !== risk.modelRiskLevel) {
      patch.modelRiskLevel = draft.modelRiskLevel;
    }
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "12px", pt: "8px" }}>
      <Field
        id={`suggestion-${risk.id}-name`}
        label="Name"
        value={draft.name}
        onChange={(e) => set("name", e.target.value)}
        error={nameError}
      />
      <Field
        id={`suggestion-${risk.id}-description`}
        label="Description"
        value={draft.description}
        onChange={(e) => set("description", e.target.value)}
        rows={2}
        error={tooLong(draft.description)}
      />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <Select
          id={`suggestion-${risk.id}-likelihood`}
          label="Likelihood"
          value={draft.likelihood}
          items={items(LIKELIHOODS)}
          onChange={(e) => set("likelihood", e.target.value as SuggestionLikelihood)}
        />
        <Select
          id={`suggestion-${risk.id}-severity`}
          label="Severity"
          value={draft.severity}
          items={items(SEVERITIES)}
          onChange={(e) => set("severity", e.target.value as SuggestionSeverity)}
        />
        {isModel && (
          <>
            <Select
              id={`suggestion-${risk.id}-model-category`}
              label="Model risk category"
              value={draft.modelRiskCategory}
              items={items(MODEL_RISK_CATEGORIES)}
              onChange={(e) => set("modelRiskCategory", String(e.target.value))}
            />
            <Select
              id={`suggestion-${risk.id}-model-level`}
              label="Model risk level"
              value={draft.modelRiskLevel}
              items={items(MODEL_RISK_LEVELS)}
              onChange={(e) => set("modelRiskLevel", String(e.target.value))}
            />
          </>
        )}
      </Box>
      <Field
        id={`suggestion-${risk.id}-mitigation`}
        label="Mitigation plan"
        value={draft.mitigationPlan}
        onChange={(e) => set("mitigationPlan", e.target.value)}
        rows={2}
        error={mitigationError}
      />
      {!isModel && (
        <Field
          id={`suggestion-${risk.id}-strategy`}
          label="Implementation strategy"
          value={draft.implementationStrategy}
          onChange={(e) => set("implementationStrategy", e.target.value)}
          rows={2}
          error={tooLong(draft.implementationStrategy)}
        />
      )}
      <DatePicker
        id={`suggestion-${risk.id}-deadline`}
        label="Deadline"
        isOptional
        optionalLabel="(default: 90 days after approval)"
        date={draft.deadline ? dayjs(draft.deadline) : null}
        handleDateChange={(d) => set("deadline", d && d.isValid() ? d.format("YYYY-MM-DD") : null)}
      />
      <Box sx={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <CustomizableButton variant="outlined" size="small" text="Cancel" onClick={onCancel} />
        <CustomizableButton
          variant="contained"
          size="small"
          text="Save"
          isDisabled={invalid || saving}
          loading={saving}
          onClick={handleSave}
          testId={`suggestion-${risk.id}-save`}
        />
      </Box>
    </Box>
  );
}

export default SuggestedRiskEditor;
