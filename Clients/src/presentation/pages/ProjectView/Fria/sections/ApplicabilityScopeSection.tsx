import { useState } from "react";
import { Box } from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import dayjs from "dayjs";
import Field from "../../../../components/Inputs/Field";
import Select from "../../../../components/Inputs/Select";
import DatePicker from "../../../../components/Inputs/Datepicker";
import { FriaAssessment } from "../../../../../application/hooks/useFria";
import FriaEvidenceButton from "../FriaEvidenceButton";
import FriaSectionCard from "../FriaSectionCard";
import { EU_ACT_LINK } from "../friaConstants";
import { brand } from "../../../../themes/palette";

interface ApplicabilityScopeSectionProps {
  assessment: FriaAssessment;
  onUpdate: (data: Partial<FriaAssessment>) => void;
  isSaving: boolean;
}

const HIGH_RISK_OPTIONS = [
  { _id: "Yes", name: "Yes" },
  { _id: "No", name: "No" },
  { _id: "Needs legal review", name: "Needs legal review" },
];

const HIGH_RISK_BASIS_OPTIONS = [
  { _id: "Annex I product", name: "Annex I product" },
  { _id: "Annex III use case", name: "Annex III use case" },
  { _id: "Unclear", name: "Unclear" },
];

const DEPLOYER_TYPE_OPTIONS = [
  { _id: "Body governed by public law", name: "Body governed by public law" },
  { _id: "Private entity serving public interest", name: "Private entity serving public interest" },
  { _id: "Private entity", name: "Private entity" },
  { _id: "Other", name: "Other" },
];

const ANNEX_III_OPTIONS = [
  { _id: "1-Biometric identification", name: "1 — Biometric identification" },
  { _id: "2-Critical infrastructure", name: "2 — Critical infrastructure" },
  { _id: "3-Education", name: "3 — Education" },
  { _id: "4-Employment", name: "4 — Employment" },
  { _id: "5-Essential services", name: "5 — Essential services" },
  { _id: "6-Law enforcement", name: "6 — Law enforcement" },
  { _id: "7-Migration/asylum", name: "7 — Migration / asylum" },
  { _id: "8-Administration of justice", name: "8 — Administration of justice" },
];

const REVIEW_CYCLE_OPTIONS = [
  { _id: "Quarterly", name: "Quarterly" },
  { _id: "Every 6 months", name: "Every 6 months" },
  { _id: "Annually", name: "Annually" },
  { _id: "On material change", name: "On material change" },
];

function ApplicabilityScopeSection({
  assessment,
  onUpdate,
  isSaving,
}: ApplicabilityScopeSectionProps) {
  const [periodFrequency, setPeriodFrequency] = useState(assessment.period_frequency ?? "");
  const [friaRationale, setFriaRationale] = useState(assessment.fria_rationale ?? "");

  const handleSelectChange =
    (field: keyof FriaAssessment) => (e: SelectChangeEvent<string | number>) => {
      onUpdate({ [field]: e.target.value as string });
    };

  const handleFirstUseDateChange = (value: unknown) => {
    const dateValue = value as { toISOString?: () => string } | null;
    const iso = dateValue?.toISOString ? dateValue.toISOString() : null;
    onUpdate({ first_use_date: iso });
  };

  const handlePeriodFrequencyBlur = () => {
    if (periodFrequency !== (assessment.period_frequency ?? "")) {
      onUpdate({ period_frequency: periodFrequency });
    }
  };

  const handleFriaRationaleBlur = () => {
    if (friaRationale !== (assessment.fria_rationale ?? "")) {
      onUpdate({ fria_rationale: friaRationale });
    }
  };

  return (
    <FriaSectionCard
      title="2. Applicability & scope"
      subtitle="Determine if this AI system requires a FRIA under EU AI Act Article 27."
      euActContent={
        <>
          <strong>EU AI Act reference:</strong>{" "}
          <a
            href={`${EU_ACT_LINK}#art_6`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 6
          </a>{" "}
          defines classification rules for high-risk AI systems.{" "}
          <a
            href={`${EU_ACT_LINK}#anx_I`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Annex I
          </a>{" "}
          lists Union harmonisation legislation, and{" "}
          <a
            href={`${EU_ACT_LINK}#anx_III`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Annex III
          </a>{" "}
          enumerates high-risk use-case areas. A FRIA is mandatory under{" "}
          <a
            href={`${EU_ACT_LINK}#art_27`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 27(1)
          </a>{" "}
          for deployers that are bodies governed by public law or private entities providing public
          services.
        </>
      }
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: "8px",
        }}
      >
        <Select
          id="is-high-risk"
          label="Is this a high-risk AI system?"
          placeholder="Select…"
          value={assessment.is_high_risk ?? ""}
          items={HIGH_RISK_OPTIONS}
          onChange={handleSelectChange("is_high_risk")}
          disabled={isSaving}
        />

        {assessment.is_high_risk === "Yes" && (
          <Select
            id="high-risk-basis"
            label="High-risk basis"
            placeholder="Select…"
            value={assessment.high_risk_basis ?? ""}
            items={HIGH_RISK_BASIS_OPTIONS}
            onChange={handleSelectChange("high_risk_basis")}
            disabled={isSaving}
          />
        )}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: "8px",
        }}
      >
        <Select
          id="deployer-type"
          label="Deployer type"
          placeholder="Select…"
          value={assessment.deployer_type ?? ""}
          items={DEPLOYER_TYPE_OPTIONS}
          onChange={handleSelectChange("deployer_type")}
          disabled={isSaving}
        />

        <Select
          id="annex-iii-category"
          label="Annex III category"
          placeholder="Select…"
          value={assessment.annex_iii_category ?? ""}
          items={ANNEX_III_OPTIONS}
          onChange={handleSelectChange("annex_iii_category")}
          disabled={isSaving}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: "8px",
        }}
      >
        <DatePicker
          label="First use date"
          date={assessment.first_use_date ? dayjs(assessment.first_use_date) : null}
          handleDateChange={handleFirstUseDateChange}
          disabled={isSaving}
        />

        <Select
          id="review-cycle"
          label="Review cycle"
          placeholder="Select…"
          value={assessment.review_cycle ?? ""}
          items={REVIEW_CYCLE_OPTIONS}
          onChange={handleSelectChange("review_cycle")}
          disabled={isSaving}
        />
      </Box>

      <Field
        id="period-frequency"
        label="Period / frequency details"
        placeholder="Describe any additional scheduling detail for assessments and reviews…"
        type="description"
        rows={3}
        value={periodFrequency}
        onChange={(e) => setPeriodFrequency(e.target.value)}
        onBlur={handlePeriodFrequencyBlur}
        disabled={isSaving}
      />

      <Field
        id="fria-rationale"
        label="FRIA rationale"
        placeholder="Explain why a FRIA is required or not required for this system, referencing the relevant legal basis…"
        type="description"
        rows={4}
        value={friaRationale}
        onChange={(e) => setFriaRationale(e.target.value)}
        onBlur={handleFriaRationaleBlur}
        disabled={isSaving}
      />

      <FriaEvidenceButton friaId={assessment.id} entityType="section_2" />
    </FriaSectionCard>
  );
}

export default ApplicabilityScopeSection;
