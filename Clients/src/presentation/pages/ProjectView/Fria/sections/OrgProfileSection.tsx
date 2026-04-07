import { useState } from "react";
import { Box } from "@mui/material";
import dayjs from "dayjs";
import Field from "../../../../components/Inputs/Field";
import DatePicker from "../../../../components/Inputs/Datepicker";
import { FriaAssessment } from "../../../../../application/hooks/useFria";
import FriaEvidenceButton from "../FriaEvidenceButton";
import FriaSectionCard from "../FriaSectionCard";
import { EU_ACT_LINK } from "../friaConstants";
import { brand } from "../../../../themes/palette";

interface OrgProfileSectionProps {
  assessment: FriaAssessment;
  onUpdate: (data: Partial<FriaAssessment>) => void;
  isSaving: boolean;
}

function OrgProfileSection({ assessment, onUpdate, isSaving }: OrgProfileSectionProps) {
  const [assessmentOwner, setAssessmentOwner] = useState(
    assessment.assessment_owner ?? ""
  );
  const [operationalContext, setOperationalContext] = useState(
    assessment.operational_context ?? ""
  );

  const handleOwnerBlur = () => {
    if (assessmentOwner !== (assessment.assessment_owner ?? "")) {
      onUpdate({ assessment_owner: assessmentOwner });
    }
  };

  const handleContextBlur = () => {
    if (operationalContext !== (assessment.operational_context ?? "")) {
      onUpdate({ operational_context: operationalContext });
    }
  };

  const handleDateChange = (value: unknown) => {
    const dateValue = value as { toISOString?: () => string } | null;
    const iso = dateValue?.toISOString ? dateValue.toISOString() : null;
    onUpdate({ assessment_date: iso });
  };

  return (
    <FriaSectionCard
      title="1. Organisation & system profile"
      subtitle="Identify the deployer organisation and the AI system under assessment."
      euActContent={
        <>
          <strong>EU AI Act reference:</strong>{" "}
          <a href={`${EU_ACT_LINK}#art_27`} target="_blank" rel="noopener noreferrer" style={{ color: brand.primary }}>
            Article 27(1)
          </a>{" "}
          requires deployers of high-risk AI systems to perform a fundamental rights impact assessment before putting the system into use.
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
        <Field
          id="org-name"
          label="Organisation name"
          value={assessment.organization_name ?? ""}
          disabled
          onChange={() => {}}
        />
        <Field
          id="project-title"
          label="System / project name"
          value={assessment.project_title ?? ""}
          disabled
          onChange={() => {}}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: "8px",
        }}
      >
        <Field
          id="assessment-owner"
          label="Assessment owner"
          placeholder="Enter name or role"
          value={assessmentOwner}
          onChange={(e) => setAssessmentOwner(e.target.value)}
          onBlur={handleOwnerBlur}
          disabled={isSaving}
        />
        <DatePicker
          label="Assessment date"
          date={assessment.assessment_date ? dayjs(assessment.assessment_date) : null}
          handleDateChange={handleDateChange}
          disabled={isSaving}
        />
      </Box>

      <Field
        id="operational-context"
        label="Operational context"
        placeholder="Describe the operational context, deployment environment and intended purpose of the AI system…"
        type="description"
        rows={4}
        value={operationalContext}
        onChange={(e) => setOperationalContext(e.target.value)}
        onBlur={handleContextBlur}
        disabled={isSaving}
      />

      <FriaEvidenceButton friaId={assessment.id} entityType="section_1" />
    </FriaSectionCard>
  );
}

export default OrgProfileSection;
