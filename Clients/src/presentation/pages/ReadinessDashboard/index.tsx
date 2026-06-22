import { useState } from "react";
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
} from "@mui/material";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { VisibilityChips } from "../../components/VisibilityToggle";
import type { VisibilityFilterValue } from "../../components/VisibilityToggle";
import {
  text as textColors,
  background,
  border as borderPalette,
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
} from "../../../application/hooks/useReadiness";
import type { ReadinessLevel } from "../../../domain/interfaces/i.readiness";

const FRAMEWORK_TABS = [
  { value: "eu_ai_act", label: "EU AI Act" },
  { value: "iso_42001", label: "ISO 42001" },
];

// Consistent card style matching DashboardCard / DashboardHeaderCard
const cardSx = {
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: "4px",
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
};

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

export default function ReadinessDashboard() {
  const [selectedFramework, setSelectedFramework] = useState("eu_ai_act");
  const [visFilter, setVisFilter] = useState<VisibilityFilterValue>("all");

  const filterParam = visFilter === "all" ? undefined : visFilter;
  const { data: scores, isLoading: scoresLoading } = useReadinessScores(undefined, filterParam);
  const { data: controlScores, isLoading: controlsLoading } = useControlScores(selectedFramework, {
    visibility: filterParam,
  });
  const { data: weakest, isLoading: weakestLoading } = useWeakestControls(
    10,
    undefined,
    filterParam,
  );
  const { data: history, isLoading: historyLoading } = useReadinessHistory(
    undefined,
    undefined,
    filterParam,
  );
  const triggerCalculate = useTriggerCalculateAll();

  const handleCalculate = () => {
    triggerCalculate.mutate({ visibility: visFilter === "private" ? "private" : "public" });
  };

  return (
    <Box>
      {/* Header — matches dashboard style */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb="8px">
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

      {/* Summary stat cards — matching DashboardHeaderCard layout */}
      <Box
        sx={{
          "display": "flex",
          "flexWrap": "wrap",
          "gap": "8px",
          "mb": "8px",
          "& > *": { flex: "1 1 0", minWidth: "150px" },
        }}
      >
        {scoresLoading ? (
          <Box sx={{ p: 2, textAlign: "center", width: "100%" }}>
            <CircularProgress size={20} />
          </Box>
        ) : scores && scores.length > 0 ? (
          scores.map((fw: any) => {
            const score = fw.avg_score ?? 0;
            const level = classifyLevel(score);
            return (
              <Stack
                key={`${fw.framework_type}-${fw.project_id ?? "org"}`}
                sx={{
                  ...cardSx,
                  "borderRadius": 2,
                  "padding": "12px 18px 16px 18px",
                  "transition": "all 0.2s ease",
                  "&:hover": {
                    borderColor: getLevelColor(level),
                    background: `linear-gradient(135deg, ${background.accent} 0%, ${background.gradientStop} 100%)`,
                  },
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
              </Stack>
            );
          })
        ) : (
          <Card elevation={0} sx={{ ...cardSx, width: "100%" }}>
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

      {/* Framework tabs — same style as app's TabBar */}
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

      {/* Two-column: Heatmap + Trend — using DashboardCard pattern */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: "8px",
          mb: "8px",
        }}
      >
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
            <ReadinessHeatmap
              controls={controlScores ?? []}
              frameworkType={selectedFramework}
              isLoading={controlsLoading}
            />
          </CardContent>
        </Card>
        <Card elevation={0} sx={cardSx}>
          <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
            <ReadinessTrend data={history ?? []} isLoading={historyLoading} />
          </CardContent>
        </Card>
      </Box>

      {/* Weakest controls */}
      <Card elevation={0} sx={cardSx}>
        <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
          <WeakControlsList controls={weakest ?? []} isLoading={weakestLoading} />
        </CardContent>
      </Card>
    </Box>
  );
}
