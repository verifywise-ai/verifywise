/**
 * This file is currently in use
 */

import "./index.css";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { ControlCategory as ControlCategoryModel } from "../../../../domain/types/ControlCategory";
import { useState, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import ControlsTable from "./ControlsTable";
import { border as borderPalette, status } from "../../../themes/palette";

const Table_Columns = [
  { id: 1, name: "Control Name" },
  { id: 2, name: "Owner" },
  { id: 3, name: "# of Subcontrols" },
  { id: 4, name: "Completion" },
];

interface ControlCategoryProps {
  controlCategory: ControlCategoryModel;
  onComplianceUpdate?: () => void;
  projectId: number;
  projectFrameworkId: number;
  statusFilter?: string;
  ownerFilter?: string;
  approverFilter?: string;
  dueDateFilter?: string;
  initialControlCategoryId?: number | null;
}

const ControlCategoryTile: React.FC<ControlCategoryProps> = ({
  controlCategory,
  onComplianceUpdate,
  projectId,
  projectFrameworkId,
  statusFilter,
  ownerFilter,
  approverFilter,
  dueDateFilter,
  initialControlCategoryId,
}) => {
  const accordionRef = useRef<HTMLDivElement>(null);

  // Auto-expand if this category matches the initialControlCategoryId
  const [expanded, setExpanded] = useState<number | false>(() => {
    if (initialControlCategoryId && controlCategory.id === initialControlCategoryId) {
      return controlCategory.id;
    }
    return false;
  });
  const [filteredControlsCount, setFilteredControlsCount] = useState<number | null>(null);

  // Update expanded state and scroll into view when initialControlCategoryId changes
  useEffect(() => {
    if (initialControlCategoryId && controlCategory.id === initialControlCategoryId) {
      setExpanded(controlCategory.id);
      // Scroll into view after a short delay to allow accordion expansion animation
      setTimeout(() => {
        accordionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [initialControlCategoryId, controlCategory.id]);

  const handleAccordionChange =
    (panel: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    };

  const chipColor = filteredControlsCount !== null && filteredControlsCount > 0
  ? { bg: "#E6F4EA", color: `${status.success.text}` }
  : { bg: "#FFF8E1", color: "#795548" };

  return (
    <Stack className="control-category" ref={accordionRef}>
      <Accordion
        className="control-category-accordion"
        expanded={expanded === controlCategory.id}
        onChange={handleAccordionChange(controlCategory.id ?? 0)}
        sx={{
          marginTop: "9px",
          border: `1px solid ${borderPalette.light}`,
          width: "100%",
          marginLeft: "1.5px",
          borderRadius: "4px",
          overflow: "hidden",
          position: "relative",
          margin: 0,
          padding: 0,
          boxShadow: "none",
        }}
      >
        <AccordionSummary
          className="control-category-accordion-summary"
          expandIcon={
            <ChevronRight
              size={16}
              style={{
                transform:
                  expanded === controlCategory.id
                    ? "rotate(180deg)"
                    : "rotate(270deg)",
                transition: "transform 0.5s ease-in",
              }}
            />
          }
        >
          <Typography
            className="new-compliance-tracker-details-accordion-summary-title"
            fontSize={13}
          >
            {controlCategory.order_no} {controlCategory.title}
          </Typography>
          {filteredControlsCount !== null && (
            <Box component="span" sx={{
              backgroundColor: chipColor.bg,
              color: chipColor.color,
              padding: "4px 8px",
              borderRadius: "2px",
              fontSize: 13,
              fontWeight: 500,
              ml: 4,
            }}>
              {filteredControlsCount} filtered
            </Box>
          )}
        </AccordionSummary>
        <AccordionDetails
          className="control-category-accordion-details"
          sx={{ padding: 0 }}
        >
          <ControlsTable
            controlCategoryId={controlCategory.id ?? 1}
            controlCategoryIndex={controlCategory.order_no ?? 1}
            columns={Table_Columns}
            onComplianceUpdate={onComplianceUpdate}
            projectId={projectId}
            projectFrameworkId={projectFrameworkId}
            statusFilter={statusFilter}
            ownerFilter={ownerFilter}
            approverFilter={approverFilter}
            dueDateFilter={dueDateFilter}
            setFilteredControlsCount={setFilteredControlsCount}
          />
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
};

export default ControlCategoryTile;
