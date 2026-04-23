import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TabContext from "@mui/lab/TabContext";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import { Tab } from "@mui/material";
import { Project } from "../../../../domain/types/Project";
import { Framework } from "../../../../domain/types/Framework";
import { getEntityById } from "../../../../application/repository/entity.repository";
import FrameworkProgressCard from "./FrameworkProgressCard";
import AssignmentStatusCard from "./AssignmentStatusCard";
import StatusBreakdownCard from "./StatusBreakdownCard";
import ControlCategoriesCard from "./ControlCategoriesCard";
import AnnexOverviewCard from "./AnnexOverviewCard";
import NISTFunctionsOverviewCard from "./NISTFunctionsOverviewCard";
import { PluginSlot } from "../../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../../domain/constants/pluginSlots";
import { usePluginRegistry } from "../../../../application/contexts/PluginRegistry.context";
import { brand } from "../../../themes/palette";

// localStorage keys for framework controls navigation
const FRAMEWORK_SELECTED_KEY = "verifywise_framework_selected";
const ISO27001_TAB_KEY = "verifywise_iso27001_tab";
const ISO42001_TAB_KEY = "verifywise_iso42001_tab";
const NIST_AI_RMF_TAB_KEY = "verifywise_nist_ai_rmf_tab";

interface DashboardProps {
  organizationalProject: Project;
  filteredFrameworks: Framework[];
}

interface FrameworkData {
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
  clauseProgress?: {
    totalSubclauses: number;
    doneSubclauses: number;
  };
  annexProgress?: {
    // ISO 27001 uses these fields
    totalAnnexControls?: number;
    doneAnnexControls?: number;
    // ISO 42001 uses these fields
    totalAnnexcategories?: number;
    doneAnnexcategories?: number;
  };
  // NIST AI RMF specific data
  nistProgress?: {
    totalSubcategories: number;
    doneSubcategories: number;
  };
  nistAssignments?: {
    totalSubcategories: number;
    assignedSubcategories: number;
  };
  nistAssignmentsByFunction?: {
    govern: { total: number; assigned: number };
    map: { total: number; assigned: number };
    measure: { total: number; assigned: number };
    manage: { total: number; assigned: number };
  };
  nistProgressByFunction?: {
    govern: { total: number; done: number };
    map: { total: number; done: number };
    measure: { total: number; done: number };
    manage: { total: number; done: number };
  };
  nistStatusBreakdown?: {
    notStarted: number;
    draft: number;
    inProgress: number;
    awaitingReview: number;
    awaitingApproval: number;
    implemented: number;
    needsRework: number;
  };
  assignmentStatus?: {
    assignedClauses: number;
    totalClauses: number;
    assignedAnnexes: number;
    totalAnnexes: number;
  };
  statusBreakdown?: {
    passing: number;
    failing: number;
    needsChanges: number;
    inReview: number;
    pending: number;
    inProgress: number;
  };
}

// Tab styles matching the existing Framework page design
const tabStyle = {
  textTransform: "none",
  fontWeight: 400,
  alignItems: "center",
  justifyContent: "flex-end",
  padding: "16px 0 7px",
  minHeight: "20px",
  minWidth: "auto",
  "&.Mui-selected": {
    color: `${brand.primary}`,
  },
};

const tabPanelStyle = {
  padding: 0,
};

const tabListStyle = {
  minHeight: "20px",
  "& .MuiTabs-flexContainer": {
    columnGap: "34px",
  },
};

const DASHBOARD_TAB_STORAGE_KEY = "verifywise_dashboard_active_tab";

const FrameworkDashboard = ({
  organizationalProject,
  filteredFrameworks,
}: DashboardProps) => {
  const navigate = useNavigate();
  const { getComponentsForSlot } = usePluginRegistry();
  const [loading, setLoading] = useState(true);
  const [frameworksData, setFrameworksData] = useState<FrameworkData[]>([]);
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem(DASHBOARD_TAB_STORAGE_KEY);
    return savedTab ? parseInt(savedTab, 10) : 0;
  });

  // Handle navigation from dashboard cards to controls page
  const handleNavigateToControls = (frameworkName: string, section: string) => {
    const isISO27001 = frameworkName.toLowerCase().includes("iso 27001");
    const isISO42001 = frameworkName.toLowerCase().includes("iso 42001");
    const isNISTAIRMF = frameworkName.toLowerCase().includes("nist ai rmf");

    // Determine framework index based on filtered frameworks
    let frameworkIndex = 0;
    if (isISO27001) {
      frameworkIndex = filteredFrameworks.findIndex(f => f.name.toLowerCase().includes("iso 27001"));
    } else if (isISO42001) {
      frameworkIndex = filteredFrameworks.findIndex(f => f.name.toLowerCase().includes("iso 42001"));
    } else if (isNISTAIRMF) {
      frameworkIndex = filteredFrameworks.findIndex(f => f.name.toLowerCase().includes("nist ai rmf"));
    }

    if (frameworkIndex === -1) frameworkIndex = 0;

    // Set localStorage for framework selection
    localStorage.setItem(FRAMEWORK_SELECTED_KEY, frameworkIndex.toString());

    // Set localStorage for sub-tab based on section
    if (isISO27001) {
      const tabValue = section === "annexes" ? "annex" : "clause";
      localStorage.setItem(ISO27001_TAB_KEY, tabValue);
    } else if (isISO42001) {
      const tabValue = section === "annexes" ? "annexes" : "clauses";
      localStorage.setItem(ISO42001_TAB_KEY, tabValue);
    } else if (isNISTAIRMF) {
      // For NIST AI RMF, section is one of: govern, map, measure, manage
      localStorage.setItem(NIST_AI_RMF_TAB_KEY, section);
    }

    // Navigate to controls page
    navigate("/framework/controls");
  };

  useEffect(() => {
    const abortController = new AbortController();

    const fetchFrameworkData = async () => {
      if (!organizationalProject || filteredFrameworks.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const dataPromises = filteredFrameworks.map(async (framework) => {
          // Get project framework ID
          const projectFramework = organizationalProject.framework?.find(
            (f) => f.framework_id === Number(framework.id)
          );
          const projectFrameworkId = projectFramework?.project_framework_id || framework.id;

          const isISO27001 = framework.name.toLowerCase().includes("iso 27001");
          const isISO42001 = framework.name.toLowerCase().includes("iso 42001");
          const isNISTAIRMF = framework.name.toLowerCase().includes("nist ai rmf");

          let clauseProgress, annexProgress, assignmentStatus, statusBreakdown;
          let nistProgress, nistProgressByFunction, nistAssignments, nistAssignmentsByFunction, nistStatusBreakdown;

          if (isNISTAIRMF) {
            // Fetch NIST AI RMF data
            try {
              const progressRes = await getEntityById({
                routeUrl: `/nist-ai-rmf/progress`,
              });
              if (progressRes?.data) {
                nistProgress = {
                  totalSubcategories: progressRes.data.totalSubcategories || 0,
                  doneSubcategories: progressRes.data.doneSubcategories || 0,
                };
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching NIST AI RMF progress:`, error);
              }
              nistProgress = { totalSubcategories: 0, doneSubcategories: 0 };
            }

            try {
              const progressByFunctionRes = await getEntityById({
                routeUrl: `/nist-ai-rmf/progress-by-function`,
              });
              if (progressByFunctionRes?.data) {
                nistProgressByFunction = progressByFunctionRes.data;
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching NIST AI RMF progress by function:`, error);
              }
            }

            try {
              const assignmentsRes = await getEntityById({
                routeUrl: `/nist-ai-rmf/assignments`,
              });
              if (assignmentsRes?.data) {
                nistAssignments = {
                  totalSubcategories: assignmentsRes.data.totalSubcategories || 0,
                  assignedSubcategories: assignmentsRes.data.assignedSubcategories || 0,
                };
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching NIST AI RMF assignments:`, error);
              }
              nistAssignments = { totalSubcategories: 0, assignedSubcategories: 0 };
            }

            try {
              const assignmentsByFunctionRes = await getEntityById({
                routeUrl: `/nist-ai-rmf/assignments-by-function`,
              });
              if (assignmentsByFunctionRes?.data) {
                nistAssignmentsByFunction = assignmentsByFunctionRes.data;
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching NIST AI RMF assignments by function:`, error);
              }
            }

            try {
              const statusRes = await getEntityById({
                routeUrl: `/nist-ai-rmf/status-breakdown`,
              });
              if (statusRes?.data) {
                nistStatusBreakdown = {
                  notStarted: statusRes.data.notStarted || 0,
                  draft: statusRes.data.draft || 0,
                  inProgress: statusRes.data.inProgress || 0,
                  awaitingReview: statusRes.data.awaitingReview || 0,
                  awaitingApproval: statusRes.data.awaitingApproval || 0,
                  implemented: statusRes.data.implemented || 0,
                  needsRework: statusRes.data.needsRework || 0,
                };
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching NIST AI RMF status breakdown:`, error);
              }
            }
          } else if (isISO27001) {
            // Fetch ISO 27001 data
            try {
              const clauseProgressRes = await getEntityById({
                routeUrl: `/iso-27001/clauses/progress/${projectFrameworkId}`,
              });

              // Validate response structure and provide fallback data
              if (clauseProgressRes?.data) {
                clauseProgress = {
                  totalSubclauses: clauseProgressRes.data.totalSubclauses || 0,
                  doneSubclauses: clauseProgressRes.data.doneSubclauses || 0,
                };
              } else {
                console.warn(`Invalid clause progress response structure for ISO 27001 framework ${framework.id}`);
                clauseProgress = { totalSubclauses: 0, doneSubclauses: 0 };
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching ISO 27001 clause progress for framework ${framework.id}:`, {
                  error: error instanceof Error ? error.message : error,
                  projectFrameworkId,
                  frameworkName: framework.name,
                });
              }
              clauseProgress = { totalSubclauses: 0, doneSubclauses: 0 };
            }

            try {
              const annexProgressRes = await getEntityById({
                routeUrl: `/iso-27001/annexes/progress/${projectFrameworkId}`,
              });

              // Validate response structure and provide fallback data
              if (annexProgressRes?.data) {
                annexProgress = {
                  totalAnnexControls: annexProgressRes.data.totalAnnexControls || 0,
                  doneAnnexControls: annexProgressRes.data.doneAnnexControls || 0,
                };
              } else {
                console.warn(`Invalid annex progress response structure for ISO 27001 framework ${framework.id}`);
                annexProgress = { totalAnnexControls: 0, doneAnnexControls: 0 };
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching ISO 27001 annex progress for framework ${framework.id}:`, {
                  error: error instanceof Error ? error.message : error,
                  projectFrameworkId,
                  frameworkName: framework.name,
                });
              }
              annexProgress = { totalAnnexControls: 0, doneAnnexControls: 0 };
            }
          } else if (isISO42001) {
            // Fetch ISO 42001 data
            try {
              const clauseProgressRes = await getEntityById({
                routeUrl: `/iso-42001/clauses/progress/${projectFrameworkId}`,
              });

              // Validate response structure and provide fallback data
              if (clauseProgressRes?.data) {
                clauseProgress = {
                  totalSubclauses: clauseProgressRes.data.totalSubclauses || 0,
                  doneSubclauses: clauseProgressRes.data.doneSubclauses || 0,
                };
              } else {
                console.warn(`Invalid clause progress response structure for ISO 42001 framework ${framework.id}`);
                clauseProgress = { totalSubclauses: 0, doneSubclauses: 0 };
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching ISO 42001 clause progress for framework ${framework.id}:`, {
                  error: error instanceof Error ? error.message : error,
                  projectFrameworkId,
                  frameworkName: framework.name,
                });
              }
              clauseProgress = { totalSubclauses: 0, doneSubclauses: 0 };
            }

            try {
              const annexProgressRes = await getEntityById({
                routeUrl: `/iso-42001/annexes/progress/${projectFrameworkId}`,
              });

              // Validate response structure and provide fallback data
              if (annexProgressRes?.data) {
                annexProgress = {
                  totalAnnexcategories: annexProgressRes.data.totalAnnexcategories || 0,
                  doneAnnexcategories: annexProgressRes.data.doneAnnexcategories || 0,
                };
              } else {
                console.warn(`Invalid annex progress response structure for ISO 42001 framework ${framework.id}`);
                annexProgress = { totalAnnexcategories: 0, doneAnnexcategories: 0 };
              }
            } catch (error) {
              if (!abortController.signal.aborted) {
                console.error(`Error fetching ISO 42001 annex progress for framework ${framework.id}:`, {
                  error: error instanceof Error ? error.message : error,
                  projectFrameworkId,
                  frameworkName: framework.name,
                });
              }
              annexProgress = { totalAnnexcategories: 0, doneAnnexcategories: 0 };
            }
          }

          return {
            frameworkId: Number(framework.id),
            frameworkName: framework.name,
            projectFrameworkId: Number(projectFrameworkId),
            clauseProgress,
            annexProgress,
            nistProgress,
            nistProgressByFunction,
            nistAssignments,
            nistAssignmentsByFunction,
            nistStatusBreakdown,
            assignmentStatus,
            statusBreakdown,
          };
        });

        const data = await Promise.all(dataPromises);
        setFrameworksData(data);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Error fetching framework data:", error);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchFrameworkData();

    return () => {
      abortController.abort();
    };
  }, [organizationalProject, filteredFrameworks]);

  // Memoize filtered framework data to prevent unnecessary re-renders in child components
  // These must be called before any early returns to follow React's Rules of Hooks
  const iso42001FrameworksData = useMemo(
    () => frameworksData.filter(f => f.frameworkName.toLowerCase().includes("iso 42001")),
    [frameworksData]
  );
  const iso27001FrameworksData = useMemo(
    () => frameworksData.filter(f => f.frameworkName.toLowerCase().includes("iso 27001")),
    [frameworksData]
  );
  const nistAiRmfFrameworksData = useMemo(
    () => frameworksData.filter(f => f.frameworkName.toLowerCase().includes("nist ai rmf")),
    [frameworksData]
  );

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "400px",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Check if plugin provides custom framework dashboard
  const hasCustomFrameworkDashboard = getComponentsForSlot(PLUGIN_SLOTS.FRAMEWORK_DASHBOARD_CUSTOM).length > 0;

  if (frameworksData.length === 0) {
    // If plugin provides custom framework dashboard, render it
    if (hasCustomFrameworkDashboard) {
      return (
        <PluginSlot
          id={PLUGIN_SLOTS.FRAMEWORK_DASHBOARD_CUSTOM}
          slotProps={{
            project: organizationalProject,
            onNavigate: () => navigate("/framework/controls"),
          }}
        />
      );
    }

    return (
      <Box
        sx={{
          textAlign: "center",
          py: 8,
          backgroundColor: "background.accent",
          borderRadius: 2,
          border: "1px solid #d0d5dd",
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No frameworks enabled for this organization.
        </Typography>
      </Box>
    );
  }

  // Determine which frameworks are available
  const hasISO27001 = frameworksData.some(f => f.frameworkName.toLowerCase().includes("iso 27001"));
  const hasISO42001 = frameworksData.some(f => f.frameworkName.toLowerCase().includes("iso 42001"));
  const hasNISTAIRMF = frameworksData.some(f => f.frameworkName.toLowerCase().includes("nist ai rmf"));

  // Create tabs array with ISO 42001 first, then NIST AI RMF, then ISO 27001
  const tabs: { id: string; label: string }[] = [];
  if (hasISO42001) tabs.push({ id: 'iso42001', label: 'ISO 42001' });
  if (hasNISTAIRMF) tabs.push({ id: 'nist-ai-rmf', label: 'NIST AI RMF' });
  if (hasISO27001) tabs.push({ id: 'iso27001', label: 'ISO 27001' });

  // Handle tab change
  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    const newIndex = tabs.findIndex(tab => tab.id === newValue);
    setActiveTab(newIndex);
    localStorage.setItem(DASHBOARD_TAB_STORAGE_KEY, newIndex.toString());
  };

  return (
    <Stack spacing={0}>
      {/* System Frameworks Section Header - only show if custom frameworks also exist */}
      {hasCustomFrameworkDashboard && (
        <Box
          sx={{
            mb: 3,
            pb: 2,
            borderBottom: "2px solid brand.primary",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 600,
              color: "#101828",
            }}
          >
            System Frameworks
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              color: "text.icon",
              ml: 1,
            }}
          >
            ISO 42001, ISO 27001, NIST AI RMF
          </Typography>
        </Box>
      )}

      {/* Framework Progress, Assignment Status, and Status Breakdown in a row */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(3, 1fr)",
          },
          gap: "16px",
        }}
      >
        <FrameworkProgressCard frameworksData={frameworksData} />
        <AssignmentStatusCard frameworksData={frameworksData} />
        <StatusBreakdownCard frameworksData={frameworksData} />
      </Box>

      {/* Spacer to add extra gap */}
      <Box sx={{ height: "16px" }} />

      {/* Tab Bar - only show if we have frameworks */}
      {tabs.length > 0 && (
        <TabContext value={tabs[activeTab]?.id || tabs[0]?.id}>
          <Box>
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
              <TabList
                onChange={handleTabChange}
                TabIndicatorProps={{ style: { backgroundColor: "brand.primary" } }}
                sx={tabListStyle}
              >
                {tabs.map(tab => (
                  <Tab
                    key={tab.id}
                    label={tab.label}
                    value={tab.id}
                    sx={tabStyle}
                    disableRipple
                  />
                ))}
              </TabList>
            </Box>
            {/* 16px spacing after tab bar */}
            <Box sx={{ height: "16px" }} />
          </Box>

          {/* Tab Panels */}
          <TabPanel value="iso42001" sx={tabPanelStyle}>
            <Stack spacing={0}>
              {/* ISO 42001 Clauses Overview */}
              <ControlCategoriesCard
                frameworksData={iso42001FrameworksData}
                onNavigate={handleNavigateToControls}
              />

              {/* 16px spacing before annexes */}
              <Box sx={{ height: "16px" }} />

              {/* ISO 42001 Annexes Overview */}
              <AnnexOverviewCard
                frameworksData={iso42001FrameworksData}
                onNavigate={handleNavigateToControls}
              />
            </Stack>
          </TabPanel>

          <TabPanel value="nist-ai-rmf" sx={tabPanelStyle}>
            <NISTFunctionsOverviewCard
              frameworksData={nistAiRmfFrameworksData}
              onNavigate={handleNavigateToControls}
            />
          </TabPanel>

          <TabPanel value="iso27001" sx={tabPanelStyle}>
            <Stack spacing={0}>
              {/* ISO 27001 Clauses Overview */}
              <ControlCategoriesCard
                frameworksData={iso27001FrameworksData}
                onNavigate={handleNavigateToControls}
              />

              {/* 16px spacing before annexes */}
              <Box sx={{ height: "16px" }} />

              {/* ISO 27001 Annexes Overview */}
              <AnnexOverviewCard
                frameworksData={iso27001FrameworksData}
                onNavigate={handleNavigateToControls}
              />
            </Stack>
          </TabPanel>
        </TabContext>
      )}

      {/* Fallback when no frameworks */}
      {!hasISO27001 && !hasISO42001 && !hasNISTAIRMF && (
        <ControlCategoriesCard frameworksData={frameworksData} onNavigate={handleNavigateToControls} />
      )}

      {/* Custom Framework Dashboard - Plugin Slot */}
      {/* Header is rendered inside the plugin component, so it only shows when there are custom frameworks */}
      {hasCustomFrameworkDashboard && (
        <PluginSlot
          id={PLUGIN_SLOTS.FRAMEWORK_DASHBOARD_CUSTOM}
          slotProps={{
            project: organizationalProject,
            onNavigate: () => navigate("/framework/controls"),
          }}
        />
      )}
    </Stack>
  );
};

export default FrameworkDashboard;
