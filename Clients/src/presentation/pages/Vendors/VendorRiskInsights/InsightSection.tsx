import type { ReactNode } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from "@mui/material";
import { ChevronDown } from "lucide-react";
import {
  sectionSx,
  summaryDescriptionSx,
  summaryHeaderSx,
  summaryTitleSx,
} from "../../RiskInheritanceGraph/DismissalAnalytics/styles";

interface InsightSectionProps {
  title: string;
  description: string;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  children: ReactNode;
}

/**
 * One collapsible vendor risk insight, styled like the reports on the risk
 * inheritance page. Controlled, so a section can hold off its fetch until it
 * is first opened.
 */
export default function InsightSection({
  title,
  description,
  expanded,
  onToggle,
  children,
}: InsightSectionProps) {
  return (
    <Accordion expanded={expanded} onChange={(_event, open) => onToggle(open)} sx={sectionSx}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Box sx={summaryHeaderSx}>
          <Typography sx={summaryTitleSx}>{title}</Typography>
          <Typography sx={summaryDescriptionSx}>{description}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 8 }}>{expanded ? children : null}</AccordionDetails>
    </Accordion>
  );
}
