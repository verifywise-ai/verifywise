import type { ReactNode } from "react";
import { UIContext, UIProvider, useUI } from "./ui.context";
import { AuthContext, AuthProvider, useAuthContext } from "./auth.context";
import { UsersContext, UsersProvider, useUsersContext } from "./users.context";
import { DashboardContext, DashboardProvider, useDashboardContext } from "./dashboard.context";
import { InputContext, InputProvider, useInput } from "./input.context";
import { ProjectsContext, ProjectsProvider, useProjectsContext } from "./projects.context";
import { VisibilityContext, VisibilityProvider, useVisibility } from "./visibility.context";
import { VerifyWiseContext } from "../VerifyWise.context";

export {
  UIContext,
  UIProvider,
  useUI,
  AuthContext,
  AuthProvider,
  useAuthContext,
  UsersContext,
  UsersProvider,
  useUsersContext,
  DashboardContext,
  DashboardProvider,
  useDashboardContext,
  InputContext,
  InputProvider,
  useInput,
  ProjectsContext,
  ProjectsProvider,
  useProjectsContext,
  VisibilityContext,
  VisibilityProvider,
  useVisibility,
};

/**
 * Backward-compatibility bridge: reads from the focused contexts and provides
 * the legacy monolithic VerifyWiseContext so existing consumers keep working
 * while the codebase migrates to focused hooks.
 */
const VerifyWiseContextBridge = ({ children }: { children: ReactNode }) => {
  const { uiValues, setUiValues } = useUI();
  const { authValues, setAuthValues, token, userRoleName, userId, organizationId } =
    useAuthContext();
  const { dashboardValues, setDashboardValues } = useDashboardContext();
  const { inputValues, setInputValues } = useInput();
  const { projects, setProjects, currentProjectId, setCurrentProjectId } = useProjectsContext();
  const { componentsVisible, changeComponentVisibility } = useVisibility();
  const { users, refreshUsers, photoRefreshFlag, setPhotoRefreshFlag } = useUsersContext();

  return (
    <VerifyWiseContext.Provider
      value={{
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
      }}
    >
      {children}
    </VerifyWiseContext.Provider>
  );
};

/**
 * Composes all VerifyWise-focused context providers and the legacy context bridge.
 * Drop-in replacement for the original monolithic VerifyWiseContext.Provider.
 */
export const VerifyWiseProvider = ({ children }: { children: ReactNode }) => (
  <UIProvider>
    <AuthProvider>
      <UsersProvider>
        <DashboardProvider>
          <InputProvider>
            <ProjectsProvider>
              <VisibilityProvider>
                <VerifyWiseContextBridge>{children}</VerifyWiseContextBridge>
              </VisibilityProvider>
            </ProjectsProvider>
          </InputProvider>
        </DashboardProvider>
      </UsersProvider>
    </AuthProvider>
  </UIProvider>
);
