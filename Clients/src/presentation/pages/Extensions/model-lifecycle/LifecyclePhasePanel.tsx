import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Typography,
  Box,
  Chip,
} from "@mui/material";
import { ChevronRight } from "lucide-react";
import { LifecyclePhase } from "./useModelLifecycle";
import LifecycleItemField from "./LifecycleItemField";

interface LifecyclePhasePanelProps {
  phase: LifecyclePhase;
  modelId: number;
  expanded: boolean;
  onToggle: () => void;
  onValueChanged?: () => void;
}

export default function LifecyclePhasePanel({
  phase,
  modelId,
  expanded,
  onToggle,
  onValueChanged,
}: LifecyclePhasePanelProps) {
  const items = Array.isArray(phase.items) ? phase.items : [];
  const totalItems = items.length;
  const filledItems = items.filter((item) => {
    const val = item.value;
    if (!val) return false;
    if (val.value_text) return true;
    if (val.value_json) return true;
    if (val.files && val.files.length > 0) return true;
    return false;
  }).length;

  const isComplete = totalItems > 0 && filledItems === totalItems;
  const chipColor = isComplete ? "#079455" : filledItems > 0 ? "#2E90FA" : "#667085";

  return (
    <Accordion
      expanded={expanded}
      onChange={onToggle}
      disableGutters
      sx={{
        "border": "1px solid #E0E4E9",
        "borderRadius": "4px !important",
        "&:before": { display: "none" },
        "boxShadow": "none",
        "mb": "12px",
        "overflow": "hidden",
      }}
    >
      <AccordionSummary
        expandIcon={
          <ChevronRight
            size={16}
            style={{
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              color: "#667085",
            }}
          />
        }
        sx={{
          "backgroundColor": expanded ? "#F9FAFB" : "#fff",
          "&:hover": { backgroundColor: "#F9FAFB" },
          "px": "16px",
          "py": "12px",
          "& .MuiAccordionSummary-expandIconWrapper": {
            transform: "none !important",
          },
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            width: "100%",
            gap: "12px",
          }}
        >
          <Stack sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 600, color: "#344054", fontSize: "14px" }}>
              {phase.name}
            </Typography>
            {phase.description && (
              <Typography sx={{ color: "#667085", fontSize: "12px", mt: "4px" }}>
                {phase.description}
              </Typography>
            )}
          </Stack>
          <Chip
            label={`${filledItems} / ${totalItems}`}
            size="small"
            variant="outlined"
            sx={{ color: chipColor, borderColor: chipColor }}
          />
        </Stack>
      </AccordionSummary>

      <AccordionDetails sx={{ p: 0 }}>
        <Stack spacing={0} divider={<Box sx={{ borderTop: "1px solid #E0E4E9" }} />}>
          {items.map((item) => (
            <Stack key={item.id} sx={{ px: "16px", py: "16px", gap: "10px" }}>
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Typography sx={{ fontWeight: 500, color: "#344054", fontSize: "13px" }}>
                  {item.name}
                </Typography>
                {item.is_required && (
                  <Typography sx={{ color: "#F04438", fontSize: "11px" }}>Required</Typography>
                )}
              </Stack>
              {item.description && (
                <Typography sx={{ color: "#667085", display: "block", fontSize: "12px" }}>
                  {item.description}
                </Typography>
              )}
              <LifecycleItemField modelId={modelId} item={item} onValueChanged={onValueChanged} />
            </Stack>
          ))}
          {items.length === 0 && (
            <Typography sx={{ textAlign: "center", color: "#667085", py: 4 }}>
              No items configured for this phase
            </Typography>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
