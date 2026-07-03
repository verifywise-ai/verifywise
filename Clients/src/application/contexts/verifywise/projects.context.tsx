import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Project } from "../../../domain/types/Project";

interface ProjectsContextValue {
  projects: Project[];
  setProjects: Dispatch<SetStateAction<Project[]>>;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string) => void;
}

export const ProjectsContext = createContext<ProjectsContextValue>({
  projects: [],
  setProjects: () => {},
  currentProjectId: "",
  setCurrentProjectId: () => {},
});

export const ProjectsProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>("");

  const value = useMemo(
    () => ({ projects, setProjects, currentProjectId, setCurrentProjectId }),
    [projects, setProjects, currentProjectId, setCurrentProjectId],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
};

export const useProjectsContext = () => {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjectsContext must be used within a ProjectsProvider");
  }
  return context;
};
