import { useCallback } from "react";
import { getAllEntities } from "../../../../../application/repository/entity.repository";
import { IModelInventory } from "../../../../../domain/interfaces/i.modelInventory";
import { Project } from "../../../../../domain/types/Project";
import { LinkedModelsView } from "../../../../components/LinkedModelsView";

const LinkedModels = ({ project }: { project?: Project }) => {
  const projectId = project?.id;

  // Create fetch function for project linked models
  const fetchLinkedModels = useCallback(async (): Promise<IModelInventory[]> => {
    if (!projectId) return [];

    try {
      const response = await getAllEntities({
        routeUrl: `/modelInventory/by-projectId/${projectId}`,
      });
      return response?.data || [];
    } catch (error) {
      console.error("Error fetching linked models:", error);
      throw error;
    }
  }, [projectId]);

  if (!project) {
    return <div>No project selected</div>;
  }

  return (
    <LinkedModelsView
      fetchModels={fetchLinkedModels}
      emptyMessage="No AI models linked to this project yet"
    />
  );
};

export default LinkedModels;
