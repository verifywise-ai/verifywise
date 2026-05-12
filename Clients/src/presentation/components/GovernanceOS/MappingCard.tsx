import { useState } from "react";
import { Box, Typography, Stack, Chip } from "@mui/material";
import { ArrowRight, Info } from "lucide-react";
import MappingStrengthBadge from "./MappingStrengthBadge";
import StandardModal from "../Modals/StandardModal";
import { IMappingCardProps } from "../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text } from "../../themes/palette";

const FRAMEWORK_NAMES: Record<number, string> = {
  1: "EU AI Act",
  2: "ISO 42001",
  3: "ISO 27001",
  4: "NIST AI RMF",
};

const STRENGTH_DESCRIPTIONS: Record<string, string> = {
  direct:
    "These controls address the same requirement. Implementing one fully satisfies the other, meaning you can apply a single implementation to meet both framework obligations.",
  partial:
    "These controls overlap significantly but each has unique aspects. Implementing one gives you partial credit toward the other, but you may need additional work for full compliance.",
  related:
    "These controls cover similar governance topics but from different angles. Understanding one helps inform the other, but they are not interchangeable.",
};

const MappingCard = ({ mapping, frameworkNames }: IMappingCardProps) => {
  const names = frameworkNames || FRAMEWORK_NAMES;
  const [detailOpen, setDetailOpen] = useState(false);

  const sourceName =
    names[mapping.source_framework_id] || `Framework ${mapping.source_framework_id}`;
  const targetName =
    names[mapping.target_framework_id] || `Framework ${mapping.target_framework_id}`;

  return (
    <>
      <Box
        onClick={() => setDetailOpen(true)}
        sx={{
          "border": `1px solid ${borderPalette.light}`,
          "borderRadius": 2,
          "p": 2,
          "background": background.main,
          "cursor": "pointer",
          "transition": "all 0.2s ease",
          "&:hover": {
            borderColor: borderPalette.dark,
            background: background.accent,
          },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
          <Box sx={{ minWidth: 140 }}>
            <Typography sx={{ fontSize: 11, color: text.muted }}>{sourceName}</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              {mapping.source_control_identifier}
            </Typography>
          </Box>

          <ArrowRight size={14} color={text.muted} />

          <Box sx={{ minWidth: 140 }}>
            <Typography sx={{ fontSize: 11, color: text.muted }}>{targetName}</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              {mapping.target_control_identifier}
            </Typography>
          </Box>

          <MappingStrengthBadge strength={mapping.mapping_strength} />

          {mapping.domain_tag && (
            <Chip
              label={mapping.domain_tag.replace(/_/g, " ")}
              size="small"
              sx={{
                fontSize: 11,
                height: 22,
                textTransform: "capitalize",
                backgroundColor: "#E6F0EC",
                color: "#13715B",
              }}
            />
          )}

          {mapping.confidence_score !== undefined && (
            <Typography sx={{ fontSize: 11, color: text.muted }}>
              {Math.round(mapping.confidence_score * 100)}% confidence
            </Typography>
          )}

          <Info size={14} color={text.muted} style={{ marginLeft: "auto" }} />
        </Stack>

        {mapping.rationale && (
          <Typography sx={{ fontSize: 12, color: text.accent, mt: 1 }}>
            {mapping.rationale}
          </Typography>
        )}
      </Box>

      {/* Detail modal */}
      <StandardModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Control Mapping Details"
        description={`${sourceName} \u2192 ${targetName}`}
        hideFooter
      >
        <Stack spacing={6}>
          {/* Source and Target */}
          <Stack spacing={3}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              Mapping relationship
            </Typography>
            <Stack direction="row" spacing={3} alignItems="flex-start">
              <Box
                sx={{
                  flex: 1,
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${borderPalette.light}`,
                  background: background.accent,
                }}
              >
                <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                  Source control
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: text.primary }}>
                  {mapping.source_control_identifier}
                </Typography>
                <Typography sx={{ fontSize: 12, color: text.accent, mt: 0.5 }}>
                  {sourceName}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", pt: 2 }}>
                <ArrowRight size={18} color={text.muted} />
              </Box>
              <Box
                sx={{
                  flex: 1,
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${borderPalette.light}`,
                  background: background.accent,
                }}
              >
                <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                  Target control
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: text.primary }}>
                  {mapping.target_control_identifier}
                </Typography>
                <Typography sx={{ fontSize: 12, color: text.accent, mt: 0.5 }}>
                  {targetName}
                </Typography>
              </Box>
            </Stack>
          </Stack>

          {/* Mapping Strength Explanation */}
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Mapping strength
              </Typography>
              <MappingStrengthBadge strength={mapping.mapping_strength} />
            </Stack>
            <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
              {STRENGTH_DESCRIPTIONS[mapping.mapping_strength] ||
                "This mapping indicates a relationship between the two controls."}
            </Typography>
          </Stack>

          {/* What this means */}
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              What this means for you
            </Typography>
            <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
              {mapping.mapping_strength === "direct"
                ? `If you have already implemented ${mapping.source_control_identifier} in ${sourceName}, you can reference the same evidence and implementation for ${mapping.target_control_identifier} in ${targetName}. This reduces duplicate work.`
                : mapping.mapping_strength === "partial"
                  ? `Your implementation of ${mapping.source_control_identifier} covers some aspects of ${mapping.target_control_identifier}. Review both control requirements to identify any gaps that still need attention.`
                  : `Understanding ${mapping.source_control_identifier} provides useful context when implementing ${mapping.target_control_identifier}. They address similar governance themes but have distinct compliance requirements.`}
            </Typography>
          </Stack>

          {/* Domain & Confidence */}
          {(mapping.domain_tag || mapping.confidence_score !== undefined) && (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Additional details
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                {mapping.domain_tag && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                      Governance domain
                    </Typography>
                    <Chip
                      label={mapping.domain_tag.replace(/_/g, " ")}
                      size="small"
                      sx={{
                        fontSize: 12,
                        height: 24,
                        textTransform: "capitalize",
                        backgroundColor: "#E6F0EC",
                        color: "#13715B",
                      }}
                    />
                  </Box>
                )}
                {mapping.confidence_score !== undefined && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                      Confidence score
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                      {Math.round(mapping.confidence_score * 100)}%
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Stack>
          )}

          {/* Rationale */}
          {mapping.rationale && (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Rationale
              </Typography>
              <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
                {mapping.rationale}
              </Typography>
            </Stack>
          )}
        </Stack>
      </StandardModal>
    </>
  );
};

export default MappingCard;
