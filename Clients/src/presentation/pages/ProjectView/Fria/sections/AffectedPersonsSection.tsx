import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Field from "../../../../components/Inputs/Field";
import Checkbox from "../../../../components/Inputs/Checkbox";
import { FriaAssessment } from "../../../../../application/hooks/useFria";
import FriaEvidenceButton from "../FriaEvidenceButton";
import FriaSectionCard from "../FriaSectionCard";
import { EU_ACT_LINK } from "../friaConstants";
import { brand } from "../../../../themes/palette";

interface AffectedPersonsSectionProps {
  assessment: FriaAssessment;
  onUpdate: (data: Partial<FriaAssessment>) => void;
  isSaving: boolean;
}

const VULNERABLE_GROUP_FLAGS = [
  { key: "Minors", label: "Minors" },
  { key: "Elderly", label: "Elderly" },
  { key: "Workers", label: "Workers" },
  { key: "Migrants", label: "Migrants" },
  { key: "Persons with disabilities", label: "Persons with disabilities" },
  { key: "Low-income individuals", label: "Low-income individuals" },
  { key: "Ethnic minorities", label: "Ethnic minorities" },
  { key: "LGBTQ+", label: "LGBTQ+" },
  { key: "Other", label: "Other" },
];

function AffectedPersonsSection({
  assessment,
  onUpdate,
  isSaving,
}: AffectedPersonsSectionProps) {
  const theme = useTheme();

  const [affectedGroups, setAffectedGroups] = useState(
    assessment.affected_groups ?? ""
  );
  const [vulnerabilityContext, setVulnerabilityContext] = useState(
    assessment.vulnerability_context ?? ""
  );

  const handleAffectedGroupsBlur = () => {
    if (affectedGroups !== (assessment.affected_groups ?? "")) {
      onUpdate({ affected_groups: affectedGroups });
    }
  };

  const handleVulnerabilityContextBlur = () => {
    if (vulnerabilityContext !== (assessment.vulnerability_context ?? "")) {
      onUpdate({ vulnerability_context: vulnerabilityContext });
    }
  };

  const handleFlagChange = (flagKey: string, checked: boolean) => {
    const currentFlags = assessment.group_flags ?? [];
    const updatedFlags = checked
      ? [...currentFlags, flagKey]
      : currentFlags.filter((f) => f !== flagKey);
    onUpdate({ group_flags: updatedFlags });
  };

  return (
    <FriaSectionCard
      title="3. Affected persons & groups"
      subtitle="Identify the categories of natural persons and groups likely to be affected by the AI system."
      euActContent={
        <>
          <strong>EU AI Act reference:</strong>{" "}
          <a href={`${EU_ACT_LINK}#art_27`} target="_blank" rel="noopener noreferrer" style={{ color: brand.primary }}>
            Article 27(1)(a)
          </a>{" "}
          requires identifying the categories of natural persons and groups likely to be affected. Recital 96 highlights special consideration for vulnerable groups including minors, persons with disabilities, and those in asymmetric power relationships.
        </>
      }
    >
      <Field
        id="affected-groups"
        label="Affected groups description"
        placeholder="Describe the categories of natural persons that interact with or are affected by the AI system…"
        type="description"
        rows={4}
        value={affectedGroups}
        onChange={(e) => setAffectedGroups(e.target.value)}
        onBlur={handleAffectedGroupsBlur}
        disabled={isSaving}
      />

      <Field
        id="vulnerability-context"
        label="Vulnerability context"
        placeholder="Explain any specific vulnerabilities or characteristics of affected groups that heighten potential impact…"
        type="description"
        rows={4}
        value={vulnerabilityContext}
        onChange={(e) => setVulnerabilityContext(e.target.value)}
        onBlur={handleVulnerabilityContextBlur}
        disabled={isSaving}
      />

      <Box>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.palette.text.secondary,
            mb: 1.5,
          }}
        >
          Vulnerable group flags
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr 1fr",
              sm: "1fr 1fr 1fr",
              md: "1fr 1fr 1fr 1fr",
            },
            gap: "8px",
          }}
        >
          {VULNERABLE_GROUP_FLAGS.map((group) => {
            const isChecked = (assessment.group_flags ?? []).includes(
              group.key
            );
            return (
              <Checkbox
                key={group.key}
                id={`flag-${group.key}`}
                label={group.label}
                isChecked={isChecked}
                value={group.key}
                onChange={(e) =>
                  handleFlagChange(group.key, e.target.checked)
                }
                isDisabled={isSaving}
              />
            );
          })}
        </Box>
      </Box>

      <FriaEvidenceButton friaId={assessment.id} entityType="section_3" />
    </FriaSectionCard>
  );
}

export default AffectedPersonsSection;
