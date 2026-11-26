import { useMemo, useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Tab,
  Tabs,
  Card,
  CardContent,
  IconButton,
  useTheme,
} from "@mui/material";
import { ShieldCheck, RefreshCw, Trash2, Lock } from "lucide-react";
import VWTooltip from "../../components/VWTooltip";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { useAuth } from "../../../application/hooks/useAuth";
import { useCan } from "../../../application/hooks/useCan";
import { VisibilityChips } from "../../components/VisibilityToggle";
import type { VisibilityFilterValue } from "../../components/VisibilityToggle";
import { cardStyles, layoutStyles } from "../../themes/components";
import { text as textColors, brand, status } from "../../themes/palette";
import Chip from "../../components/Chip";
import type { ChipVariant } from "../../types/interfaces/i.chip";
import { CustomizableButton } from "../../components/button/customizable-button";
import CustomizableSkeleton from "../../components/Skeletons";
import { EmptyState } from "../../components/EmptyState";
import ReadinessHeatmap from "../../components/ReadinessHeatmap";
import ReadinessTrend from "../../components/ReadinessTrend";
import WeakControlsList from "../../components/WeakControlsList";
import {
  useReadinessScores,
  useControlScores,
  useWeakestControls,
  useReadinessHistory,
  useTriggerCalculateAll,
  useTriggerCalculateFramework,
  useDeleteReadinessCalculation,
} from "../../../application/hooks/useReadiness";
import type { ReadinessLevel } from "../../../domain/interfaces/i.readiness";

// On this page the selected chip also decides how a new calculation is saved.
const VISIBILITY_HINTS = {
  all: "Public results and your private ones. Calculating now keeps each result's visibility, and a new result is public.",
  public: "Results everyone in your organization can see. Calculating now shares the result.",
  private: "Results only you can see. Calculating now keeps the result to yourself.",
};

const FRAMEWORK_TABS = [
  { value: "eu_ai_act", label: "EU AI Act" },
  { value: "iso_42001", label: "ISO 42001" },
];

/**
 * Readiness levels mapped onto the design system's semantic status colors.
 * Chip variants are passed explicitly — "Not started" would otherwise auto-derive
 * to the neutral default and lose its meaning.
 */
const LEVEL_CONFIG: Record<
  ReadinessLevel,
  { label: string; variant: ChipVariant; color: string; countKey: string }
> = {
  ready: {
    label: "Ready",
    variant: "success",
    color: status.success.text,
    countKey: "ready_count",
  },
  needs_work: {
    label: "Needs work",
    variant: "info",
    color: status.info.text,
    countKey: "needs_work_count",
  },
  at_risk: {
    label: "At risk",
    variant: "warning",
    color: status.warning.text,
    countKey: "at_risk_count",
  },
  not_started: {
    label: "Not started",
    variant: "error",
    color: status.error.text,
    countKey: "not_started_count",
  },
};

const LEVELS: ReadinessLevel[] = ["ready", "needs_work", "at_risk", "not_started"];

interface ReadinessDashboardProps {
  /** Scope every query to a single use case. Omit for the organization-wide dashboard. */
  projectId?: number;
  /**
   * Pin the dashboard to one framework (e.g. "eu_ai_act"). When set, the framework
   * tabs are hidden and "Calculate readiness" only recalculates this framework.
   */
  frameworkType?: string;
}

function getLevelColor(level: ReadinessLevel | string | undefined) {
  return LEVEL_CONFIG[level as ReadinessLevel]?.color ?? textColors.accent;
}

function getLevelLabel(level: ReadinessLevel | string | undefined) {
  return LEVEL_CONFIG[level as ReadinessLevel]?.label ?? "—";
}

function classifyLevel(score: number): ReadinessLevel {
  if (score >= 80) return "ready";
  if (score >= 60) return "needs_work";
  if (score >= 30) return "at_risk";
  return "not_started";
}

function formatFrameworkName(type: string): string {
  const names: Record<string, string> = {
    eu_ai_act: "EU AI Act",
    iso_42001: "ISO 42001",
    iso_27001: "ISO 27001",
    nist_ai_rmf: "NIST AI RMF",
  };
  return names[type] || type.replace(/_/g, " ").toUpperCase();
}

/** Missing or unparseable timestamps sort oldest, so a dated row always wins. */
function toTime(value?: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * framework_readiness_scores keeps one row per user — the upsert conflict target
 * includes created_by — so a framework a teammate has also calculated comes back
 * more than once. Readiness is a property of the use case, not of whoever pressed
 * the button, so show one row per framework: the viewer's own calculation when
 * they have one (so they can always see, and delete, what they ran), else the most
 * recent. The full series stays in the trend card, which reads the separate
 * readiness_history table.
 */
function latestPerFramework(rows: any[], userId: number | null): any[] {
  const isOwn = (row: any) => userId !== null && row.created_by === userId;
  const latest = new Map<string, any>();
  for (const row of rows) {
    const current = latest.get(row.framework_type);
    const wins =
      !current ||
      (isOwn(row) && !isOwn(current)) ||
      (isOwn(row) === isOwn(current) && toTime(row.calculated_at) > toTime(current.calculated_at));
    if (wins) latest.set(row.framework_type, row);
  }
  return [...latest.values()];
}

export default function ReadinessDashboard({
  projectId,
  frameworkType,
}: ReadinessDashboardProps = {}) {
  const theme = useTheme();
  const [selectedFramework, setSelectedFramework] = useState("eu_ai_act");
  const [visFilter, setVisFilter] = useState<VisibilityFilterValue>("all");

  // Scoped mode: pinned to a single framework (and usually a single use case).
  const isScoped = Boolean(frameworkType);
  const activeFramework = frameworkType ?? selectedFramework;

  const filterParam = visFilter === "all" ? undefined : visFilter;
  const { data: scores, isLoading: scoresLoading } = useReadinessScores(projectId, filterParam);
  const { data: controlScores, isLoading: controlsLoading } = useControlScores(activeFramework, {
    projectId,
    visibility: filterParam,
  });
  const { data: weakest, isLoading: weakestLoading } = useWeakestControls(
    10,
    projectId,
    filterParam,
  );
  const { data: history, isLoading: historyLoading } = useReadinessHistory(
    frameworkType,
    projectId,
    filterParam,
  );
  const triggerCalculateAll = useTriggerCalculateAll();
  const triggerCalculateFramework = useTriggerCalculateFramework();
  const triggerCalculate = isScoped ? triggerCalculateFramework : triggerCalculateAll;
  const deleteCalculation = useDeleteReadinessCalculation();
  const { userId } = useAuth();
  const isReadinessAdmin = useCan("readiness.admin");
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  // Your own calculation, or (for an admin) someone else's public one. The
  // server applies the same rule.
  const canDelete = (fw: any) =>
    typeof fw.id === "number" &&
    ((userId !== null && fw.created_by === userId) ||
      (isReadinessAdmin && fw.visibility === "public"));
  const confirmDelete = () => {
    if (!pendingDelete) return;
    // Stays open on failure, so the person can retry from the same place.
    deleteCalculation.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
  };

  // Only the framework this view is pinned to — an org-wide card row inside a
  // single use case's framework tab would misrepresent the numbers. Both the
  // scoped and org-wide paths then collapse to one card per framework.
  const visibleScores = useMemo(() => {
    if (!scores) return [];
    const scoped = frameworkType
      ? scores.filter((fw: any) => fw.framework_type === frameworkType)
      : scores;
    return latestPerFramework(scoped, userId);
  }, [scores, frameworkType, userId]);

  const handleCalculate = () => {
    // "All" names no visibility: an existing calculation keeps its own, a new
    // one is public. Only an explicit Public or Private changes it.
    const visibility = visFilter === "all" ? undefined : visFilter;
    if (isScoped && frameworkType) {
      triggerCalculateFramework.mutate({ frameworkType, projectId, visibility });
    } else {
      triggerCalculateAll.mutate({ visibility });
    }
  };

  // Scoped mode has no title block, so the summary cards take the left half of
  // the control row rather than sitting on their own line under empty space.
  const summaryCards = (
    <Box
      sx={{
        ...layoutStyles.gridContainer(theme),
        gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(240px, 1fr))" },
        gap: "16px",
        ...(isScoped ? { flex: 1, minWidth: 0 } : { mb: "16px" }),
      }}
    >
      {scoresLoading ? (
        // Sized to one stat card so the placeholder matches the content it replaces.
        <CustomizableSkeleton variant="rounded" width="100%" height={104} />
      ) : visibleScores.length > 0 ? (
        visibleScores.map((fw: any) => {
          const score = fw.avg_score ?? 0;
          const level = classifyLevel(score);
          return (
            <Card
              // Primary key when present; framework_type is unique after the dedupe above.
              key={fw.id ?? fw.framework_type}
              elevation={0}
              sx={{
                ...cardStyles.base(theme),
                "padding": "16px",
                "transition": "border-color 0.2s ease",
                "&:hover": { borderColor: getLevelColor(level) },
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ gap: "8px", mb: "8px", minHeight: "24px" }}
              >
                <Stack direction="row" alignItems="center" sx={{ gap: "6px" }}>
                  <Typography sx={{ fontSize: 13, color: textColors.secondary, fontWeight: 500 }}>
                    {formatFrameworkName(fw.framework_type)}
                  </Typography>
                  {fw.visibility === "private" && (
                    <VWTooltip content="Only you can see this calculation" placement="top">
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{ gap: "4px", color: textColors.secondary }}
                      >
                        <Lock size={12} />
                        <Typography sx={{ fontSize: 13 }}>Private</Typography>
                      </Stack>
                    </VWTooltip>
                  )}
                </Stack>
                {canDelete(fw) && (
                  <VWTooltip content="Delete this calculation" placement="top">
                    <IconButton
                      size="small"
                      aria-label="Delete this calculation"
                      data-testid={`readiness-delete-${fw.id}`}
                      onClick={() =>
                        setPendingDelete({
                          id: fw.id,
                          name: formatFrameworkName(fw.framework_type),
                        })
                      }
                      sx={{ p: "4px", color: textColors.secondary }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </IconButton>
                  </VWTooltip>
                )}
              </Stack>
              <Stack direction="row" alignItems="center" sx={{ gap: "8px" }}>
                <Typography
                  sx={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: getLevelColor(level),
                    lineHeight: 1.2,
                  }}
                >
                  {score}
                </Typography>
                <Chip
                  label={getLevelLabel(level)}
                  variant={LEVEL_CONFIG[level].variant}
                  size="small"
                  uppercase={false}
                />
              </Stack>
              {/* Mini counts row */}
              <Stack direction="row" sx={{ mt: "8px", flexWrap: "wrap", gap: "8px" }}>
                {LEVELS.map((lvl) => {
                  const { label, color, countKey } = LEVEL_CONFIG[lvl];
                  const count = fw[countKey] ?? 0;
                  return (
                    <Typography key={label} sx={{ fontSize: 13, color: textColors.secondary }}>
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 500,
                          color: count > 0 ? color : textColors.secondary,
                        }}
                      >
                        {count}
                      </Box>{" "}
                      {label.toLowerCase()}
                    </Typography>
                  );
                })}
              </Stack>
            </Card>
          );
        })
      ) : (
        <Box sx={{ gridColumn: "1 / -1" }}>
          <EmptyState
            icon={ShieldCheck}
            message={'No readiness scores yet. Click "Calculate readiness" to start.'}
          />
        </Box>
      )}
    </Box>
  );

  return (
    <Box>
      {/* Header — the controls share this row with the summary cards when scoped. */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems={isScoped ? "flex-start" : "center"}
        sx={{ gap: "16px", flexWrap: "wrap", mb: "16px" }}
      >
        {isScoped ? (
          summaryCards
        ) : (
          <Box>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: 20,
                fontFamily: "'Red Hat Display', 'Geist', sans-serif",
                color: textColors.primary,
                lineHeight: 1.2,
              }}
            >
              Audit readiness
            </Typography>
            <Typography sx={{ fontSize: 13, color: textColors.secondary, mt: "4px" }}>
              Per-control readiness scores, framework aggregations, and improvement recommendations.
            </Typography>
          </Box>
        )}
        <Stack direction="row" alignItems="center" sx={{ gap: "8px", flexShrink: 0 }}>
          <VisibilityChips value={visFilter} onChange={setVisFilter} hints={VISIBILITY_HINTS} />
          <CustomizableButton
            variant="contained"
            color="primary"
            size="medium"
            text={triggerCalculate.isPending ? "Calculating..." : "Calculate readiness"}
            icon={<RefreshCw size={16} />}
            loading={triggerCalculate.isPending}
            onClick={handleCalculate}
          />
        </Stack>
      </Stack>

      {!isScoped && summaryCards}

      {/* Framework tabs — same style as app's TabBar. Hidden when the caller pins a framework. */}
      {!isScoped && (
        <Tabs
          value={selectedFramework}
          onChange={(_, v) => setSelectedFramework(v)}
          TabIndicatorProps={{
            style: { backgroundColor: brand.primary },
          }}
          sx={{
            "mb": "16px",
            "minHeight": "20px",
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 400,
              minHeight: "20px",
              padding: "16px 0 7px",
              fontSize: 13,
            },
            "& .Mui-selected": { color: brand.primary },
            "& .MuiTabs-flexContainer": { columnGap: "34px" },
          }}
        >
          {FRAMEWORK_TABS.map((tab) => (
            <Tab key={tab.value} value={tab.value} label={tab.label} />
          ))}
        </Tabs>
      )}

      {/* Two-column: Heatmap + Trend */}
      <Box
        sx={{
          ...layoutStyles.gridContainer(theme),
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: "16px",
          mb: "16px",
        }}
      >
        <Card elevation={0} sx={{ ...cardStyles.base(theme), padding: "16px" }}>
          <CardContent sx={{ "p": 0, "&:last-child": { pb: 0 } }}>
            <ReadinessHeatmap
              controls={controlScores ?? []}
              frameworkType={activeFramework}
              isLoading={controlsLoading}
            />
          </CardContent>
        </Card>
        <Card elevation={0} sx={{ ...cardStyles.base(theme), padding: "16px" }}>
          <CardContent sx={{ "p": 0, "&:last-child": { pb: 0 } }}>
            <ReadinessTrend data={history ?? []} isLoading={historyLoading} />
          </CardContent>
        </Card>
      </Box>

      {/* Weakest controls */}
      <Card elevation={0} sx={{ ...cardStyles.base(theme), padding: "16px" }}>
        <CardContent sx={{ "p": 0, "&:last-child": { pb: 0 } }}>
          <WeakControlsList controls={weakest ?? []} isLoading={weakestLoading} />
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={pendingDelete !== null}
        title="Delete this calculation?"
        body={
          <Typography fontSize={13} color={textColors.secondary}>
            The {pendingDelete?.name} readiness score, its control scores and its history points are
            removed. Calculate again to get a new score.
          </Typography>
        }
        cancelText="Cancel"
        proceedText="Delete"
        proceedButtonColor="error"
        proceedButtonVariant="contained"
        isLoading={deleteCalculation.isPending}
        onCancel={() => setPendingDelete(null)}
        onProceed={confirmDelete}
      />
    </Box>
  );
}
