import { useState } from "react";
import { Box, Typography, Stack, Chip, Button, IconButton } from "@mui/material";
import { Check, Info } from "lucide-react";
import VWTooltip from "../VWTooltip";
import StandardModal from "../Modals/StandardModal";
import { IScenarioCardProps } from "../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text, accent, brand } from "../../themes/palette";

const FRAMEWORK_NAMES: Record<number, string> = {
  1: "EU AI Act",
  2: "ISO 42001",
  3: "ISO 27001",
  4: "NIST AI RMF",
};

const ScenarioCard = ({
  scenario,
  score,
  matchedRules,
  isSelected,
  onSelect,
}: IScenarioCardProps) => {
  const [detailOpen, setDetailOpen] = useState(false);

  const priorityOrder = scenario.priority_order as {
    primary?: number;
    secondary?: number[];
    supplementary?: number[];
  } | null;

  const primaryName = priorityOrder?.primary
    ? FRAMEWORK_NAMES[priorityOrder.primary] || `Framework ${priorityOrder.primary}`
    : null;
  const secondaryNames =
    priorityOrder?.secondary?.map((id) => FRAMEWORK_NAMES[id] || `Framework ${id}`) || [];
  const supplementaryNames =
    priorityOrder?.supplementary?.map((id) => FRAMEWORK_NAMES[id] || `Framework ${id}`) || [];

  return (
    <>
      <Box
        sx={{
          "border": `1px solid ${isSelected ? brand.primary : borderPalette.light}`,
          "borderRadius": 2,
          "p": 2.5,
          "background": isSelected ? background.accent : background.main,
          "transition": "all 0.2s ease",
          "&:hover": {
            borderColor: isSelected ? brand.primary : borderPalette.dark,
            background: background.accent,
          },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: text.primary }}>
              {scenario.name}
            </Typography>
            {score !== undefined && (
              <Typography sx={{ fontSize: 12, color: brand.primary, fontWeight: 500 }}>
                Match score: {score}%
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <VWTooltip
              content="View details about what selecting this scenario means"
              placement="top"
            >
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailOpen(true);
                }}
                sx={{ "color": text.muted, "&:hover": { color: text.primary } }}
              >
                <Info size={16} />
              </IconButton>
            </VWTooltip>
            {onSelect && (
              <VWTooltip
                header="Set as active governance strategy"
                content={
                  <p>
                    Selecting this scenario sets it as your organization&apos;s active governance
                    strategy. It defines which frameworks to prioritize (primary, secondary,
                    supplementary) and guides compliance planning across all projects.
                  </p>
                }
                placement="left"
              >
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => onSelect(scenario)}
                    disabled={isSelected}
                    startIcon={isSelected ? <Check size={14} /> : undefined}
                    sx={{
                      "fontSize": 12,
                      "textTransform": "none",
                      "borderColor": isSelected ? brand.primary : borderPalette.dark,
                      "color": isSelected ? brand.primary : text.secondary,
                      "&:hover": {
                        borderColor: brand.primary,
                        color: brand.primary,
                      },
                      "&.Mui-disabled": {
                        borderColor: brand.primary,
                        color: brand.primary,
                        opacity: 0.8,
                      },
                    }}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </Button>
                </span>
              </VWTooltip>
            )}
          </Stack>
        </Stack>

        {scenario.description && (
          <Typography sx={{ fontSize: 13, color: text.accent, mt: 1 }}>
            {scenario.description}
          </Typography>
        )}

        {priorityOrder && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
            {priorityOrder.primary && (
              <Chip
                label={`Primary: ${FRAMEWORK_NAMES[priorityOrder.primary] || priorityOrder.primary}`}
                size="small"
                sx={{
                  fontSize: 11,
                  height: 22,
                  backgroundColor: accent.primary.bg,
                  color: accent.primary.text,
                  border: `1px solid ${accent.primary.border}`,
                }}
              />
            )}
            {priorityOrder.secondary?.map((id) => (
              <Chip
                key={id}
                label={`Secondary: ${FRAMEWORK_NAMES[id] || id}`}
                size="small"
                sx={{
                  fontSize: 11,
                  height: 22,
                  backgroundColor: accent.indigo.bg,
                  color: accent.indigo.text,
                  border: `1px solid ${accent.indigo.border}`,
                }}
              />
            ))}
            {priorityOrder.supplementary?.map((id) => (
              <Chip
                key={id}
                label={`Supplementary: ${FRAMEWORK_NAMES[id] || id}`}
                size="small"
                sx={{
                  fontSize: 11,
                  height: 22,
                  backgroundColor: background.hover,
                  color: text.tertiary,
                  border: `1px solid ${borderPalette.light}`,
                }}
              />
            ))}
          </Stack>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
          {scenario.industry && (
            <Chip
              label={scenario.industry}
              size="small"
              sx={{
                fontSize: 11,
                height: 22,
                backgroundColor: background.hover,
                color: text.tertiary,
                border: `1px solid ${borderPalette.light}`,
                textTransform: "capitalize",
              }}
            />
          )}
          {scenario.region && (
            <Chip
              label={scenario.region.toUpperCase()}
              size="small"
              sx={{
                fontSize: 11,
                height: 22,
                backgroundColor: background.hover,
                color: text.tertiary,
                border: `1px solid ${borderPalette.light}`,
              }}
            />
          )}
          {scenario.use_case_type && (
            <Chip
              label={scenario.use_case_type.replace(/_/g, " ")}
              size="small"
              sx={{
                fontSize: 11,
                height: 22,
                backgroundColor: background.hover,
                color: text.tertiary,
                border: `1px solid ${borderPalette.light}`,
                textTransform: "capitalize",
              }}
            />
          )}
        </Stack>

        {matchedRules && matchedRules.length > 0 && (
          <Typography sx={{ fontSize: 11, color: text.muted, mt: 1.5 }}>
            Matched: {matchedRules.join(", ")}
          </Typography>
        )}

        {scenario.rationale && (
          <Typography sx={{ fontSize: 12, color: text.accent, mt: 1 }}>
            {scenario.rationale}
          </Typography>
        )}
      </Box>

      {/* Detail modal */}
      <StandardModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={scenario.name}
        description="Governance scenario details"
        hideFooter
        fitContent
      >
        <Stack spacing={6}>
          {/* What is this scenario */}
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              What is this scenario?
            </Typography>
            <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
              {scenario.description ||
                "A pre-built governance strategy that defines which compliance frameworks your organization should prioritize and in what order."}
            </Typography>
          </Stack>

          {/* What happens when you select it */}
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              What happens when you select this scenario?
            </Typography>
            <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
              Selecting this scenario sets it as your organization&apos;s active governance
              strategy. This means:
            </Typography>
            <Stack
              component="ul"
              sx={{
                "pl": 2,
                "m": 0,
                "& li": { fontSize: 13, color: text.accent, lineHeight: 1.8 },
              }}
            >
              <li>
                Your compliance dashboard will prioritize tasks from the primary framework first
              </li>
              <li>
                Coverage analysis will measure your progress against the prioritized frameworks
              </li>
              <li>New projects will inherit this framework priority order as a recommendation</li>
              <li>You can change your active scenario at any time without losing progress</li>
            </Stack>
          </Stack>

          {/* Next steps after selecting */}
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              Next steps after selecting this scenario
            </Typography>
            <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
              Once you select this scenario, follow these steps to put your governance strategy into
              action:
            </Typography>
            <Stack
              component="ol"
              sx={{ "pl": 2, "m": 0, "& li": { fontSize: 13, color: text.accent, lineHeight: 2 } }}
            >
              <li>
                <strong>Go to Framework page</strong> &mdash; Assign the prioritized frameworks to
                your projects. Navigate to the Framework page from the sidebar and add the primary
                framework first.
              </li>
              <li>
                <strong>Review controls</strong> &mdash; Open each assigned framework within your
                project to see the controls you need to implement. Start with the primary
                framework&apos;s controls.
              </li>
              <li>
                <strong>Check Unified Insights tab</strong> &mdash; Switch to the Unified Insights
                tab here in Governance OS to monitor your per-project coverage and identify gaps as
                you work through controls.
              </li>
              <li>
                <strong>Use Framework Mapper</strong> &mdash; When implementing controls, check the
                Framework Mapper tab to find overlapping controls across frameworks. This lets you
                satisfy multiple requirements with a single implementation.
              </li>
              <li>
                <strong>Track progress on Dashboard</strong> &mdash; Your main dashboard will
                reflect compliance progress based on the active scenario&apos;s priority order.
              </li>
            </Stack>
          </Stack>

          {/* Framework priority breakdown */}
          {priorityOrder && (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Framework priority order
              </Typography>

              {primaryName && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: `1px solid ${accent.primary.border}`,
                    background: accent.primary.bg,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                    Primary framework (highest priority)
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: accent.primary.text }}>
                    {primaryName}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: text.accent, mt: 0.5 }}>
                    This is your main compliance target. Tasks and controls from this framework will
                    be prioritized above all others.
                  </Typography>
                </Box>
              )}

              {secondaryNames.length > 0 && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: `1px solid ${accent.indigo.border}`,
                    background: accent.indigo.bg,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                    Secondary framework(s)
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: accent.indigo.text }}>
                    {secondaryNames.join(", ")}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: text.accent, mt: 0.5 }}>
                    Supporting frameworks that complement your primary target. Work on these after
                    primary controls are in place.
                  </Typography>
                </Box>
              )}

              {supplementaryNames.length > 0 && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: `1px solid ${borderPalette.light}`,
                    background: background.hover,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                    Supplementary framework(s)
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: text.tertiary }}>
                    {supplementaryNames.join(", ")}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: text.accent, mt: 0.5 }}>
                    Nice-to-have frameworks that provide additional governance coverage. Address
                    these once primary and secondary are well-established.
                  </Typography>
                </Box>
              )}
            </Stack>
          )}

          {/* Who is this for */}
          {(scenario.industry || scenario.region || scenario.use_case_type) && (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Best suited for
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                {scenario.industry && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                      Industry
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: text.primary,
                        textTransform: "capitalize",
                      }}
                    >
                      {scenario.industry.replace(/_/g, " ")}
                    </Typography>
                  </Box>
                )}
                {scenario.region && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                      Region
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                      {scenario.region.toUpperCase()}
                    </Typography>
                  </Box>
                )}
                {scenario.use_case_type && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: 0.5 }}>
                      Use case type
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: text.primary,
                        textTransform: "capitalize",
                      }}
                    >
                      {scenario.use_case_type.replace(/_/g, " ")}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Stack>
          )}

          {/* Match score explanation */}
          {score !== undefined && (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Recommendation match
              </Typography>
              <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
                This scenario scored <strong>{score}%</strong> against your criteria.
                {matchedRules && matchedRules.length > 0 && (
                  <> It matched the following rules: {matchedRules.join(", ")}.</>
                )}{" "}
                A higher score means the scenario better fits your organization&apos;s context.
              </Typography>
            </Stack>
          )}

          {/* Rationale */}
          {scenario.rationale && (
            <Stack spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Rationale
              </Typography>
              <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
                {scenario.rationale}
              </Typography>
            </Stack>
          )}
        </Stack>
      </StandardModal>
    </>
  );
};

export default ScenarioCard;
