import React, { useState, useEffect } from "react";
import { Stack, TextField, Typography, Box, Slider } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import GovernanceTooltip from "../../../components/GovernanceOS/GovernanceTooltip";
import {
  IGovernanceControlMapping,
  MappingStrength,
} from "../../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text, accent } from "../../../themes/palette";

interface MappingFormModalProps {
  open: boolean;
  mapping?: IGovernanceControlMapping | null;
  onClose: () => void;
  onSubmit: (data: Partial<IGovernanceControlMapping>) => void;
  isSubmitting?: boolean;
}

const STRENGTH_OPTIONS = ["direct", "partial", "related"] as const;

const FRAMEWORK_OPTIONS = [
  { id: 1, name: "EU AI Act" },
  { id: 2, name: "ISO 42001" },
  { id: 3, name: "ISO 27001" },
  { id: 4, name: "NIST AI RMF" },
];

const MappingFormModal: React.FC<MappingFormModalProps> = ({
  open,
  mapping,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  const isEdit = !!mapping;

  const [sourceFrameworkId, setSourceFrameworkId] = useState<number>(1);
  const [sourceControlIdentifier, setSourceControlIdentifier] = useState("");
  const [targetFrameworkId, setTargetFrameworkId] = useState<number>(2);
  const [targetControlIdentifier, setTargetControlIdentifier] = useState("");
  const [strength, setStrength] = useState<MappingStrength>("related");
  const [domainTag, setDomainTag] = useState("");
  const [rationale, setRationale] = useState("");
  const [confidenceScore, setConfidenceScore] = useState<number>(0.8);

  useEffect(() => {
    if (mapping) {
      setSourceFrameworkId(mapping.source_framework_id || 1);
      setSourceControlIdentifier(mapping.source_control_identifier || "");
      setTargetFrameworkId(mapping.target_framework_id || 2);
      setTargetControlIdentifier(mapping.target_control_identifier || "");
      setStrength(mapping.mapping_strength || "related");
      setDomainTag(mapping.domain_tag || "");
      setRationale(mapping.rationale || "");
      setConfidenceScore(mapping.confidence_score ?? 0.8);
    } else {
      setSourceFrameworkId(1);
      setSourceControlIdentifier("");
      setTargetFrameworkId(2);
      setTargetControlIdentifier("");
      setStrength("related");
      setDomainTag("");
      setRationale("");
      setConfidenceScore(0.8);
    }
  }, [mapping, open]);

  const handleSubmit = () => {
    onSubmit({
      source_framework_id: sourceFrameworkId,
      source_control_identifier: sourceControlIdentifier,
      target_framework_id: targetFrameworkId,
      target_control_identifier: targetControlIdentifier,
      mapping_strength: strength,
      domain_tag: domainTag || undefined,
      rationale: rationale || undefined,
      confidence_score: confidenceScore,
    });
  };

  const isValid =
    sourceControlIdentifier.trim().length > 0 && targetControlIdentifier.trim().length > 0;

  return (
    <StandardModal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? "Edit Mapping" : "New Mapping"}
      description={
        isEdit ? "Update this control mapping" : "Create a new cross-framework control mapping"
      }
      submitButtonText={isEdit ? "Save Changes" : "Create Mapping"}
      cancelButtonText="Cancel"
      onSubmit={handleSubmit}
      isSubmitting={!isValid || isSubmitting}
      fitContent
    >
      <Stack spacing={3} sx={{ minWidth: 520 }}>
        {/* Source Framework */}
        <Box>
          <GovernanceTooltip
            header="Source framework"
            description="Framework containing the source control"
          >
            <Typography
              sx={{ fontSize: 12, color: text.secondary, fontWeight: 500, display: "block", mb: 1 }}
            >
              Source Framework *
            </Typography>
          </GovernanceTooltip>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {FRAMEWORK_OPTIONS.map((fw) => (
              <Box
                key={fw.id}
                component="span"
                onClick={() => setSourceFrameworkId(fw.id)}
                sx={{
                  "display": "inline-flex",
                  "alignItems": "center",
                  "height": 24,
                  "px": "10px",
                  "borderRadius": "4px",
                  "fontSize": 12,
                  "cursor": "pointer",
                  "fontWeight": sourceFrameworkId === fw.id ? 600 : 400,
                  "backgroundColor":
                    sourceFrameworkId === fw.id ? accent.primary.bg : background.hover,
                  "color": sourceFrameworkId === fw.id ? accent.primary.text : text.tertiary,
                  "border": `1px solid ${sourceFrameworkId === fw.id ? accent.primary.border : borderPalette.light}`,
                  "&:hover": {
                    backgroundColor:
                      sourceFrameworkId === fw.id ? accent.primary.bg : background.accent,
                  },
                }}
              >
                {fw.name}
              </Box>
            ))}
          </Stack>
        </Box>

        <GovernanceTooltip
          header="Source control"
          description="Identifier of the control being mapped"
        >
          <TextField
            label="Source Control Identifier *"
            value={sourceControlIdentifier}
            onChange={(e) => setSourceControlIdentifier(e.target.value)}
            fullWidth
            size="small"
            placeholder="e.g., Article 9 or A.5.1"
          />
        </GovernanceTooltip>

        {/* Target Framework */}
        <Box>
          <GovernanceTooltip
            header="Target framework"
            description="Framework receiving the mapped control"
          >
            <Typography
              sx={{ fontSize: 12, color: text.secondary, fontWeight: 500, display: "block", mb: 1 }}
            >
              Target Framework *
            </Typography>
          </GovernanceTooltip>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {FRAMEWORK_OPTIONS.map((fw) => (
              <Box
                key={fw.id}
                component="span"
                onClick={() => setTargetFrameworkId(fw.id)}
                sx={{
                  "display": "inline-flex",
                  "alignItems": "center",
                  "height": 24,
                  "px": "10px",
                  "borderRadius": "4px",
                  "fontSize": 12,
                  "cursor": "pointer",
                  "fontWeight": targetFrameworkId === fw.id ? 600 : 400,
                  "backgroundColor":
                    targetFrameworkId === fw.id ? accent.indigo.bg : background.hover,
                  "color": targetFrameworkId === fw.id ? accent.indigo.text : text.tertiary,
                  "border": `1px solid ${targetFrameworkId === fw.id ? accent.indigo.border : borderPalette.light}`,
                  "&:hover": {
                    backgroundColor:
                      targetFrameworkId === fw.id ? accent.indigo.bg : background.accent,
                  },
                }}
              >
                {fw.name}
              </Box>
            ))}
          </Stack>
        </Box>

        <GovernanceTooltip
          header="Target control"
          description="Identifier of the equivalent control in the target framework"
        >
          <TextField
            label="Target Control Identifier *"
            value={targetControlIdentifier}
            onChange={(e) => setTargetControlIdentifier(e.target.value)}
            fullWidth
            size="small"
            placeholder="e.g., Article 9 or A.5.1"
          />
        </GovernanceTooltip>

        {/* Mapping Strength */}
        <Box>
          <GovernanceTooltip
            header="Mapping strength"
            description="Relationship between the two mapped controls"
          >
            <Typography
              sx={{ fontSize: 12, color: text.secondary, fontWeight: 500, display: "block", mb: 1 }}
            >
              Mapping Strength
            </Typography>
          </GovernanceTooltip>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {STRENGTH_OPTIONS.map((s) => (
              <Box
                key={s}
                component="span"
                onClick={() => setStrength(s)}
                sx={{
                  "display": "inline-flex",
                  "alignItems": "center",
                  "height": 24,
                  "px": "10px",
                  "borderRadius": "4px",
                  "fontSize": 12,
                  "cursor": "pointer",
                  "textTransform": "capitalize",
                  "fontWeight": strength === s ? 600 : 400,
                  "backgroundColor": strength === s ? accent.teal.bg : background.hover,
                  "color": strength === s ? accent.teal.text : text.tertiary,
                  "border": `1px solid ${strength === s ? accent.teal.border : borderPalette.light}`,
                  "&:hover": {
                    backgroundColor: strength === s ? accent.teal.bg : background.accent,
                  },
                }}
              >
                {s}
              </Box>
            ))}
          </Stack>
        </Box>

        <GovernanceTooltip
          header="Domain tag"
          description="Optional governance domain category for grouping mappings"
        >
          <TextField
            label="Domain Tag"
            value={domainTag}
            onChange={(e) => setDomainTag(e.target.value)}
            fullWidth
            size="small"
            placeholder="e.g., risk_management"
          />
        </GovernanceTooltip>

        <GovernanceTooltip
          header="Rationale"
          description="Explanation for why these two controls map to each other"
        >
          <TextField
            label="Rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
            placeholder="Why these controls map to each other..."
          />
        </GovernanceTooltip>

        {/* Confidence Score */}
        <Box>
          <GovernanceTooltip
            header="Confidence score"
            description="Certainty level for this control mapping"
          >
            <Typography
              sx={{ fontSize: 12, color: text.secondary, fontWeight: 500, display: "block", mb: 1 }}
            >
              Confidence Score: {Math.round(confidenceScore * 100)}%
            </Typography>
          </GovernanceTooltip>
          <Slider
            value={confidenceScore}
            onChange={(_, value) => setConfidenceScore(value as number)}
            min={0}
            max={1}
            step={0.05}
            marks={[
              { value: 0, label: "0%" },
              { value: 0.5, label: "50%" },
              { value: 1, label: "100%" },
            ]}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
          />
        </Box>
      </Stack>
    </StandardModal>
  );
};

export default MappingFormModal;
