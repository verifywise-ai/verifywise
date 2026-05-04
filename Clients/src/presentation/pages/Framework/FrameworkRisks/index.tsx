import { useCallback, useMemo } from "react";
import { Box, Stack } from "@mui/material";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { ButtonToggle } from "../../../components/button-toggle";
import RisksView from "../../../components/RisksView";
import { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import { IFrameworkRisksProps } from "../../../../domain/interfaces/i.risk";

const FrameworkRisks = ({
  organizationalProject,
  filteredFrameworks,
  selectedFramework,
  onFrameworkSelect,
}: IFrameworkRisksProps) => {
  // Get current framework ID
  const getFrameworkId = useCallback(() => {
    if (filteredFrameworks.length === 0) return null;

    const framework = filteredFrameworks[selectedFramework];
    return framework?.id || null;
  }, [filteredFrameworks, selectedFramework]);

  // Create fetch function for framework risks
  const fetchFrameworkRisks = useCallback(
    async (_filter = "active"): Promise<RiskModel[]> => {
      const frameworkId = getFrameworkId();
      if (!frameworkId) {
        return [];
      }

      try {
        const response = await getAllEntities({
          routeUrl: `/projectRisks/by-frameworkid/${frameworkId}`,
        });
        return response.data || [];
      } catch (error) {
        console.error("Error fetching framework risks:", error);
        throw error;
      }
    },
    [getFrameworkId],
  );

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
    <RisksView
      fetchRisks={fetchFrameworkRisks}
      title="Framework risks"
      headerContent={frameworkToggle}
      refreshTrigger={selectedFramework}
    />
  );
};

export default FrameworkRisks;
