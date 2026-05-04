import { createContext, useContext, useState, ReactNode, FC } from "react";

interface RecentExperiment {
  id: string;
  name: string;
  projectId: string;
}

interface RecentProject {
  id: string;
  name: string;
}

export interface EvalProject {
  id: string;
  name: string;
  description?: string;
  useCase?: string;
}

interface EvalsSidebarContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  experimentsCount: number;
  setExperimentsCount: (count: number) => void;
  datasetsCount: number;
  setDatasetsCount: (count: number) => void;
  scorersCount: number;
  setScorersCount: (count: number) => void;
  modelsCount: number;
  setModelsCount: (count: number) => void;
  arenaCount: number;
  setArenaCount: (count: number) => void;
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
  recentExperiments: RecentExperiment[];
  setRecentExperiments: (experiments: RecentExperiment[]) => void;
  recentProjects: RecentProject[];
  setRecentProjects: (projects: RecentProject[]) => void;
  onExperimentClick: ((experimentId: string, projectId: string) => void) | undefined;
  setOnExperimentClick: (
    handler: ((experimentId: string, projectId: string) => void) | undefined,
  ) => void;
  onProjectClick: ((projectId: string) => void) | undefined;
  setOnProjectClick: (handler: ((projectId: string) => void) | undefined) => void;
  // Project selector
  currentProject: EvalProject | null;
  setCurrentProject: (project: EvalProject | null) => void;
  allProjects: EvalProject[];
  setAllProjects: (projects: EvalProject[]) => void;
  onProjectChange: ((projectId: string) => void) | undefined;
  setOnProjectChange: (handler: ((projectId: string) => void) | undefined) => void;
}

const EvalsSidebarContext = createContext<EvalsSidebarContextType | null>(null);

export const EvalsSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [experimentsCount, setExperimentsCount] = useState(0);
  const [datasetsCount, setDatasetsCount] = useState(0);
  const [scorersCount, setScorersCount] = useState(0);
  const [modelsCount, setModelsCount] = useState(0);
  const [arenaCount, setArenaCount] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [recentExperiments, setRecentExperiments] = useState<RecentExperiment[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [onExperimentClick, setOnExperimentClick] = useState<
    ((experimentId: string, projectId: string) => void) | undefined
  >();
  const [onProjectClick, setOnProjectClick] = useState<((projectId: string) => void) | undefined>();
  const [currentProject, setCurrentProject] = useState<EvalProject | null>(null);
  const [allProjects, setAllProjects] = useState<EvalProject[]>([]);
  const [onProjectChange, setOnProjectChange] = useState<
    ((projectId: string) => void) | undefined
  >();

  return (
    <EvalsSidebarContext.Provider
      value={{
        activeTab,
        setActiveTab,
        experimentsCount,
        setExperimentsCount,
        datasetsCount,
        setDatasetsCount,
        scorersCount,
        setScorersCount,
        modelsCount,
        setModelsCount,
        arenaCount,
        setArenaCount,
        disabled,
        setDisabled,
        recentExperiments,
        setRecentExperiments,
        recentProjects,
        setRecentProjects,
        onExperimentClick,
        setOnExperimentClick,
        onProjectClick,
        setOnProjectClick,
        currentProject,
        setCurrentProject,
        allProjects,
        setAllProjects,
        onProjectChange,
        setOnProjectChange,
      }}
    >
      {children}
    </EvalsSidebarContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEvalsSidebarContext = () => {
  const context = useContext(EvalsSidebarContext);
  if (!context) {
    throw new Error("useEvalsSidebarContext must be used within EvalsSidebarProvider");
  }
  return context;
};

// Safe version that returns null if not in provider
// eslint-disable-next-line react-refresh/only-export-components
export const useEvalsSidebarContextSafe = () => {
  return useContext(EvalsSidebarContext);
};
