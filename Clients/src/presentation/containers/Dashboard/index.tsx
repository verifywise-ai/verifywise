import { Stack, Typography, Box } from "@mui/material";
import "./index.css";
import { Outlet, useLocation } from "react-router";
import { useContext, useEffect, FC, useState } from "react";
import { useDispatch } from "react-redux";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import { EvalsSidebarProvider } from "../../../application/contexts/EvalsSidebar.context";
import { AIDetectionSidebarProvider } from "../../../application/contexts/AIDetectionSidebar.context";
import { ShadowAISidebarProvider } from "../../../application/contexts/ShadowAISidebar.context";
import { AIGatewaySidebarProvider } from "../../../application/contexts/AIGatewaySidebar.context";
import DemoAppBanner from "../../components/DemoBanner/DemoAppBanner";
import { getAllProjects } from "../../../application/repository/project.repository";
import {
  postAutoDrivers,
  deleteAutoDrivers,
} from "../../../application/repository/entity.repository";
import { logEngine } from "../../../application/tools/log.engine";
import StandardModal from "../../components/Modals/StandardModal";
import CustomizableToast from "../../components/Toast";
import Alert from "../../components/Alert";
import { AlertState } from "../../../application/interfaces/appStates";
import { useDashboard } from "../../../application/hooks/useDashboard";
import { useActiveModule } from "../../../application/hooks/useActiveModule";
import AppSwitcher from "../../components/AppSwitcher";
import { ContextSidebar } from "../../components/ContextSidebar";
import { useAuth } from "../../../application/hooks/useAuth";
import ReadOnlyBanner from "../../components/ReadOnlyBanner";
import { setActiveOrganizationId } from "../../../application/redux/auth/authSlice";
import { getOrganizations } from "../../../application/repository/superAdmin.repository";
import { status } from "../../themes/palette";

interface DashboardProps {
  reloadTrigger: boolean;
}

const Dashboard: FC<DashboardProps> = ({ reloadTrigger }) => {
  const { setDashboardValues, setProjects } = useContext(VerifyWiseContext);
  const location = useLocation();
  const { activeModule, setActiveModule } = useActiveModule();
  const { userRoleName, isSuperAdmin, activeOrganizationId } = useAuth();
  const isAdmin = userRoleName === "Admin";
  const dispatch = useDispatch();
  const [, setSuperAdminHasNoOrgs] = useState(false);

  // Demo data state
  const [showToastNotification, setShowToastNotification] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>(
    "Generating demo data. Please wait, this process may take some time...",
  );
  const [openDemoDataModal, setOpenDemoDataModal] = useState<boolean>(false);
  const [openDeleteDemoDataModal, setOpenDeleteDemoDataModal] = useState<boolean>(false);
  const [hasDemoData, setHasDemoData] = useState<boolean>(false);
  const [showDemoDataButton, setShowDemoDataButton] = useState<boolean>(() => {
    // Check localStorage on initial load
    return localStorage.getItem("hideDemoDataButton") !== "true";
  });
  const [alertState, setAlertState] = useState<AlertState>();
  const [refreshProjectsFlag, setRefreshProjectsFlag] = useState<boolean>(false);

  const { dashboard, fetchDashboard } = useDashboard();

  // Auto-select first org for super-admin, or redirect if active org was deleted
  useEffect(() => {
    if (!isSuperAdmin) return;
    getOrganizations()
      .then((res) => {
        const orgsData = (res.data as any)?.data || [];
        if (orgsData.length === 0) {
          // No orgs exist — clear active org and show overlay
          dispatch(setActiveOrganizationId(null));
          setSuperAdminHasNoOrgs(true);
          return;
        }
        setSuperAdminHasNoOrgs(false);
        if (!activeOrganizationId || !orgsData.find((o: any) => o.id === activeOrganizationId)) {
          // No org selected or active org was deleted — pick the first available one and reload
          dispatch(setActiveOrganizationId(orgsData[0].id));
          // Small delay so Redux persist writes before reload
          setTimeout(() => window.location.reload(), 100);
        }
      })
      .catch(console.error);
  }, [isSuperAdmin, activeOrganizationId, dispatch]);

  // Check for demo data existence
  useEffect(() => {
    if (dashboard?.projects_list) {
      const demoProjectTitles = [
        "AI Recruitment Screening Platform",
        // Legacy demo project names for backwards compatibility
        "AI Compliance Checker",
        "Information Security & AI Governance Framework",
      ];
      const hasDemoProjects = dashboard.projects_list.some((project) =>
        demoProjectTitles.includes(project.project_title),
      );
      setHasDemoData(hasDemoProjects);
    }
  }, [dashboard, refreshProjectsFlag]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await getAllProjects();
        if (!response?.data) return;
        setProjects(response.data);
        setDashboardValues((prevValues: any) => ({
          ...prevValues,
          projects: response.data,
          selectedProjectId: response.data[0]?.id || "", // Set the first project ID as the default selected one
        }));
      } catch (error) {
        console.error("Error fetching projects:", error);
      }
    };

    fetchProjects();
  }, [setDashboardValues, reloadTrigger, location.pathname, refreshProjectsFlag]);

  // Handle create demo data
  const handleCreateDemoData = async () => {
    setOpenDemoDataModal(false);
    setToastMessage("Generating demo data. Please wait, this process may take some time...");
    setShowToastNotification(true);

    const startTime = Date.now();
    const minDisplayTime = 3500;

    try {
      const response = await postAutoDrivers();

      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime));
      }

      if (response.status === 200 || response.status === 201) {
        logEngine({
          type: "info",
          message: "Demo data generated successfully.",
        });

        // Refresh dashboard and projects data
        await Promise.all([
          fetchDashboard(),
          getAllProjects().then((projectsResponse) => {
            if (projectsResponse?.data) {
              setProjects(projectsResponse.data);
              setDashboardValues((prevValues: any) => ({
                ...prevValues,
                projects: projectsResponse.data,
                selectedProjectId: projectsResponse.data[0]?.id || "",
              }));
            }
          }),
        ]);

        // Force refresh projects flag to trigger updates in child components
        setRefreshProjectsFlag((prev) => !prev);

        // Update hasDemoData state immediately
        setHasDemoData(true);

        setShowToastNotification(false);

        // Reload the page to refresh all dashboard metrics
        window.location.reload();
      } else {
        setShowToastNotification(false);
        logEngine({
          type: "error",
          message: "Failed to generate demo data.",
        });
        setAlertState({
          variant: "error",
          body: "Failed to generate demo data.",
        });
        setTimeout(() => {
          setAlertState(undefined);
        }, 3000);
      }
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime));
      }

      setShowToastNotification(false);
      const errorMessage = (error as Error).message;
      logEngine({
        type: "error",
        message: `An error occurred: ${errorMessage}`,
      });
      setAlertState({
        variant: "error",
        body: `An error occurred: ${errorMessage}`,
      });
      setTimeout(() => {
        setAlertState(undefined);
      }, 3000);
    }
  };

  // Handle delete demo data
  const handleDeleteDemoData = async () => {
    setOpenDeleteDemoDataModal(false);
    setToastMessage("Deleting demo data. Please wait...");
    setShowToastNotification(true);

    const startTime = Date.now();
    const minDisplayTime = 3500;

    try {
      const response = await deleteAutoDrivers();

      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime));
      }

      if (response.status === 200 || response.status === 204) {
        logEngine({
          type: "info",
          message: "Demo data deleted successfully.",
        });

        // Refresh dashboard and projects data
        await Promise.all([
          fetchDashboard(),
          getAllProjects().then((projectsResponse) => {
            if (projectsResponse?.data) {
              setProjects(projectsResponse.data);
              setDashboardValues((prevValues: any) => ({
                ...prevValues,
                projects: projectsResponse.data,
                selectedProjectId: projectsResponse.data[0]?.id || "",
              }));
            }
          }),
        ]);

        // Force refresh projects flag to trigger updates in child components
        setRefreshProjectsFlag((prev) => !prev);

        // Update hasDemoData state immediately
        setHasDemoData(false);

        setShowToastNotification(false);

        // Navigate to overview to avoid 404s on deleted entity pages
        window.location.href = "/overview";
      } else {
        setShowToastNotification(false);
        logEngine({
          type: "error",
          message: "Failed to delete demo data.",
        });
        setAlertState({
          variant: "error",
          body: "Failed to delete demo data.",
        });
        setTimeout(() => {
          setAlertState(undefined);
        }, 3000);
      }
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime));
      }

      setShowToastNotification(false);
      const errorMessage = (error as Error).message;
      logEngine({
        type: "error",
        message: `An error occurred: ${errorMessage}`,
      });
      setAlertState({
        variant: "error",
        body: `An error occurred: ${errorMessage}`,
      });
      setTimeout(() => {
        setAlertState(undefined);
      }, 3000);
    }
  };

  return (
    <EvalsSidebarProvider>
      <AIDetectionSidebarProvider>
        <ShadowAISidebarProvider>
          <AIGatewaySidebarProvider>
            <Stack
              maxWidth="100%"
              className="home-layout"
              flexDirection="row"
              gap={0}
              sx={{ backgroundColor: "#FCFCFD", height: "100vh", overflow: "hidden" }}
            >
              <AppSwitcher
                activeModule={activeModule}
                onModuleChange={setActiveModule}
                isSuperAdmin={isSuperAdmin}
              />
              <ContextSidebar
                activeModule={activeModule}
                onOpenCreateDemoData={() => setOpenDemoDataModal(true)}
                onOpenDeleteDemoData={() => setOpenDeleteDemoDataModal(true)}
                onDismissDemoDataButton={() => {
                  localStorage.setItem("hideDemoDataButton", "true");
                  setShowDemoDataButton(false);
                }}
                showDemoDataButton={showDemoDataButton}
                hasDemoData={hasDemoData}
                isAdmin={isAdmin}
              />
              <Stack
                className="main-content-area"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  height: "100vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <ReadOnlyBanner />
                <>
                  <DemoAppBanner />
                  {alertState && (
                    <Alert
                      variant={alertState.variant}
                      title={alertState.title}
                      body={alertState.body}
                      isToast={true}
                      onClick={() => setAlertState(undefined)}
                    />
                  )}
                  {showToastNotification && <CustomizableToast title={toastMessage} />}
                  <Box
                    className="scrollable-content"
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      overflowX: "hidden",
                      padding: "24px 8px 24px 24px",
                    }}
                  >
                    <Outlet />
                  </Box>
                </>
              </Stack>

              {/* Demo Data Modals */}
              <StandardModal
                isOpen={openDemoDataModal}
                onClose={() => setOpenDemoDataModal(false)}
                title="Create demo data"
                description="Generate sample data to explore VerifyWise features"
                submitButtonText="Create demo data"
                onSubmit={handleCreateDemoData}
                isSubmitting={showToastNotification}
                maxWidth="480px"
              >
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  This will generate sample projects, risks, vendors, and policies to help you
                  explore VerifyWise. You can remove this demo data at any time.
                </Typography>
              </StandardModal>

              <StandardModal
                isOpen={openDeleteDemoDataModal}
                onClose={() => setOpenDeleteDemoDataModal(false)}
                title="Delete demo data"
                description="Remove all demo data from your workspace"
                submitButtonText="Delete demo data"
                onSubmit={handleDeleteDemoData}
                isSubmitting={showToastNotification}
                submitButtonColor={status.error.text}
                maxWidth="480px"
              >
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  This will remove all sample projects, risks, vendors, and policies that were
                  generated as demo data. Your real data will remain untouched.
                </Typography>
              </StandardModal>
            </Stack>
          </AIGatewaySidebarProvider>
        </ShadowAISidebarProvider>
      </AIDetectionSidebarProvider>
    </EvalsSidebarProvider>
  );
};

export default Dashboard;
