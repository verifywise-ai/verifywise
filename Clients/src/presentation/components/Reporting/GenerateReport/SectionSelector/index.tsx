/**
 * SectionSelector - Tree view component for selecting report sections
 * Supports collapsible groups with indeterminate checkbox states
 */

import React, { useMemo, useCallback } from "react";
import {
  Stack,
  Box,
  Typography,
  Checkbox,
  Collapse,
  useTheme,
} from "@mui/material";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import {
  getAvailableSections,
  ReportSectionGroup,
} from "../constants";
import { brand } from "../../../../themes/palette";

interface SectionSelectorProps {
  frameworkId: number;
  isOrganizational: boolean;
  selection: Record<string, boolean>;
  onSelectionChange: (selection: Record<string, boolean>) => void;
  aiEnhanced?: boolean;
}

const SectionSelector: React.FC<SectionSelectorProps> = ({
  frameworkId,
  isOrganizational,
  selection,
  onSelectionChange,
  aiEnhanced = false,
}) => {
  const theme = useTheme();
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({
    riskAnalysis: true,
    complianceGovernance: true,
    organization: true,
  });

  const availableGroups = useMemo(
    () => getAvailableSections(frameworkId, isOrganizational),
    [frameworkId, isOrganizational]
  );

  // Calculate all available section IDs for "Select All" functionality
  const allSectionIds = useMemo(() => {
    const ids: string[] = [];
    availableGroups.forEach((group) => {
      group.sections.forEach((section) => {
        ids.push(section.id);
      });
    });
    return ids;
  }, [availableGroups]);

  // Check if all sections are selected
  const allSelected = useMemo(() => {
    return allSectionIds.every((id) => selection[id] === true);
  }, [allSectionIds, selection]);

  // Check if some (but not all) sections are selected
  const someSelected = useMemo(() => {
    const selectedCount = allSectionIds.filter((id) => selection[id] === true).length;
    return selectedCount > 0 && selectedCount < allSectionIds.length;
  }, [allSectionIds, selection]);

  // Check if any section is selected (for disabling Generate button)
  const hasAnySelection = useMemo(() => {
    return allSectionIds.some((id) => selection[id] === true);
  }, [allSectionIds, selection]);

  // Handle "Select All" toggle
  const handleSelectAll = useCallback(() => {
    const newSelection: Record<string, boolean> = {};
    const newValue = !allSelected;
    allSectionIds.forEach((id) => {
      newSelection[id] = newValue;
    });
    onSelectionChange(newSelection);
  }, [allSelected, allSectionIds, onSelectionChange]);

  // Handle individual section toggle
  const handleSectionToggle = useCallback(
    (sectionId: string) => {
      onSelectionChange({
        ...selection,
        [sectionId]: !selection[sectionId],
      });
    },
    [selection, onSelectionChange]
  );

  // Handle group toggle (toggles all children)
  const handleGroupToggle = useCallback(
    (group: ReportSectionGroup) => {
      const groupSectionIds = group.sections.map((s) => s.id);
      const allGroupSelected = groupSectionIds.every((id) => selection[id] === true);

      const newSelection = { ...selection };
      groupSectionIds.forEach((id) => {
        newSelection[id] = !allGroupSelected;
      });
      onSelectionChange(newSelection);
    },
    [selection, onSelectionChange]
  );

  // Get group checkbox state (checked, unchecked, or indeterminate)
  const getGroupState = useCallback(
    (group: ReportSectionGroup) => {
      const groupSectionIds = group.sections.map((s) => s.id);
      const selectedCount = groupSectionIds.filter((id) => selection[id] === true).length;

      if (selectedCount === 0) return "unchecked";
      if (selectedCount === groupSectionIds.length) return "checked";
      return "indeterminate";
    },
    [selection]
  );

  // Toggle group expansion
  const toggleGroupExpand = useCallback((groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  }, []);

  const checkboxStyles = {
    padding: "2px",
    marginRight: "4px",
    color: theme.palette.border.dark,
    width: "20px",
    height: "20px",
    minWidth: "20px",
    minHeight: "20px",
    "&.Mui-checked": {
      color: `${brand.primary}`,
    },
    "&.MuiCheckbox-indeterminate": {
      color: `${brand.primary}`,
    },
    "& .MuiSvgIcon-root": {
      width: "16px",
      height: "16px",
    },
  };


  const rowStyles = {
    display: "flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: "4px",
    cursor: "pointer",
    "&:hover": {
      backgroundColor: theme.palette.background.alt,
    },
  };

  const expandIconStyles = {
    width: "20px",
    height: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    flexShrink: 0,
    "&:hover": {
      backgroundColor: theme.palette.background.main,
    },
  };

  return (
    <Stack spacing={0.5}>
      {/* Select All */}
      <Box
        sx={{
          ...rowStyles,
          backgroundColor: theme.palette.background.alt,
          borderBottom: `1px solid ${theme.palette.border.light}`,
          marginBottom: "4px",
        }}
        onClick={handleSelectAll}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={handleSelectAll}
          sx={checkboxStyles}
          size="small"
                  />
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 600,
            color: theme.palette.text.primary,
          }}
        >
          Select all
        </Typography>
      </Box>

      {/* Section Groups */}
      {availableGroups.map((group) => {
        const groupState = getGroupState(group);
        const isExpanded = expandedGroups[group.id] ?? true;

        return (
          <Box key={group.id}>
            {/* Group Header */}
            <Box
              sx={{
                ...rowStyles,
                justifyContent: "space-between",
              }}
              onClick={() => handleGroupToggle(group)}
            >
              <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
                <Checkbox
                  checked={groupState === "checked"}
                  indeterminate={groupState === "indeterminate"}
                  onChange={() => handleGroupToggle(group)}
                  sx={checkboxStyles}
                  size="small"
                                  />
                <Typography
                  sx={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                  }}
                >
                  {group.label}
                </Typography>
              </Box>
              <Box
                sx={expandIconStyles}
                onClick={(e) => toggleGroupExpand(group.id, e)}
              >
                {isExpanded ? (
                  <ChevronDown size={14} color={theme.palette.text.secondary} />
                ) : (
                  <ChevronRight size={14} color={theme.palette.text.secondary} />
                )}
              </Box>
            </Box>

            {/* Group Children */}
            <Collapse in={isExpanded}>
              <Stack sx={{ marginLeft: "20px" }} spacing={0}>
                {group.sections.map((section) => (
                  <Box
                    key={section.id}
                    sx={rowStyles}
                    onClick={() => handleSectionToggle(section.id)}
                  >
                    <Checkbox
                      checked={selection[section.id] ?? true}
                      onChange={() => handleSectionToggle(section.id)}
                      sx={checkboxStyles}
                      size="small"
                    />
                    <Typography
                      sx={{
                        fontSize: "13px",
                        fontWeight: 400,
                        color: theme.palette.text.primary,
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                    >
                      {section.label}
                      {aiEnhanced && (
                        <Sparkles size={12} color={brand.primary} />
                      )}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Collapse>
          </Box>
        );
      })}

      {/* Validation message when nothing selected */}
      <Typography
        sx={{
          fontSize: "12px",
          color: theme.palette.error.main,
          textAlign: "center",
          marginTop: "4px",
          visibility: hasAnySelection ? "hidden" : "visible",
          height: "18px",
        }}
      >
        Please select at least one section to generate a report.
      </Typography>
    </Stack>
  );
};

export default SectionSelector;
