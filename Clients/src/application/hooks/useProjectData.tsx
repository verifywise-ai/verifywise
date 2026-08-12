import { useEffect, useMemo, useState } from "react";
import { Project } from "../../domain/types/Project";
import { User } from "../../domain/types/User";
import { getProjectById } from "../repository/project.repository";
import useUsers from "./useUsers";

interface UseProjectDataParams {
  projectId: string;
  refreshKey?: any;
}
interface UseProjectDataResult {
  project: Project | null;
  projectOwner: string | null;
  error: string | null;
  isLoading: boolean;
  projectRisks: any; // Add projectRisks to the return type
  setProject: (project: Project | null) => void; // Add setProject to the return type
}

const useProjectData = ({ projectId, refreshKey }: UseProjectDataParams): UseProjectDataResult => {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectRisks, setProjectRisks] = useState<any>(null); // Add state for projectRisks
  const { users } = useUsers();

  // Fetch effect: depends ONLY on the identity of the project being loaded.
  // `users` used to be in the deps, which caused the whole project fetch to
  // re-fire every time the users list ref changed (which is frequently).
  useEffect(() => {
    if (!projectId) {
      setError("No project ID provided");
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    getProjectById({
      id: projectId,
      signal: controller.signal,
    })
      .then(({ data }) => {
        setProjectRisks(data.risks); // Set projectRisks from the fetched data
        setProject(data); // Ensure project is set correctly
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(`Failed to fetch project #${projectId}: ${err.message}`);
          setProject(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [projectId, refreshKey]);

  // Derive owner name lazily from users + project — doesn't need to re-fetch
  // the project when the users list updates.
  const projectOwner = useMemo<string | null>(() => {
    if (!project) return null;
    const ownerUser = users.find((user: User) => user.id === project.owner);
    return ownerUser ? `${ownerUser.name} ${ownerUser.surname}` : null;
  }, [project, users]);

  return { project, projectOwner, error, isLoading, projectRisks, setProject };
};

export default useProjectData;
