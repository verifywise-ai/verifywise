import { useCallback, useMemo } from "react";
import { Box, Stack } from "@mui/material";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { IModelInventory } from "../../../../domain/interfaces/i.modelInventory";
import { Project } from "../../../../domain/types/Project";
import { Framework } from "../../../../domain/types/Framework";
import { ButtonToggle } from "../../../components/button-toggle";
import { LinkedModelsView } from "../../../components/LinkedModelsView";

interface FrameworkLinkedModelsProps {
  organizationalProject: Project;
  filteredFrameworks: Framework[];
  selectedFramework: number;
  onFrameworkSelect: (index: number) => void;
}

const FrameworkLinkedModels = ({
  organizationalProject,
  filteredFrameworks,
  selectedFramework,
  onFrameworkSelect,
}: FrameworkLinkedModelsProps) => {
  // Get current framework ID
  const getFrameworkId = useCallback(() => {
    if (filteredFrameworks.length === 0) return null;

    const framework = filteredFrameworks[selectedFramework];
    return framework?.id || null;
  }, [filteredFrameworks, selectedFramework]);

  // Create fetch function for framework linked models
  const fetchLinkedModels = useCallback(async (): Promise<IModelInventory[]> => {
    const frameworkId = getFrameworkId();
    if (!frameworkId) return [];

    try {
      const response = await getAllEntities({
        routeUrl: `/modelInventory/by-frameworkId/${frameworkId}`,
      });
      return response?.data || [];
    } catch (error) {
      console.error("Error fetching linked models:", error);
      throw error;
    }
  }, [getFrameworkId]);

  // Create the framework toggle as header content
  const frameworkToggle = useMemo(
    () =>
      organizationalProject && filteredFrameworks.length > 0 ? (
        <>
          <Box>
            <ButtonToggle
              options={filteredFrameworks.map((framework, index) => ({
                value: index.toString(),
                label: framework.name,
              }))}
              value={selectedFramework.toString()}
              onChange={(value) => onFrameworkSelect(parseInt(value))}
              height={34}
            />
          </Box>
          <Stack sx={{ pt: "8px" }}></Stack>
        </>
      ) : null,
    [organizationalProject, filteredFrameworks, selectedFramework, onFrameworkSelect],
  );

  return (
    <LinkedModelsView
      fetchModels={fetchLinkedModels}
      headerContent={frameworkToggle}
      refreshTrigger={selectedFramework}
      emptyMessage="No AI models linked to this framework yet"
    />
  );
};

export default FrameworkLinkedModels;
