import { Box, Button, Stack, Tab, Typography, useTheme } from "@mui/material";
import { LayoutDashboard, AlertTriangle, Settings, History, ClipboardCheck, FolderOpen, PlusCircle, Shield, FileText } from "lucide-react";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";
import React, { useEffect } from "react";
import TabContext from "@mui/lab/TabContext";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import Overview from "./Overview";
import RisksView from "./RisksView";
import ProjectSettings from "./ProjectSettings";
import Activity from "./Activity";
import PostMarketMonitoring from "./PostMarketMonitoring";
import PageTour from "../../components/PageTour";
import ProjectViewSteps from "./ProjectViewSteps";
import { EmptyState } from "../../components/EmptyState";
import useProjectRisks from "../../../application/hooks/useProjectRisks";
import useVendorRisks from "../../../application/hooks/useVendorRisks";
import { useSearchParams } from "react-router-dom";
import useProjectData from "../../../application/hooks/useProjectData";
import { getProjectById } from "../../../application/repository/project.repository";
import { createTabLabelWithCount } from "../../utils/tabUtils";
import {
  tabStyle,
  noProjectContainerStyle,
  newProjectButtonStyle,
  projectTitleStyle,
  projectDescriptionStyle,
  tabContainerStyle,
  tabListContainerStyle,
  tabListStyle,
} from "./styles";
import { brand } from "../../themes/palette";

const ProjectView = () => {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "1";

  const { project, setProject } = useProjectData({ projectId });
  const {
    projectRisks,
    loadingProjectRisks,
    error: errorFetchingProjectRisks,
    projectRisksSummary,
  } = useProjectRisks({ projectId: parseInt(projectId) });
  const {
    error: errorFetchingVendorRisks,
    // vendorRisks,
    // vendorRisksSummary,
  } = useVendorRisks({ projectId });

  const theme = useTheme();
  const disableRipple =
    theme.components?.MuiButton?.defaultProps?.disableRipple;

  const [value, setValue] = React.useState("overview");
  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  };

  const noProject =
    !project ||
    project.project_title === "No Project found" ||
    Object.keys(project).length === 0;

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const project = await getProjectById({
          id: projectId,
        });
        setProject(project);
      } catch (error) {
        console.error("Error fetching project:", error);
      }
    };
    fetchProject();
  }, [projectId, setProject]);

  if (loadingProjectRisks) {
    return <Typography>Loading project risks...</Typography>;
  }
  if (errorFetchingProjectRisks) {
    return (
      <Typography>
        Error fetching project risks. {errorFetchingProjectRisks}
      </Typography>
    );
  }
  if (errorFetchingVendorRisks) {
    return (
      <Typography>
        Error fetching vendor risks. {errorFetchingVendorRisks}
      </Typography>
    );
  }

  return (
    <Stack>
      <PageBreadcrumbs showDivider={false} />
      {noProject ? (
        //no project found template
        <Box sx={noProjectContainerStyle}>
          <EmptyState icon={FolderOpen} message="No projects found. Create a new project to start with.">
            <EmptyStateTip
              icon={PlusCircle}
              title="Create your first project"
              description="A project represents an AI system or use case you're governing. Click 'New project' to set one up with a name, description, and framework."
            />
            <EmptyStateTip
              icon={Shield}
              title="Assign a framework"
              description="Each project can be linked to one or more compliance frameworks (EU AI Act, ISO 42001, etc.) to track controls and assessments."
            />
            <EmptyStateTip
              icon={FileText}
              title="What goes in a project?"
              description="Risks, policies, evidence, model inventory, vendors, and training records. Everything needed for a complete governance audit trail."
            />
          </EmptyState>
          {/* new project button */}
          <Button
            variant="contained"
            color="primary"
            onClick={() => {}}
            sx={newProjectButtonStyle}
          >
            New Project
          </Button>
        </Box>
      ) : (
        <Stack>
          <Typography sx={projectTitleStyle}>
            {project.project_title} project overview
          </Typography>
          <Typography sx={projectDescriptionStyle}>
            This page includes the governance process status of{" "}
            <span style={{ color: `${brand.primary}` }}>{project.project_title}</span>
          </Typography>
          <Stack sx={tabContainerStyle}>
            <TabContext value={value}>
              <Box sx={tabListContainerStyle} data-joyride-id="project-tabs">
                <TabList
                  onChange={handleChange}
                  aria-label="project view tabs"
                  sx={tabListStyle}
                >
                  <Tab
                    label={createTabLabelWithCount({
                      label: "Overview",
                      icon: <LayoutDashboard size={14} />,
                    })}
                    value="overview"
                    sx={tabStyle}
                    disableRipple={disableRipple}
                  />
                  <Tab
                    label={createTabLabelWithCount({
                      label: "Use case risks",
                      icon: <AlertTriangle size={14} />,
                    })}
                    value="project-risks"
                    sx={tabStyle}
                    disableRipple={disableRipple}
                  />
                  <Tab
                    label={createTabLabelWithCount({
                      label: "Settings",
                      icon: <Settings size={14} />,
                    })}
                    value="settings"
                    sx={tabStyle}
                    disableRipple={disableRipple}
                  />
                  <Tab
                    label={createTabLabelWithCount({
                      label: "Activity",
                      icon: <History size={14} />,
                    })}
                    value="activity"
                    sx={tabStyle}
                    disableRipple={disableRipple}
                  />
                  <Tab
                    label={createTabLabelWithCount({
                      label: "Monitoring",
                      icon: <ClipboardCheck size={14} />,
                    })}
                    value="monitoring"
                    sx={tabStyle}
                    disableRipple={disableRipple}
                  />
                </TabList>
              </Box>
              {/* overview panel */}
              <TabPanel value="overview" sx={{ p: "32px 0 0" }}>
                <Overview projectRisksSummary={projectRisksSummary} />
              </TabPanel>
              <TabPanel value="project-risks" sx={{ p: "32px 0 0" }}>
                <RisksView
                  risksSummary={projectRisksSummary}
                  risksData={projectRisks}
                  title="Project"
                  projectId={projectId}
                />
              </TabPanel>
              {/* <TabPanel value="vendor-risks" sx={{ p: "32px 0 0" }}>
                <RisksView
                  risksSummary={vendorRisksSummary}
                  risksData={vendorRisks}
                  title="Vendor"
                  projectId={projectId}
                />
              </TabPanel> */}
              <TabPanel value="settings" sx={{ p: "32px 0 0" }}>
                <ProjectSettings />
              </TabPanel>
              <TabPanel value="activity" sx={{ p: "32px 0 0" }}>
                <Activity entityType="use_case" entityId={parseInt(projectId)} />
              </TabPanel>
              <TabPanel value="monitoring" sx={{ p: "32px 0 0" }}>
                <PostMarketMonitoring />
              </TabPanel>
            </TabContext>
          </Stack>
        </Stack>
      )}

      {/* Page Tour */}
      <PageTour steps={ProjectViewSteps} run={true} tourKey="project-view-tour" />
    </Stack>
  );
};

export default ProjectView;
