import { Routes } from "react-router-dom";
import "./App.css";
import { ThemeProvider } from "@emotion/react";
import light from "./presentation/themes/light";
import { CssBaseline } from "@mui/material";
import { VerifyWiseContext } from "./application/contexts/VerifyWise.context";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "./application/redux/store";
import { useAuth } from "./application/hooks/useAuth";
import { Project } from "./domain/types/Project";
import { CookiesProvider } from "react-cookie";
import { createRoutes } from "./application/config/routes";
import { DashboardState, UIValues, AuthValues, InputValues } from "./application/interfaces/appStates";
import { ComponentVisible } from "./application/interfaces/ComponentVisible";
import { AlertProps } from "./presentation/types/alert.types";
import { setShowAlertCallback } from "./infrastructure/api/customAxios";
import Alert from "./presentation/components/Alert";
import useUsers from "./application/hooks/useUsers";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useLocation, useNavigate } from "react-router-dom";
import { DeploymentManager, clearChunkReloadFlag } from "./application/utils/deploymentHelpers";
import UpdateBanner from "./presentation/components/UpdateBanner";
import ChunkErrorBoundary from "./presentation/components/ChunkErrorBoundary";
import { CommandPalette } from "./presentation/components/CommandPalette";
import CommandPaletteErrorBoundary from "./presentation/components/CommandPalette/ErrorBoundary";
import useCommandPalette from "./application/hooks/useCommandPalette";
import useUserPreferences from "./application/hooks/useUserPreferences";
import { SetupModal, useOnboarding } from "./presentation/components/Onboarding";
import { SidebarWrapper, UserGuideSidebarProvider, useUserGuideSidebarContext } from "./presentation/components/UserGuide";
import { AdvisorConversationProvider } from './application/contexts/AdvisorConversation.context';
import { PluginRegistryProvider } from './application/contexts/PluginRegistry.context';
import PluginLoader from './presentation/components/PluginLoader';
// SSE notifications disabled for now - can be re-enabled later if needed
// import { useNotifications } from "./application/hooks/useNotifications";

// Auth routes where the helper sidebar should not be shown
const AUTH_ROUTES = [
  '/login',
  '/admin-reg',
  '/user-reg',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/set-new-password',
  '/reset-password-continue',
];

// Public route patterns where the sidebar should not be shown
const PUBLIC_ROUTE_PATTERNS = [
  /\/use-case-form-intake/,   // Public intake forms (new & legacy)
  /^\/intake\//,              // Legacy intake form routes
  /^\/shared\//,              // Share link views
  /\/aiTrustCentre\//,        // Public AI Trust Centre
];

// Component for User Guide Sidebar that uses the context
const UserGuideSidebarContainer = () => {
  const location = useLocation();
  const userGuideSidebar = useUserGuideSidebarContext();

  // Don't show the helper sidebar on auth or public pages
  const isAuthPage = AUTH_ROUTES.some(route => location.pathname === route);
  const isPublicPage = PUBLIC_ROUTE_PATTERNS.some(pattern => pattern.test(location.pathname));
  if (isAuthPage || isPublicPage) {
    return null;
  }

  return (
    <SidebarWrapper
      isOpen={userGuideSidebar.isOpen}
      onClose={userGuideSidebar.close}
      onOpen={userGuideSidebar.open}
      initialPath={userGuideSidebar.currentPath}
    />
  );
};

// Component to conditionally apply theme based on route
const ConditionalThemeWrapper = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isAITrustCentreRoute = location.pathname.includes('/aiTrustCentre');

  // For aiTrustCentre routes, don't apply theme (like /public route)
  if (isAITrustCentreRoute) {
    return (
      <>
        <CssBaseline />
        {children}
      </>
    );
  }

  // For other routes, apply light theme
  return (
    <ThemeProvider theme={light}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, userRoleName, organizationId, userId } = useAuth();
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const { users, refreshUsers } = useUsers();
  const {userPreferences} = useUserPreferences();
  const commandPalette = useCommandPalette();
  const { completeOnboarding, state, isLoading: isOnboardingLoading } = useOnboarding();

  // SSE notifications disabled for now - can be re-enabled later if needed
  // useNotifications({
  //   enabled: !!token, // Only enable notifications when user is authenticated
  //   autoReconnect: true,
  //   reconnectDelay: 3000,
  // });

  // Onboarding should show on dashboard (/) or start-here page
  const isOnboardingRoute = location.pathname === '/' || location.pathname === '/start-here';

  // Derive modal visibility from onboarding state and current route
  // Only show modal if:
  // 1. User is authenticated (has token and userId)
  // 2. Onboarding state is loaded (not loading)
  // 3. Onboarding is not complete (first login)
  // 4. Currently on dashboard or start-here route
  const showModal = useMemo(
    () => token && userId && !isOnboardingLoading && !state.isComplete && isOnboardingRoute,
    [token, userId, isOnboardingLoading, state.isComplete, isOnboardingRoute]
  );

  const handleOnboardingDone = useCallback(() => {
    completeOnboarding();
    navigate("/start-here");
  }, [completeOnboarding, navigate]);

  useEffect(() => {
    setShowAlertCallback((alertProps: AlertProps) => {
      setAlert(alertProps);
      setTimeout(() => setAlert(null), 5000);
    });

    // App loaded successfully — clear the chunk reload guard so future
    // chunk errors can trigger a reload again
    clearChunkReloadFlag();

    // Poll backend for version updates
    DeploymentManager.startPolling();
    const unsubscribe = DeploymentManager.onUpdate(() => setShowUpdateBanner(true));

    return () => {
      setShowAlertCallback(() => {});
      unsubscribe();
      DeploymentManager.stopPolling();
    };
  }, []);

  useEffect(() => {
    if (userPreferences) {
      localStorage.setItem("verifywise_preferences", JSON.stringify(userPreferences));
    }
  }, [userPreferences]);

  const [uiValues, setUiValues] = useState<UIValues>({});
  const [authValues, setAuthValues] = useState<AuthValues>({});
  const [dashboardValues, setDashboardValues] = useState<DashboardState>({
    dashboard: {},
    projects: {},
    compliance: {},
    assessments: {},
    vendors: [],
    users: [],
  });
  const [inputValues, setInputValues] = useState<InputValues>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [triggerSidebar, setTriggerSidebar] = useState(false);


  const [currentProjectId, setCurrentProjectId] = useState<string | null>("");
  const [componentsVisible, setComponentsVisible] = useState<ComponentVisible>({
    home: false,
    sidebar: false,
    projectFrameworks: false,
    compliance: false,
  });
  const changeComponentVisibility = useCallback(
    (component: keyof ComponentVisible, value: boolean) => {
      setComponentsVisible((prev) => ({
        ...prev,
        [component]: value,
      }));
    },
    []
  );

  const [photoRefreshFlag, setPhotoRefreshFlag] = useState(false);

  const contextValues = useMemo(
    () => ({
      uiValues,
      setUiValues,
      authValues,
      setAuthValues,
      dashboardValues,
      setDashboardValues,
      inputValues,
      setInputValues,
      token,
      currentProjectId,
      setCurrentProjectId,
      userId,
      projects,
      setProjects,
      componentsVisible,
      changeComponentVisibility,
      users,
      refreshUsers,
      userRoleName,
      organizationId,
      photoRefreshFlag,
      setPhotoRefreshFlag,
    }),
    [
      uiValues,
      setUiValues,
      authValues,
      setAuthValues,
      dashboardValues,
      setDashboardValues,
      inputValues,
      setInputValues,
      token,
      currentProjectId,
      setCurrentProjectId,
      userId,
      projects,
      setProjects,
      componentsVisible,
      changeComponentVisibility,
      users,
      refreshUsers,
      userRoleName,
      organizationId,
      photoRefreshFlag,
      setPhotoRefreshFlag,
    ]
  );

  const triggerSidebarReload = () => {
    setTriggerSidebar((prev) => !prev);
  };

  return (
    <CookiesProvider>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <VerifyWiseContext.Provider value={contextValues}>
            <PluginRegistryProvider>
              <PluginLoader />
              <UserGuideSidebarProvider>
                <ConditionalThemeWrapper>
                {showUpdateBanner && <UpdateBanner />}
                {alert && (
                  <Alert
                    variant={alert.variant}
                    title={alert.title}
                    body={alert.body}
                    isToast={true}
                    onClick={() => setAlert(null)}
                  />
                )}
                <CommandPaletteErrorBoundary>
                  <CommandPalette
                    open={commandPalette.isOpen}
                    onOpenChange={commandPalette.close}
                  />
                </CommandPaletteErrorBoundary>
                {showModal && (
                  <SetupModal
                    onComplete={handleOnboardingDone}
                    onSkip={handleOnboardingDone}
                  />
                )}
                <ChunkErrorBoundary>
                  <Routes>
                    {createRoutes(triggerSidebar, triggerSidebarReload)}
                  </Routes>
                </ChunkErrorBoundary>

                {/* User Guide Sidebar with Advisor Conversation persistence */}
                <AdvisorConversationProvider>
                  <UserGuideSidebarContainer />
                </AdvisorConversationProvider>
              </ConditionalThemeWrapper>
              </UserGuideSidebarProvider>
            </PluginRegistryProvider>
          </VerifyWiseContext.Provider>
        </PersistGate>
      </Provider>

      {/* React Query DevTools - Only in development */}
      {import.meta.env.DEV && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </CookiesProvider>
  );
}

export default App;
