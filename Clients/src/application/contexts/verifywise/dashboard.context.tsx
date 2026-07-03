import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DashboardState } from "../../interfaces/appStates";

interface DashboardContextValue {
  dashboardValues: DashboardState;
  setDashboardValues: Dispatch<SetStateAction<DashboardState>>;
}

export const DashboardContext = createContext<DashboardContextValue>({
  dashboardValues: {
    dashboard: {},
    projects: {},
    compliance: {},
    assessments: {},
    vendors: [],
    users: [],
  },
  setDashboardValues: () => {},
});

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const [dashboardValues, setDashboardValues] = useState<DashboardState>({
    dashboard: {},
    projects: {},
    compliance: {},
    assessments: {},
    vendors: [],
    users: [],
  });

  const value = useMemo(
    () => ({ dashboardValues, setDashboardValues }),
    [dashboardValues, setDashboardValues],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};

export const useDashboardContext = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboardContext must be used within a DashboardProvider");
  }
  return context;
};
