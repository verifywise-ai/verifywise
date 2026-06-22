import { useState } from "react";
import { Box, Typography, Stack, IconButton } from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Info,
  Pencil,
  Trash2,
  Zap,
  LayoutDashboard,
  BarChart3,
  GitCompareArrows,
  ArrowRight,
} from "lucide-react";
import GovernanceTooltip from "./GovernanceTooltip";
import StandardModal from "../Modals/StandardModal";
import FrameworkChip from "./FrameworkChip";
import { CustomizableButton } from "../button/customizable-button";
import { IScenarioCardProps } from "../../../domain/interfaces/i.governanceOs";
import {
  border as borderPalette,
  background,
  text,
  accent,
  brand,
  status,
} from "../../themes/palette";

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
  onEdit,
  onDelete,
  onActivate,
}: IScenarioCardProps) => {
  const navigate = useNavigate();
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
          "borderRadius": "4px",
          "p": "16px",
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
          <Stack direction="row" gap="8px" alignItems="center">
            <GovernanceTooltip
              header="Scenario details"
              description="View what selecting this scenario means for the project"
            >
              <span>
                <IconButton
                  size="small"
                  disableRipple
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailOpen(true);
                  }}
                  sx={{ "color": text.muted, "&:hover": { color: text.primary } }}
                >
                  <Info size={16} />
                </IconButton>
              </span>
            </GovernanceTooltip>
            {onEdit && !scenario.is_builtin && (
              <GovernanceTooltip
                header="Edit scenario"
                description="Modify this governance scenario"
              >
                <span>
                  <IconButton
                    size="small"
                    disableRipple
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(scenario);
                    }}
                    sx={{ "color": text.muted, "&:hover": { color: text.primary } }}
                  >
                    <Pencil size={14} />
                  </IconButton>
                </span>
              </GovernanceTooltip>
            )}
            {onDelete && !scenario.is_builtin && (
              <GovernanceTooltip
                header="Delete scenario"
                description="Remove this governance scenario permanently"
              >
                <span>
                  <IconButton
                    size="small"
                    disableRipple
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(scenario);
                    }}
                    sx={{ "color": text.muted, "&:hover": { color: status.error.text } }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </span>
              </GovernanceTooltip>
            )}
            {onActivate && (
              <GovernanceTooltip
                header="Activate scenario"
                description="Create tasks across selected projects using this scenario"
                placement="left"
              >
                <span>
                  <CustomizableButton
                    size="small"
                    variant="contained"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      onActivate(scenario);
                    }}
                    startIcon={<Zap size={14} />}
                    text="Activate"
                    sx={{}}
                  />
                </span>
              </GovernanceTooltip>
            )}
            {onSelect && (
              <GovernanceTooltip
                header="Select scenario"
                description="Set this scenario as the active governance strategy"
                placement="left"
              >
                <span>
                  <CustomizableButton
                    size="small"
                    variant="outlined"
                    onClick={() => onSelect(scenario)}
                    isDisabled={isSelected}
                    startIcon={isSelected ? <Check size={14} /> : undefined}
                    text={isSelected ? "Selected" : "Select"}
                    sx={{
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
                  />
                </span>
              </GovernanceTooltip>
            )}
          </Stack>
        </Stack>

        {scenario.description && (
          <Typography sx={{ fontSize: 13, color: text.accent, mt: "8px" }}>
            {scenario.description}
          </Typography>
        )}

        {priorityOrder && (
          <Stack direction="row" gap="8px" sx={{ mt: "16px" }} flexWrap="wrap" useFlexGap>
            {priorityOrder.primary && (
              <FrameworkChip
                frameworkName={
                  FRAMEWORK_NAMES[priorityOrder.primary] || String(priorityOrder.primary)
                }
                priority="primary"
                size="small"
              />
            )}
            {priorityOrder.secondary?.map((id) => (
              <FrameworkChip
                key={id}
                frameworkName={FRAMEWORK_NAMES[id] || String(id)}
                priority="secondary"
                size="small"
              />
            ))}
            {priorityOrder.supplementary?.map((id) => (
              <FrameworkChip
                key={id}
                frameworkName={FRAMEWORK_NAMES[id] || String(id)}
                priority="supplementary"
                size="small"
              />
            ))}
          </Stack>
        )}

        <Stack direction="row" gap="8px" sx={{ mt: "12px" }} flexWrap="wrap" useFlexGap>
          {scenario.industry && (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                height: 22,
                px: "8px",
                borderRadius: "4px",
                fontSize: 11,
                fontWeight: 400,
                textTransform: "capitalize",
                backgroundColor: background.hover,
                color: text.tertiary,
                border: `1px solid ${borderPalette.light}`,
              }}
            >
              {scenario.industry}
            </Box>
          )}
          {scenario.region && (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                height: 22,
                px: "8px",
                borderRadius: "4px",
                fontSize: 11,
                fontWeight: 400,
                backgroundColor: background.hover,
                color: text.tertiary,
                border: `1px solid ${borderPalette.light}`,
              }}
            >
              {scenario.region.toUpperCase()}
            </Box>
          )}
          {scenario.use_case_type && (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                height: 22,
                px: "8px",
                borderRadius: "4px",
                fontSize: 11,
                fontWeight: 400,
                textTransform: "capitalize",
                backgroundColor: background.hover,
                color: text.tertiary,
                border: `1px solid ${borderPalette.light}`,
              }}
            >
              {scenario.use_case_type.replace(/_/g, " ")}
            </Box>
          )}
        </Stack>

        {matchedRules && matchedRules.length > 0 && (
          <Typography sx={{ fontSize: 11, color: text.muted, mt: "12px" }}>
            Matched: {matchedRules.join(", ")}
          </Typography>
        )}

        {scenario.rationale && (
          <Typography sx={{ fontSize: 12, color: text.accent, mt: "8px" }}>
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
        <Stack gap="16px">
          {/* What is this scenario */}
          <Stack gap="16px">
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              What is this scenario?
            </Typography>
            <Typography sx={{ fontSize: 13, color: text.accent, lineHeight: 1.6 }}>
              {scenario.description ||
                "A pre-built governance strategy that defines which compliance frameworks your organization should prioritize and in what order."}
            </Typography>
          </Stack>

          {/* What happens when you select it */}
          <Stack gap="16px">
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
          <Stack gap="16px">
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

            <Stack direction="row" gap="8px" flexWrap="wrap" useFlexGap>
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<LayoutDashboard size={14} />}
                endIcon={<ArrowRight size={14} />}
                onClick={() => navigate("/")}
                text="Dashboard"
              />
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<BarChart3 size={14} />}
                endIcon={<ArrowRight size={14} />}
                onClick={() => navigate("/governance/insights")}
                text="Unified Insights"
              />
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<GitCompareArrows size={14} />}
                endIcon={<ArrowRight size={14} />}
                onClick={() => navigate("/governance/framework-mapper")}
                text="Framework Mapper"
              />
            </Stack>
          </Stack>

          {/* Framework priority breakdown */}
          {priorityOrder && (
            <Stack gap="16px">
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Framework priority order
              </Typography>

              {primaryName && (
                <Box
                  sx={{
                    p: "16px",
                    borderRadius: "4px",
                    border: `1px solid ${accent.primary.border}`,
                    background: accent.primary.bg,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
                    Primary framework (highest priority)
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: accent.primary.text }}>
                    {primaryName}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: text.accent, mt: "4px" }}>
                    This is your main compliance target. Tasks and controls from this framework will
                    be prioritized above all others.
                  </Typography>
                </Box>
              )}

              {secondaryNames.length > 0 && (
                <Box
                  sx={{
                    p: "16px",
                    borderRadius: "4px",
                    border: `1px solid ${accent.indigo.border}`,
                    background: accent.indigo.bg,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
                    Secondary framework(s)
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: accent.indigo.text }}>
                    {secondaryNames.join(", ")}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: text.accent, mt: "4px" }}>
                    Supporting frameworks that complement your primary target. Work on these after
                    primary controls are in place.
                  </Typography>
                </Box>
              )}

              {supplementaryNames.length > 0 && (
                <Box
                  sx={{
                    p: "16px",
                    borderRadius: "4px",
                    border: `1px solid ${borderPalette.light}`,
                    background: background.hover,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
                    Supplementary framework(s)
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: text.tertiary }}>
                    {supplementaryNames.join(", ")}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: text.accent, mt: "4px" }}>
                    Nice-to-have frameworks that provide additional governance coverage. Address
                    these once primary and secondary are well-established.
                  </Typography>
                </Box>
              )}
            </Stack>
          )}

          {/* Who is this for */}
          {(scenario.industry || scenario.region || scenario.use_case_type) && (
            <Stack gap="16px">
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                Best suited for
              </Typography>
              <Stack direction="row" gap="16px" flexWrap="wrap" useFlexGap>
                {scenario.industry && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
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
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
                      Region
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                      {scenario.region.toUpperCase()}
                    </Typography>
                  </Box>
                )}
                {scenario.use_case_type && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: text.muted, mb: "4px" }}>
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
            <Stack gap="16px">
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
            <Stack gap="16px">
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
