import { useState } from "react";
import Field from "../../../../components/Inputs/Field";
import { FriaAssessment } from "../../../../../application/hooks/useFria";
import FriaEvidenceButton from "../FriaEvidenceButton";
import FriaSectionCard from "../FriaSectionCard";
import { EU_ACT_LINK } from "../friaConstants";
import { brand } from "../../../../themes/palette";

interface OversightSectionProps {
  assessment: FriaAssessment;
  onUpdate: (data: Partial<FriaAssessment>) => void;
  isSaving: boolean;
}

function OversightSection({ assessment, onUpdate, isSaving }: OversightSectionProps) {
  const [humanOversight, setHumanOversight] = useState(assessment.human_oversight ?? "");
  const [transparencyMeasures, setTransparencyMeasures] = useState(
    assessment.transparency_measures ?? "",
  );
  const [redressProcess, setRedressProcess] = useState(assessment.redress_process ?? "");
  const [dataGovernance, setDataGovernance] = useState(assessment.data_governance ?? "");

  const handleBlur =
    (field: keyof FriaAssessment, currentVal: string, originalVal: string | null) => () => {
      if (currentVal !== (originalVal ?? "")) {
        onUpdate({ [field]: currentVal });
      }
    };

  return (
    <FriaSectionCard
      title="6. Human oversight, transparency & contestability"
      subtitle="Describe the measures in place to ensure human oversight, transparency, and the ability to contest AI-driven decisions."
      euActContent={
        <>
          <strong>EU AI Act reference:</strong>{" "}
          <a
            href={`${EU_ACT_LINK}#art_14`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 14
          </a>{" "}
          mandates human oversight for high-risk AI systems, including the ability to intervene or
          override.{" "}
          <a
            href={`${EU_ACT_LINK}#art_13`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 13
          </a>{" "}
          requires transparency and provision of information to deployers.{" "}
          <a
            href={`${EU_ACT_LINK}#art_27`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 27(1)(g)
          </a>{" "}
          requires the FRIA to describe accountability and governance processes, including complaint
          and redress mechanisms.
        </>
      }
    >
      <Field
        id="human-oversight"
        label="Human oversight measures"
        placeholder="Describe the human oversight mechanisms and controls in place, including who is responsible and how interventions are made…"
        type="description"
        rows={3}
        value={humanOversight}
        onChange={(e) => setHumanOversight(e.target.value)}
        onBlur={handleBlur("human_oversight", humanOversight, assessment.human_oversight)}
        disabled={isSaving}
      />

      <Field
        id="transparency-measures"
        label="Transparency measures"
        placeholder="Describe how affected individuals are informed about the use of the AI system and what information is disclosed…"
        type="description"
        rows={3}
        value={transparencyMeasures}
        onChange={(e) => setTransparencyMeasures(e.target.value)}
        onBlur={handleBlur(
          "transparency_measures",
          transparencyMeasures,
          assessment.transparency_measures,
        )}
        disabled={isSaving}
      />

      <Field
        id="redress-process"
        label="Redress and contestability process"
        placeholder="Describe the process for individuals to contest AI-driven decisions, seek human review, and obtain redress…"
        type="description"
        rows={3}
        value={redressProcess}
        onChange={(e) => setRedressProcess(e.target.value)}
        onBlur={handleBlur("redress_process", redressProcess, assessment.redress_process)}
        disabled={isSaving}
      />

      <Field
        id="data-governance"
        label="Data governance arrangements"
        placeholder="Describe the data governance practices, data quality controls, and data management procedures relevant to this AI system…"
        type="description"
        rows={3}
        value={dataGovernance}
        onChange={(e) => setDataGovernance(e.target.value)}
        onBlur={handleBlur("data_governance", dataGovernance, assessment.data_governance)}
        disabled={isSaving}
      />

      <FriaEvidenceButton friaId={assessment.id} entityType="section_6" />
    </FriaSectionCard>
  );
}

export default OversightSection;
