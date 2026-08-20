/**
 * JIRA Use Case Overview
 * Uses EXACT same styling as native VWProjectOverview
 * Includes Completion Status for assigned frameworks
 */

import React, { useEffect, useState, useMemo } from "react";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { Stack, Typography, Box, Chip, Divider, CircularProgress } from "@mui/material";
import {
  Database,
  Key as KeyIcon,
  Box as BoxIcon,
  RefreshCw as SyncIcon,
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  Activity as ActivityIcon,
} from "lucide-react";
import {
  infoCardStyle,
  infoCardTitleStyle,
  infoCardbodyStyle,
} from "../../../components/Cards/InfoCard/style";

interface JiraData {
  id?: string;
  label?: string;
  objectKey?: string;
  objectType?: { name?: string };
  created?: string;
  updated?: string;
  attributes?: Record<string, any>;
}

interface ProjectFramework {
  framework_id: number;
  project_framework_id?: number;
}

interface JiraUseCaseOverviewProps {
  project: {
    id?: number;
    project_title?: string;
    uc_id?: string;
    _source?: string;
    status?: string;
    owner?: number;
    last_updated?: string;
    last_updated_by?: number;
    goal?: string;
    framework?: ProjectFramework[];
  } | null;
}

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  const str = String(value);
  // Truncate long values for display in cards
  return str.length > 50 ? str.substring(0, 47) + "..." : str || "-";
};

// infoCardStyle / infoCardTitleStyle / infoCardbodyStyle imported at top —
// they were previously copy-pasted here and drifted from the shared source.

// EXACT same row/column styles as native Overview
const rowStyle = {
  display: "flex",
  flexDirection: "row" as const,
  gap: 10,
  mb: 10,
};

const columnStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  width: "100%",
};

const projectRiskSection = {
  color: "#1A1919",
  fontWeight: 600,
  mb: "10px",
  fontSize: 16,
};

// GroupStatsCard frame style - matching native
const groupStatsCardFrame = {
  display: "flex",
  flexDirection: "row" as const,
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  minWidth: "300px",
  maxWidth: "100%",
  gap: "40px",
  backgroundColor: "white",
  padding: "10px 25px",
  border: "1px solid #d0d5dd",
  borderRadius: "4px",
  boxShadow: "none",
};

const groupStatsCardRate = {
  color: "#2D3748",
  fontSize: 26,
};

// Get progress bar color based on percentage
const getProgressColor = (value: number): string => {
  if (value <= 10) return "#FF4500";
  if (value <= 20) return "#FF4500";
  if (value <= 30) return "#FFA500";
  if (value <= 40) return "#FFD700";
  if (value <= 50) return "#E9F14F";
  if (value <= 60) return "#CDDD24";
  if (value <= 70) return "#64E730";
  if (value <= 80) return "#13715B";
  if (value <= 90) return "#13715B";
  return "#13715B";
};

// InfoCard component
function InfoCard({ title, body, icon }: { title: string; body: string; icon?: React.ReactNode }) {
  return (
    <Stack sx={infoCardStyle}>
      {icon && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "#8594AC",
            opacity: 0.7,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography sx={infoCardTitleStyle}>{title}</Typography>
      <Typography sx={infoCardbodyStyle}>{body}</Typography>
    </Stack>
  );
}

// ProgressBar component matching native VerifyWise Slider-based bar
function ProgressBar({ progress }: { progress: string }) {
  const [completed, total] = progress.split("/").map(Number);
  const value = total === 0 ? 0 : Math.floor((completed / total) * 100);

  return (
    <Box
      sx={{
        width: "100%",
        height: 8,
        backgroundColor: "#E5E7EB",
        borderRadius: "4px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: `${value}%`,
          height: "100%",
          backgroundColor: getProgressColor(value),
          borderRadius: "4px",
          transition: "width 0.3s ease",
        }}
      />
    </Box>
  );
}

// GroupStatsCard component - matching native layout
function GroupStatsCard({
  title,
  completed,
  total,
}: {
  title: string[];
  completed: number[];
  total: number[];
}) {
  const stats = useMemo(() => {
    return title.map((t, index) => {
      const c = completed[index] || 0;
      const tot = total[index] || 0;
      const percentage = tot === 0 ? 0 : Math.floor((c / tot) * 100);
      return {
        label: t,
        completed: c,
        total: tot,
        progress: `${c}/${tot}`,
        percentage,
      };
    });
  }, [title, completed, total]);

  return (
    <Stack sx={groupStatsCardFrame}>
      {/* Progress bars and labels */}
      <Stack
        sx={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          mt: "10px",
        }}
      >
        {stats.map((stat) => (
          <Stack key={stat.label} sx={{ gap: 1 }}>
            <ProgressBar progress={stat.progress} />
            <Typography sx={{ color: "#8594AC", fontSize: 13 }}>
              {`${stat.completed} ${stat.label} out of ${stat.total} is completed`}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {/* Percentages */}
      <Stack sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {stats.map((stat) => (
          <Typography key={stat.label} sx={groupStatsCardRate}>
            {`${stat.percentage}%`}
          </Typography>
        ))}
      </Stack>
    </Stack>
  );
}

export const JiraUseCaseOverview: React.FC<JiraUseCaseOverviewProps> = ({ project }) => {
  const [jiraData, setJiraData] = useState<JiraData | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>("synced");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Framework completion data
  const [euAiActProgress, setEuAiActProgress] = useState<{
    subcontrols: { done: number; total: number };
    assessments: { done: number; total: number };
  } | null>(null);
  const [iso42001Progress, setIso42001Progress] = useState<{
    clauses: { done: number; total: number };
    annexes: { done: number; total: number };
  } | null>(null);
  const [customFrameworks, setCustomFrameworks] = useState<
    Array<{
      name: string;
      progress: { done: number; total: number };
    }>
  >([]);

  // Get framework IDs
  const projectFrameworkId = useMemo(() => {
    const fw = project?.framework?.find((f) => f.framework_id === 1);
    return fw?.project_framework_id;
  }, [project?.framework]);

  const projectFrameworkId2 = useMemo(() => {
    const fw = project?.framework?.find((f) => f.framework_id === 2);
    return fw?.project_framework_id;
  }, [project?.framework]);

  // Fetch JIRA data
  useEffect(() => {
    if (!project?.id) {
      setLoading(false);
      return;
    }

    const fetchJiraData = async () => {
      try {
        setLoading(true);
        const response: any = await apiServices.get(
          `/extensions/jira-assets/use-cases/${project.id}`,
        );
        const data = response.data?.data || response.data;
        setJiraData(data._jira_data || null);
        setSyncStatus(data._sync_status || "synced");
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchJiraData();
  }, [project?.id]);

  // Fetch framework completion data
  useEffect(() => {
    if (!project?.id) return;

    const fetchFrameworkProgress = async () => {
      try {
        // EU AI Act progress
        if (projectFrameworkId) {
          try {
            const [complianceRes, assessmentRes]: [any, any] = await Promise.all([
              apiServices.get(`/eu-ai-act/compliances/progress/${projectFrameworkId}`),
              apiServices.get(`/eu-ai-act/assessments/progress/${projectFrameworkId}`),
            ]);
            // Handle nested data structure from apiServices
            const complianceData = complianceRes.data?.data || complianceRes.data;
            const assessmentData = assessmentRes.data?.data || assessmentRes.data;
            setEuAiActProgress({
              subcontrols: {
                done: complianceData?.allDonesubControls || 0,
                total: complianceData?.allsubControls || 0,
              },
              assessments: {
                done: assessmentData?.answeredQuestions || 0,
                total: assessmentData?.totalQuestions || 0,
              },
            });
          } catch {
            setEuAiActProgress(null);
          }
        }

        // ISO 42001 progress
        if (projectFrameworkId2) {
          try {
            const [clausesRes, annexesRes]: [any, any] = await Promise.all([
              apiServices.get(`/iso-42001/clauses/progress/${projectFrameworkId2}`),
              apiServices.get(`/iso-42001/annexes/progress/${projectFrameworkId2}`),
            ]);
            // Handle nested data structure from apiServices
            const clausesData = clausesRes.data?.data || clausesRes.data;
            const annexesData = annexesRes.data?.data || annexesRes.data;
            setIso42001Progress({
              clauses: {
                done: clausesData?.doneSubclauses || 0,
                total: clausesData?.totalSubclauses || 0,
              },
              annexes: {
                done: annexesData?.doneAnnexcategories || 0,
                total: annexesData?.totalAnnexcategories || 0,
              },
            });
          } catch {
            setIso42001Progress(null);
          }
        }

        // Custom frameworks progress - fetch from JIRA plugin's endpoint
        try {
          const customFwRes: any = await apiServices.get(
            `/extensions/jira-assets/projects/${project.id}/custom-frameworks-progress`,
          );
          const customFwData = customFwRes.data?.data || customFwRes.data || [];
          const customFwList = (Array.isArray(customFwData) ? customFwData : []).map(
            (fw: { name: string; completed: number; total: number }) => ({
              name: fw.name,
              progress: {
                done: fw.completed || 0,
                total: fw.total || 0,
              },
            }),
          );
          setCustomFrameworks(customFwList);
        } catch {
          // No custom frameworks or endpoint not available
          setCustomFrameworks([]);
        }
      } catch (err) {
        console.error("Error fetching framework progress:", err);
      }
    };

    fetchFrameworkProgress();
  }, [project?.id, projectFrameworkId, projectFrameworkId2]);

  if (!project) {
    return <Typography>No use case found</Typography>;
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Typography color="error">Error loading JIRA data: {error}</Typography>;
  }

  const attributes = jiraData?.attributes || {};

  // Get first 5 attributes dynamically
  const attributeEntries = Object.entries(attributes).slice(0, 5);

  const hasFrameworks = euAiActProgress || iso42001Progress || customFrameworks.length > 0;

  return (
    <Stack sx={{ width: "100%" }}>
      <Stack className="vw-project-overview" sx={{ width: "100%" }}>
        {/* JIRA Source Badge */}
        <Box sx={{ mb: 10 }}>
          <Chip
            icon={<Database size={14} />}
            label="Imported from JIRA Assets"
            size="small"
            sx={{
              "backgroundColor": "#E3F2FD",
              "color": "#1565C0",
              "& .MuiChip-icon": { color: "#1565C0" },
            }}
          />
        </Box>

        {/* First row - Use case info */}
        <Stack className="vw-project-overview-row" sx={rowStyle}>
          <InfoCard
            title="JIRA Object Key"
            body={jiraData?.objectKey || "-"}
            icon={<KeyIcon size={16} />}
          />
          <InfoCard
            title="Use case status"
            body={project.status || "Not started"}
            icon={<ActivityIcon size={16} />}
          />
          <InfoCard
            title="Sync Status"
            body={syncStatus.charAt(0).toUpperCase() + syncStatus.slice(1)}
            icon={<SyncIcon size={16} />}
          />
        </Stack>

        {/* Second row - dates */}
        <Stack className="vw-project-overview-row" sx={rowStyle}>
          <InfoCard
            title="Created in JIRA"
            body={formatDate(jiraData?.created)}
            icon={<CalendarIcon size={16} />}
          />
          <InfoCard
            title="Last Updated in JIRA"
            body={formatDate(jiraData?.updated)}
            icon={<ClockIcon size={16} />}
          />
          <InfoCard
            title="Object Type"
            body={jiraData?.objectType?.name || "-"}
            icon={<BoxIcon size={16} />}
          />
        </Stack>

        {/* Key Attributes Section - First 5 attributes */}
        {attributeEntries.length > 0 && (
          <Stack sx={{ mb: 10 }}>
            <Typography sx={projectRiskSection}>Key Attributes</Typography>
            <Stack className="vw-project-overview-row" sx={rowStyle}>
              {attributeEntries.map(([key, value]) => (
                <InfoCard key={key} title={key} body={formatValue(value)} />
              ))}
            </Stack>
          </Stack>
        )}

        {/* Framework Completion Status */}
        <Stack className="vw-project-overview-frameworks" sx={{ width: "100%", gap: 10, mb: 10 }}>
          {/* EU AI Act */}
          {euAiActProgress && (
            <Stack sx={columnStyle}>
              <Typography sx={projectRiskSection}>EU AI Act Completion Status</Typography>
              <GroupStatsCard
                title={["Subcontrols", "Assessments"]}
                completed={[euAiActProgress.subcontrols.done, euAiActProgress.assessments.done]}
                total={[euAiActProgress.subcontrols.total, euAiActProgress.assessments.total]}
              />
            </Stack>
          )}

          {/* ISO 42001 */}
          {iso42001Progress && (
            <Stack sx={columnStyle}>
              <Typography sx={projectRiskSection}>ISO 42001 Completion Status</Typography>
              <GroupStatsCard
                title={["Clauses", "Annexes"]}
                completed={[iso42001Progress.clauses.done, iso42001Progress.annexes.done]}
                total={[iso42001Progress.clauses.total, iso42001Progress.annexes.total]}
              />
            </Stack>
          )}

          {/* Custom Frameworks */}
          {customFrameworks.map((fw) => (
            <Stack key={fw.name} sx={columnStyle}>
              <Typography sx={projectRiskSection}>{fw.name} Completion Status</Typography>
              <GroupStatsCard
                title={["Progress"]}
                completed={[fw.progress.done]}
                total={[fw.progress.total]}
              />
            </Stack>
          ))}
        </Stack>

        <Divider />

        {/* Note if no frameworks assigned */}
        {!hasFrameworks && (
          <Stack sx={{ gap: 10, mt: 10 }}>
            <Typography sx={projectRiskSection}>Framework Completion Status</Typography>
            <Box
              sx={{
                ...infoCardStyle,
                minHeight: 80,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  color: "#8594AC",
                  textAlign: "center",
                }}
              >
                No frameworks assigned to this use case yet.
                <br />
                Assign frameworks in the Frameworks/regulations tab.
              </Typography>
            </Box>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export default JiraUseCaseOverview;
