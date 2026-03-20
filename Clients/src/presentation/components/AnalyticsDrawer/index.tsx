import React, { useState, useEffect, memo } from "react";
import { Drawer, Box, Typography, Stack, IconButton, useTheme } from "@mui/material";
import { X as CloseIcon } from "lucide-react";
import { ModelInventoryHistoryChart } from "../Charts/ModelInventoryHistoryChart";
import { RiskHistoryChart } from "../Charts/RiskHistoryChart";
import { ButtonToggle } from "../button-toggle";

interface ParameterOption {
  value: string;
  label: string;
}

interface AnalyticsDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  entityName: string; // e.g., "Model", "Risk", "Vendor"
  availableParameters: ParameterOption[];
  defaultParameter?: string;
  chartType?: "model" | "risk"; // Type of chart to display
}

/**
 * Generic Analytics Drawer Component
 *
 * This component can be reused across different entities (Model Inventory, Risks, Vendors, etc.)
 * to display historical trends and analytics.
 *
 * @example
 * // For Model Inventory
 * <AnalyticsDrawer
 *   open={isOpen}
 *   onClose={handleClose}
 *   title="Analytics & Trends"
 *   description="Track your model inventory history over time"
 *   entityName="Model"
 *   availableParameters={[{ value: "status", label: "Status" }]}
 * />
 *
 * @example
 * // For Project Risks
 * <AnalyticsDrawer
 *   open={isOpen}
 *   onClose={handleClose}
 *   title="Risk Analytics"
 *   description="Monitor risk trends and patterns"
 *   entityName="Risk"
 *   availableParameters={[
 *     { value: "risk_level", label: "Risk Level" },
 *     { value: "category", label: "Category" }
 *   ]}
 * />
 */
const AnalyticsDrawer: React.FC<AnalyticsDrawerProps> = ({
  open,
  onClose,
  title,
  description,
  entityName,
  availableParameters,
  defaultParameter,
  chartType = "model", // Default to model chart for backward compatibility
}) => {
  const theme = useTheme();
  // Create localStorage key based on chartType for persistence
  const storageKey = `analytics_parameter_${chartType}`;

  // Initialize state from localStorage or default
  const [selectedParameter, setSelectedParameter] = useState<string>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored && availableParameters.some(p => p.value === stored)) {
      return stored;
    }
    return defaultParameter || availableParameters[0]?.value || "";
  });

  // Persist to localStorage whenever selection changes
  useEffect(() => {
    if (selectedParameter) {
      localStorage.setItem(storageKey, selectedParameter);
    }
  }, [selectedParameter, storageKey]);

  const handleParameterChange = (newParameter: string) => {
    setSelectedParameter(newParameter);
  };

  // Get the label for the selected parameter
  const selectedParameterLabel = availableParameters.find(
    (p) => p.value === selectedParameter
  )?.label || "Parameter";

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      aria-label={`${title} drawer`}
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: "600px", md: "800px" },
          padding: theme.spacing(3),
        },
      }}
    >
      <Box>
        {/* Header */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography sx={{ fontSize: theme.typography.body1.fontSize, fontWeight: 700, color: theme.palette.text.primary }}>
              {title}
            </Typography>
            <Typography sx={{ fontSize: theme.typography.body2.fontSize, color: theme.palette.text.secondary, mt: 0.5 }}>
              {description}
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            aria-label="Close drawer"
            sx={{
              color: theme.palette.action.active,
              "&:hover": {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <CloseIcon size={20} />
          </IconButton>
        </Stack>

        {/* Parameter Selection */}
        <Stack sx={{ mb: 3, gap: 2 }}>
          <Typography sx={{ fontSize: theme.typography.body1.fontSize, fontWeight: 700, color: theme.palette.text.primary }}>
            Historical trend: {entityName} {selectedParameterLabel.toLowerCase()} over time
          </Typography>
          <Box display="flex" justifyContent="flex-end">
            <ButtonToggle
              options={availableParameters}
              value={selectedParameter}
              onChange={handleParameterChange}
            />
          </Box>
        </Stack>

        {/* Chart */}
        {chartType === "model" ? (
          <ModelInventoryHistoryChart
            parameter={selectedParameter}
            height={300}
          />
        ) : (
          <RiskHistoryChart
            parameter={selectedParameter}
            height={300}
          />
        )}
      </Box>
    </Drawer>
  );
};

export default memo(AnalyticsDrawer);
