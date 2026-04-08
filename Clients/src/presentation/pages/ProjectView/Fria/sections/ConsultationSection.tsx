import { useState } from "react";
import { Box } from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import Field from "../../../../components/Inputs/Field";
import Select from "../../../../components/Inputs/Select";
import { FriaAssessment } from "../../../../../application/hooks/useFria";
import FriaEvidenceButton from "../FriaEvidenceButton";
import FriaSectionCard from "../FriaSectionCard";
import { EU_ACT_LINK } from "../friaConstants";
import { brand } from "../../../../themes/palette";

interface ConsultationSectionProps {
  assessment: FriaAssessment;
  onUpdate: (data: Partial<FriaAssessment>) => void;
  isSaving: boolean;
}

const REVIEW_STATUS_OPTIONS = [
  { _id: "Yes", name: "Yes" },
  { _id: "No", name: "No" },
  { _id: "Planned", name: "Planned" },
];

function ConsultationSection({
  assessment,
  onUpdate,
  isSaving,
}: ConsultationSectionProps) {
  const [stakeholdersConsulted, setStakeholdersConsulted] = useState(
    assessment.stakeholders_consulted ?? ""
  );
  const [consultationNotes, setConsultationNotes] = useState(
    assessment.consultation_notes ?? ""
  );

  const handleSelectChange =
    (field: keyof FriaAssessment) => (e: SelectChangeEvent<string | number>) => {
      onUpdate({ [field]: e.target.value as string });
    };

  const handleTextBlur =
    (
      field: keyof FriaAssessment,
      currentVal: string,
      originalVal: string | null
    ) =>
    () => {
      if (currentVal !== (originalVal ?? "")) {
        onUpdate({ [field]: currentVal });
      }
    };

  return (
    <FriaSectionCard
      title="7. Stakeholder consultation & sign-off"
      subtitle="Record the consultation process and approvals required before deploying the AI system."
      euActContent={
        <>
          <strong>EU AI Act reference:</strong>{" "}
          <a href={`${EU_ACT_LINK}#art_27`} target="_blank" rel="noopener noreferrer" style={{ color: brand.primary }}>
            Article 27(3)
          </a>{" "}
          requires deployers to notify the relevant market surveillance authority of the FRIA results.{" "}
          <a href={`${EU_ACT_LINK}#art_27`} target="_blank" rel="noopener noreferrer" style={{ color: brand.primary }}>
            Article 27(4)
          </a>{" "}
          states that where data protection impact assessments (DPIAs) are already required, the FRIA may complement that process. Consultation with your DPO and legal team is recommended.
        </>
      }
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
          gap: "8px",
        }}
      >
        <Select
          id="legal-review"
          label="Legal review status"
          placeholder="Select…"
          value={assessment.legal_review ?? ""}
          items={REVIEW_STATUS_OPTIONS}
          onChange={handleSelectChange("legal_review")}
          disabled={isSaving}
        />

        <Select
          id="dpo-review"
          label="DPO review status"
          placeholder="Select…"
          value={assessment.dpo_review ?? ""}
          items={REVIEW_STATUS_OPTIONS}
          onChange={handleSelectChange("dpo_review")}
          disabled={isSaving}
        />

        <Select
          id="owner-approval"
          label="Owner approval status"
          placeholder="Select…"
          value={assessment.owner_approval ?? ""}
          items={REVIEW_STATUS_OPTIONS}
          onChange={handleSelectChange("owner_approval")}
          disabled={isSaving}
        />
      </Box>

      <Field
        id="stakeholders-consulted"
        label="Stakeholders consulted"
        placeholder="List the individuals, teams, or external parties consulted during this assessment…"
        type="description"
        rows={3}
        value={stakeholdersConsulted}
        onChange={(e) => setStakeholdersConsulted(e.target.value)}
        onBlur={handleTextBlur(
          "stakeholders_consulted",
          stakeholdersConsulted,
          assessment.stakeholders_consulted
        )}
        disabled={isSaving}
      />

      <Field
        id="consultation-notes"
        label="Consultation notes"
        placeholder="Summarise the key findings, concerns raised, and outcomes from the consultation process…"
        type="description"
        rows={4}
        value={consultationNotes}
        onChange={(e) => setConsultationNotes(e.target.value)}
        onBlur={handleTextBlur(
          "consultation_notes",
          consultationNotes,
          assessment.consultation_notes
        )}
        disabled={isSaving}
      />

      <FriaEvidenceButton friaId={assessment.id} entityType="section_7" />
    </FriaSectionCard>
  );
}

export default ConsultationSection;
