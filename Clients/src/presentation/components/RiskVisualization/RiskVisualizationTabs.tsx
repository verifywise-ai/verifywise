import React, { useState } from "react";
import { Box } from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import RiskHeatMap from "./RiskHeatMap";
import RiskCategories from "./RiskCategories";
import TabBar from "../TabBar";
import { IRiskVisualizationTabsProps } from "../../types/interfaces/i.risk";
import { background, status } from "../../themes/palette";

const RiskVisualizationTabs: React.FC<IRiskVisualizationTabsProps> = ({
  risks,
  selectedRisk,
  onRiskSelect,
}) => {
  const [value, setValue] = useState("0");

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ mt: 3 }}>
      <TabContext value={value}>
        <TabBar
          tabs={[
            { label: "Heat map", value: "0", icon: "Grid3x3" },
            { label: "Categories", value: "1", icon: "FolderKanban" },
          ]}
          activeTab={value}
          onChange={handleChange}
        />

        <Box
          sx={{
            backgroundColor: `${background.main}`,
            border: `1px solid ${status.default.border}`,
            borderRadius: 2,
            borderTop: "none",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          <TabPanel value="0" sx={{ p: 3 }}>
            <RiskHeatMap
              risks={risks}
              selectedRisk={selectedRisk}
              onRiskSelect={onRiskSelect}
            />
          </TabPanel>
          <TabPanel value="1" sx={{ p: 3 }}>
            <RiskCategories
              risks={risks}
              selectedRisk={selectedRisk}
              onRiskSelect={onRiskSelect}
            />
          </TabPanel>
        </Box>
      </TabContext>
    </Box>
  );
};

export default RiskVisualizationTabs;
