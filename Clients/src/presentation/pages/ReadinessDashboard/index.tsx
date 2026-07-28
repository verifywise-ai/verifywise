import { useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  Card,
  CardContent,
  useTheme,
} from "@mui/material";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { VisibilityChips } from "../../components/VisibilityToggle";
import type { VisibilityFilterValue } from "../../components/VisibilityToggle";
import { cardStyles, layoutStyles } from "../../themes/components";
import {
  text as textColors,
  brand,
  status,
  accent,
} from "../../themes/palette";
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
} from "../../../application/hooks/useReadiness";
import type { ReadinessLevel } from "../../../domain/interfaces/i.readiness";

const FRAMEWORK_TABS = [
  { value: "eu_ai_act", label: "EU AI Act" },
  { value: "iso_42001", label: "ISO 42001" },
];

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
  switch (level) {
    case "ready":
      return status.success.text;
    case "needs_work":
      return accent.primary.text;
    case "at_risk":
      return status.warning.text;
    case "not_started":
      return status.error.text;
    default:
      return textColors.accent;
  }
}

function getLevelLabel(level: ReadinessLevel | string | undefined) {
  switch (level) {
    case "ready":
      return "Ready";
    case "needs_work":
      return "Needs work";
    case "at_risk":
      return "At risk";
    case "not_started":
      return "Not started";
    default:
      return "—";
  }
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

  // Only the framework this view is pinned to — an org-wide card row inside a
  // single use case's framework tab would misrepresent the numbers.
  const visibleScores = useMemo(() => {
    if (!scores) return [];
    if (!frameworkType) return scores;
    return scores.filter((fw: any) => fw.framework_type === frameworkType);
  }, [scores, frameworkType]);

  const handleCalculate = () => {
    const visibility = visFilter === "private" ? "private" : "public";
    if (isScoped && frameworkType) {
      triggerCalculateFramework.mutate({ frameworkType, projectId, visibility });
    } else {
      triggerCalculateAll.mutate({ visibility });
    }
  };

  return (
    <Box>
      {/* Header — matches dashboard style */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb="8px">
        {isScoped ? (
          <Box />
        ) : (
          <Box>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: 20,
                fontFamily: "'Red Hat Display', 'Geist', sans-serif",
                color: textColors.primary,
              }}
            >
              Audit readiness
            </Typography>
            <Typography sx={{ fontSize: 13, color: textColors.secondary, mt: 0.25 }}>
              Per-control readiness scores, framework aggregations, and improvement recommendations.
            </Typography>
          </Box>
        )}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <VisibilityChips value={visFilter} onChange={setVisFilter} />
          <Button
            variant="contained"
            size="small"
            onClick={handleCalculate}
            disabled={triggerCalculate.isPending}
            startIcon={
              triggerCalculate.isPending ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <RefreshCw size={14} />
              )
            }
            sx={{
              "textTransform": "none",
              "minWidth": 160,
              "backgroundColor": brand.primary,
              "borderRadius": "4px",
              "fontSize": 13,
              "fontWeight": 500,
              "boxShadow": "none",
              "&:hover": {
                backgroundColor: brand.primaryHover,
                boxShadow: "none",
              },
            }}
          >
            {triggerCalculate.isPending ? "Calculating..." : "Calculate readiness"}
          </Button>
        </Stack>
      </Stack>

      {/* Summary stat cards */}
      <Box
        sx={{
          ...layoutStyles.gridContainer(theme),
          gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(240px, 1fr))" },
          mb: "8px",
        }}
      >
        {scoresLoading ? (
          <Box sx={{ p: 2, textAlign: "center", width: "100%" }}>
            <CircularProgress size={20} />
          </Box>
        ) : visibleScores.length > 0 ? (
          visibleScores.map((fw: any) => {
            const score = fw.avg_score ?? 0;
            const level = classifyLevel(score);
            return (
              <Card
                key={`${fw.framework_type}-${fw.project_id ?? "org"}`}
                elevation={0}
                sx={{
                  ...cardStyles.base(theme),
                  "transition": "border-color 0.2s ease",
                  "&:hover": { borderColor: getLevelColor(level) },
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12,
                    color: textColors.secondary,
                    fontWeight: 500,
                    mb: 0.5,
                  }}
                >
                  {formatFrameworkName(fw.framework_type)}
                </Typography>
                <Stack direction="row" alignItems="baseline" spacing={1}>
                  <Typography
                    sx={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: getLevelColor(level),
                      lineHeight: 1.1,
                    }}
                  >
                    {score}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: getLevelColor(level),
                      textTransform: "uppercase",
                    }}
                  >
                    {getLevelLabel(level)}
                  </Typography>
                </Stack>
                {/* Mini counts row */}
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                  {[
                    {
                      label: "Ready",
                      count: fw.ready_count ?? 0,
                      color: status.success.text,
                    },
                    {
                      label: "Needs work",
                      count: fw.needs_work_count ?? 0,
                      color: accent.primary.text,
                    },
                    {
                      label: "At risk",
                      count: fw.at_risk_count ?? 0,
                      color: status.warning.text,
                    },
                    {
                      label: "Not started",
                      count: fw.not_started_count ?? 0,
                      color: status.error.text,
                    },
                  ].map((item) => (
                    <Typography key={item.label} sx={{ fontSize: 11, color: textColors.accent }}>
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 600,
                          color: item.count > 0 ? item.color : textColors.accent,
                        }}
                      >
                        {item.count}
                      </Box>{" "}
                      {item.label}
                    </Typography>
                  ))}
                </Stack>
              </Card>
            );
          })
        ) : (
          <Card elevation={0} sx={{ ...cardStyles.base(theme), gridColumn: "1 / -1" }}>
            <CardContent sx={{ "textAlign": "center", "py": 3, "&:last-child": { pb: 3 } }}>
              <ShieldCheck
                size={32}
                strokeWidth={1}
                style={{ color: textColors.accent, marginBottom: 8 }}
              />
              <Typography sx={{ fontSize: 13, color: textColors.tertiary }}>
                No readiness scores yet. Click &quot;Calculate readiness&quot; to start.
              </Typography>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* Framework tabs — same style as app's TabBar. Hidden when the caller pins a framework. */}
      {!isScoped && (
        <Tabs
          value={selectedFramework}
          onChange={(_, v) => setSelectedFramework(v)}
          TabIndicatorProps={{
            style: { backgroundColor: brand.primary },
          }}
          sx={{
            "mb": "8px",
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
          mb: "8px",
        }}
      >
        <Card elevation={0} sx={cardStyles.base(theme)}>
          <CardContent sx={{ "p": 0, "&:last-child": { pb: 0 } }}>
            <ReadinessHeatmap
              controls={controlScores ?? []}
              frameworkType={activeFramework}
              isLoading={controlsLoading}
            />
          </CardContent>
        </Card>
        <Card elevation={0} sx={cardStyles.base(theme)}>
          <CardContent sx={{ "p": 0, "&:last-child": { pb: 0 } }}>
            <ReadinessTrend data={history ?? []} isLoading={historyLoading} />
          </CardContent>
        </Card>
      </Box>

      {/* Weakest controls */}
      <Card elevation={0} sx={cardStyles.base(theme)}>
        <CardContent sx={{ "p": 0, "&:last-child": { pb: 0 } }}>
          <WeakControlsList controls={weakest ?? []} isLoading={weakestLoading} />
        </CardContent>
      </Card>
    </Box>
  );
}
