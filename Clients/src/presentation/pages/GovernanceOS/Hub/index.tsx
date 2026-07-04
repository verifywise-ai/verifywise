import React, { useContext, useMemo } from "react";
import {
  Stack,
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  alpha,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  GitCompareArrows,
  Compass,
  BarChart3,
  FileCheck,
  Network,
  Radio,
  ArrowRight,
  Zap,
  Target,
  Plus,
  AlertTriangle,
} from "lucide-react";
import GovernanceLayout from "../shared/GovernanceLayout";
import { DashboardHeaderCard } from "../../../components/Cards/DashboardHeaderCard";
import FrameworkChip from "../../../components/GovernanceOS/FrameworkChip";
import GovernanceTooltip from "../../../components/GovernanceOS/GovernanceTooltip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  brand,
  border as borderPalette,
  background,
  text,
  status,
  accent,
} from "../../../themes/palette";
import {
  useMappings,
  useScenarios,
  useGovernancePreferences,
  useCoverage,
} from "../../../../application/hooks/useGovernanceOs";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";

interface ModuleCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  stat?: string;
  subStat?: string;
  color: string;
  disabled?: boolean;
  tooltipHeader: string;
  tooltipDescription: string;
}

const FRAMEWORK_NAMES: Record<number, string> = {
  1: "EU AI Act",
  2: "ISO 42001",
  3: "ISO 27001",
  4: "NIST AI RMF",
};

const ModuleCard: React.FC<ModuleCardProps> = ({
  title,
  description,
  icon,
  path,
  stat,
  subStat,
  color,
  disabled,
  tooltipHeader,
  tooltipDescription,
}) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = React.useState(false);

  const card = (
    <Card
      elevation={0}
      onClick={() => !disabled && navigate(path)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        "cursor": disabled ? "default" : "pointer",
        "borderRadius": "4px",
        "border": `1px solid ${borderPalette.dark}`,
        "background": `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        "opacity": disabled ? 0.6 : 1,
        "transition": "all 0.2s ease",
        "height": "100%",
        "&:hover": disabled
          ? {}
          : {
              background: `linear-gradient(135deg, ${background.accent} 0%, ${background.gradientStop} 100%)`,
              borderColor: borderPalette.light,
            },
      }}
    >
      <CardContent sx={{ "p": "16px", "&:last-child": { pb: "16px" } }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "4px",
              backgroundColor: alpha(color, 0.08),
              color: color,
            }}
          >
            {icon}
          </Box>
          {!disabled && (
            <ArrowRight
              size={16}
              color={text.muted}
              style={{
                opacity: isHovered ? 1 : 0.3,
                transition: "opacity 0.2s ease",
                flexShrink: 0,
              }}
            />
          )}
        </Stack>
        <Typography sx={{ mt: "12px", fontSize: 14, fontWeight: 600, color: "#1F2937" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 13, color: text.secondary, mt: 0.5, display: "block" }}>
          {description}
        </Typography>
        {stat && (
          <Typography sx={{ mt: 1.5, fontSize: 13, fontWeight: 600, color }}>{stat}</Typography>
        )}
        {subStat && (
          <Typography sx={{ fontSize: 12, color: text.muted, display: "block" }}>
            {subStat}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  return disabled ? (
    card
  ) : (
    <GovernanceTooltip header={tooltipHeader} description={tooltipDescription}>
      <span style={{ display: "block" }}>{card}</span>
    </GovernanceTooltip>
  );
};

const GovernanceHub: React.FC = () => {
  const navigate = useNavigate();
  const { projects, currentProjectId } = useContext(VerifyWiseContext);
  const { data: mappings } = useMappings();
  const { data: scenarios } = useScenarios();
  const { data: preferences } = useGovernancePreferences();

  const totalMappings = mappings?.length || 0;
  const totalScenarios = scenarios?.length || 0;

  const activeScenario = useMemo(() => {
    if (!preferences?.selected_scenario_id || !scenarios) return null;
    return scenarios.find((s) => s.id === preferences.selected_scenario_id) || null;
  }, [preferences, scenarios]);

  const activeScenarioPriority = activeScenario?.priority_order as {
    primary?: number;
    secondary?: number[];
    supplementary?: number[];
  } | null;

  const activeFrameworkIds = useMemo(() => {
    const ids = new Set<number>();
    if (activeScenarioPriority?.primary) ids.add(activeScenarioPriority.primary);
    activeScenarioPriority?.secondary?.forEach((id) => ids.add(id));
    activeScenarioPriority?.supplementary?.forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [activeScenarioPriority]);

  // Pick a project to show coverage from: current project, or first project with frameworks
  const projectForCoverage = useMemo(() => {
    if (currentProjectId) {
      const parsed = Number(currentProjectId);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const projectWithFrameworks = (projects || []).find(
      (p: any) => p.framework && p.framework.length > 0,
    );
    return projectWithFrameworks?.id || 0;
  }, [currentProjectId, projects]);

  const { data: coverage } = useCoverage(projectForCoverage);

  const coverageStats = useMemo(() => {
    if (!coverage || coverage.length === 0) return null;
    const avg = Math.round(
      coverage.reduce((sum, c) => sum + c.coverage_percentage, 0) / coverage.length,
    );
    const totalGaps = coverage.reduce((sum, c) => sum + c.gap_details.unmapped_controls.length, 0);
    const topGapFrameworks = [...coverage]
      .sort(
        (a, b) => b.gap_details.unmapped_controls.length - a.gap_details.unmapped_controls.length,
      )
      .slice(0, 3);
    return { avg, totalGaps, frameworkCount: coverage.length, topGapFrameworks };
  }, [coverage]);

  const topDomain = useMemo(() => {
    if (!mappings || mappings.length === 0) return null;
    const counts: Record<string, number> = {};
    mappings.forEach((m: any) => {
      const tag = m.domain_tag || "Uncategorized";
      counts[tag] = (counts[tag] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] || null;
  }, [mappings]);

  const coverageColor =
    coverageStats && coverageStats.avg >= 70
      ? status.success.text
      : coverageStats && coverageStats.avg >= 40
        ? status.warning.text
        : status.error.text;

  const modules: ModuleCardProps[] = [
    {
      title: "Framework Mapper",
      description: "Explore and manage cross-framework control mappings",
      icon: <GitCompareArrows size={20} />,
      path: "/governance/framework-mapper",
      stat: `${totalMappings} mappings`,
      subStat: topDomain ? `Top domain: ${topDomain[0]} (${topDomain[1]})` : undefined,
      color: brand.primary,
      tooltipHeader: "View mappings",
      tooltipDescription: "Open the Framework Mapper to browse control mappings",
    },
    {
      title: "Scenario Builder",
      description: "Get recommendations and manage governance scenarios",
      icon: <Compass size={20} />,
      path: "/governance/scenarios",
      stat: activeScenario ? `Active: ${activeScenario.name}` : `${totalScenarios} scenarios`,
      color: accent.indigo.text,
      tooltipHeader: "Get recommendations",
      tooltipDescription: "Receive scenario suggestions tailored to the project context",
    },
    {
      title: "Unified Insights",
      description: "Analyze coverage, gaps, and synergies across projects",
      icon: <BarChart3 size={20} />,
      path: "/governance/insights",
      stat: coverageStats != null ? `${coverageStats.avg}% avg coverage` : "Coverage analysis",
      subStat:
        coverageStats != null ? `${coverageStats.totalGaps} gaps across frameworks` : undefined,
      color: accent.blue.text,
      tooltipHeader: "Run coverage analysis",
      tooltipDescription: "Analyze coverage and gaps across active frameworks",
    },
    {
      title: "Evidence Hub",
      description: "Centralize evidence with automated collection",
      icon: <FileCheck size={20} />,
      path: "#",
      stat: "Coming soon — Q3 2026",
      subStat: "Estimated: 8–10 weeks",
      color: accent.teal.text,
      disabled: true,
      tooltipHeader: "Evidence Hub (coming soon)",
      tooltipDescription:
        "Centralize and manage compliance evidence across frameworks and projects. Target release: Q3 2026 (8–10 weeks).",
    },
    {
      title: "Knowledge Graph",
      description: "Visual exploration of governance relationships",
      icon: <Network size={20} />,
      path: "#",
      stat: "Coming soon — Q4 2026",
      subStat: "Estimated: 12–14 weeks",
      color: accent.purple.text,
      disabled: true,
      tooltipHeader: "Knowledge Graph (coming soon)",
      tooltipDescription:
        "Visual exploration of governance relationships, controls, and compliance dependencies. Target release: Q4 2026 (12–14 weeks).",
    },
    {
      title: "Regulatory Radar",
      description: "Monitor regulation changes and auto-updates",
      icon: <Radio size={20} />,
      path: "#",
      stat: "Coming soon — Q4 2026",
      subStat: "Estimated: 10–12 weeks",
      color: accent.orange.text,
      disabled: true,
      tooltipHeader: "Regulatory Radar (coming soon)",
      tooltipDescription:
        "Monitor regulatory changes, track compliance deadlines, and receive alerts. Target release: Q4 2026 (10–12 weeks).",
    },
  ];

  return (
    <GovernanceLayout
      title="Governance Intelligence"
      subtitle="Your central command center for cross-framework governance, compliance mapping, and coverage analysis."
    >
      <Stack gap="16px">
        {/* Active scenario preview */}
        {activeScenario ? (
          <Box
            sx={{
              border: `1px solid ${brand.primary}`,
              borderRadius: "4px",
              p: "16px",
              background: `linear-gradient(135deg, ${background.main} 0%, ${alpha(brand.primary, 0.06)} 100%)`,
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    backgroundColor: alpha(brand.primary, 0.12),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Target size={20} color={brand.primary} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 12, color: text.muted, mb: 0.5 }}>
                    Active governance scenario
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 600, color: text.primary }}>
                    {activeScenario.name}
                  </Typography>
                  {activeScenario.description && (
                    <Typography sx={{ fontSize: 13, color: text.accent, mt: 0.5 }}>
                      {activeScenario.description}
                    </Typography>
                  )}
                  <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1.5 }}>
                    {activeFrameworkIds.map((id) => {
                      const priority =
                        id === activeScenarioPriority?.primary
                          ? "primary"
                          : activeScenarioPriority?.secondary?.includes(id)
                            ? "secondary"
                            : "supplementary";
                      return (
                        <FrameworkChip
                          key={id}
                          frameworkName={FRAMEWORK_NAMES[id] || `Framework ${id}`}
                          priority={priority}
                          size="small"
                        />
                      );
                    })}
                  </Stack>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <GovernanceTooltip
                  header="View scenario"
                  description="Open the active scenario details"
                >
                  <span>
                    <CustomizableButton
                      size="small"
                      variant="outlined"
                      onClick={() => navigate("/governance/scenarios")}
                      text="View Scenario"
                    />
                  </span>
                </GovernanceTooltip>
                <GovernanceTooltip
                  header="Run coverage analysis"
                  description="Open Unified Insights to analyze coverage and gaps"
                >
                  <span>
                    <CustomizableButton
                      size="small"
                      variant="contained"
                      startIcon={<Zap size={14} />}
                      onClick={() => navigate("/governance/insights")}
                      text="Run Coverage"
                    />
                  </span>
                </GovernanceTooltip>
              </Stack>
            </Stack>
          </Box>
        ) : (
          <Box
            sx={{
              border: `1px dashed ${borderPalette.light}`,
              borderRadius: "4px",
              p: "16px",
              background: background.main,
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Target size={20} color={text.muted} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                  No active scenario selected
                </Typography>
                <Typography sx={{ fontSize: 12, color: text.muted }}>
                  Select a governance scenario to prioritize frameworks and guide compliance
                  planning.
                </Typography>
              </Box>
              <GovernanceTooltip
                header="Choose scenario"
                description="Select or create a governance scenario for the project"
              >
                <span>
                  <CustomizableButton
                    size="small"
                    variant="contained"
                    onClick={() => navigate("/governance/scenarios")}
                    text="Choose scenario"
                  />
                </span>
              </GovernanceTooltip>
            </Stack>
          </Box>
        )}

        {/* Live coverage stats */}
        {coverageStats ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
              gap: "16px",
            }}
          >
            <GovernanceTooltip
              header="Average coverage"
              description="Mean percentage of mapped controls across active frameworks"
            >
              <Box
                sx={{
                  p: "12px 14px 14px 14px",
                  borderRadius: "4px",
                  border: `1px solid ${borderPalette.dark}`,
                  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
                }}
              >
                <Typography sx={{ fontSize: 13, color: "#8594AC", mb: "2px" }}>
                  Avg Coverage
                </Typography>
                <Typography
                  sx={{ fontSize: 16, fontWeight: 600, color: coverageColor, mt: 1, minHeight: 32 }}
                >
                  {coverageStats.avg}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={coverageStats.avg}
                  sx={{
                    "height": 4,
                    "borderRadius": "4px",
                    "mt": 1,
                    "backgroundColor": background.hover,
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: coverageColor,
                      borderRadius: "4px",
                    },
                  }}
                />
              </Box>
            </GovernanceTooltip>

            <GovernanceTooltip
              header="Total gaps"
              description="Unmapped controls across all active frameworks"
            >
              <Box
                sx={{
                  p: "12px 14px 14px 14px",
                  borderRadius: "4px",
                  border: `1px solid ${borderPalette.dark}`,
                  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
                }}
              >
                <Typography sx={{ fontSize: 13, color: "#8594AC", mb: "2px" }}>
                  Total Gaps
                </Typography>
                <Typography
                  sx={{
                    mt: 1,
                    minHeight: 32,
                    fontSize: 16,
                    fontWeight: 600,
                    color: coverageStats.totalGaps > 0 ? status.warning.text : status.success.text,
                  }}
                >
                  {coverageStats.totalGaps}
                </Typography>
                <Typography sx={{ fontSize: 11, color: text.muted }}>unmapped controls</Typography>
              </Box>
            </GovernanceTooltip>

            <GovernanceTooltip
              header="Active frameworks"
              description="Frameworks assigned to the current project"
            >
              <Box
                sx={{
                  p: "12px 14px 14px 14px",
                  borderRadius: "4px",
                  border: `1px solid ${borderPalette.dark}`,
                  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
                }}
              >
                <Typography sx={{ fontSize: 13, color: "#8594AC", mb: "2px" }}>
                  Active Frameworks
                </Typography>
                <Typography
                  sx={{ mt: 1, minHeight: 32, fontSize: 16, fontWeight: 600, color: brand.primary }}
                >
                  {coverageStats.frameworkCount}
                </Typography>
                <Typography sx={{ fontSize: 11, color: text.muted }}>
                  in project {projectForCoverage}
                </Typography>
              </Box>
            </GovernanceTooltip>

            <GovernanceTooltip
              header="Total mappings"
              description="Cross-framework control links created"
            >
              <Box
                sx={{
                  p: "12px 14px 14px 14px",
                  borderRadius: "4px",
                  border: `1px solid ${borderPalette.dark}`,
                  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
                }}
              >
                <Typography sx={{ fontSize: 13, color: "#8594AC", mb: "2px" }}>
                  Total Mappings
                </Typography>
                <Typography
                  sx={{ mt: 1, minHeight: 32, fontSize: 16, fontWeight: 600, color: brand.primary }}
                >
                  {totalMappings}
                </Typography>
                <Typography sx={{ fontSize: 11, color: text.muted }}>
                  cross-framework links
                </Typography>
              </Box>
            </GovernanceTooltip>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
              gap: "16px",
            }}
          >
            <DashboardHeaderCard title="Avg Coverage" count="—" disableNavigation />
            <DashboardHeaderCard title="Total Gaps" count="—" disableNavigation />
            <DashboardHeaderCard title="Active Frameworks" count="—" disableNavigation />
            <DashboardHeaderCard title="Total Mappings" count={totalMappings} disableNavigation />
          </Box>
        )}

        {/* Quick actions */}
        <Stack direction="row" gap="8px" flexWrap="wrap">
          <GovernanceTooltip
            header="Get recommendations"
            description="Receive scenario suggestions tailored to the project context"
          >
            <span>
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<Compass size={14} />}
                onClick={() => navigate("/governance/scenarios")}
                text="Get Recommendations"
              />
            </span>
          </GovernanceTooltip>
          <GovernanceTooltip
            header="Run coverage analysis"
            description="Analyze coverage and gaps across active frameworks"
          >
            <span>
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<BarChart3 size={14} />}
                onClick={() => navigate("/governance/insights")}
                text="Run Coverage Analysis"
              />
            </span>
          </GovernanceTooltip>
          <GovernanceTooltip
            header="View mappings"
            description="Open the Framework Mapper to browse control mappings"
          >
            <span>
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<GitCompareArrows size={14} />}
                onClick={() => navigate("/governance/framework-mapper")}
                text="View Mappings"
              />
            </span>
          </GovernanceTooltip>
          <GovernanceTooltip
            header="New scenario"
            description="Create a custom governance scenario for the project"
          >
            <span>
              <CustomizableButton
                size="small"
                variant="outlined"
                startIcon={<Plus size={14} />}
                onClick={() => navigate("/governance/scenarios")}
                text="New Scenario"
              />
            </span>
          </GovernanceTooltip>
        </Stack>

        {/* Module cards grid */}
        <Box>
          <Typography sx={{ mb: "12px", fontSize: 14, fontWeight: 600 }}>Modules</Typography>
          <Grid container spacing={2}>
            {modules.map((module) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={module.title}>
                <ModuleCard {...module} />
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Gap hotspot preview */}
        {coverageStats && coverageStats.topGapFrameworks.length > 0 && (
          <Box
            sx={{
              border: `1px solid ${borderPalette.dark}`,
              borderRadius: "4px",
              p: "16px",
              background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
            }}
          >
            <GovernanceTooltip
              header="Gap hotspots"
              description="Frameworks with the most unmapped controls"
            >
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: "12px" }}>
                <AlertTriangle size={18} color={status.warning.text} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Gap Hotspots</Typography>
              </Stack>
            </GovernanceTooltip>
            <Typography sx={{ fontSize: 13, color: text.accent, mb: "12px" }}>
              Frameworks with the most unmapped controls. Address these first for the biggest
              coverage improvement.
            </Typography>
            <Stack gap="8px">
              {coverageStats.topGapFrameworks.map((fw) => (
                <Box
                  key={fw.framework_id}
                  sx={{
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "space-between",
                    "p": "12px",
                    "borderRadius": "4px",
                    "border": `1px solid ${borderPalette.light}`,
                    "background": background.main,
                    "&:hover": { background: background.accent },
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: text.primary }}>
                      {fw.framework_name || `Framework ${fw.framework_id}`}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 20,
                        px: "8px",
                        borderRadius: "4px",
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: status.warning.bg,
                        color: status.warning.text,
                        border: `1px solid ${status.warning.border}`,
                      }}
                    >
                      {fw.gap_details.unmapped_controls.length} gaps
                    </Box>
                    <Typography sx={{ fontSize: 12, color: text.muted }}>
                      {fw.coverage_percentage}% coverage
                    </Typography>
                  </Stack>
                  <CustomizableButton
                    size="small"
                    variant="text"
                    onClick={() => navigate("/governance/insights")}
                    text="View"
                  />
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </GovernanceLayout>
  );
};

export default GovernanceHub;
