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
import { background, status, text, border, accent } from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";
import { radiusPx } from "../../../themes/palette";

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
  const chipColor = isComplete
    ? status.success.strong
    : filledItems > 0
      ? accent.blue.text
      : text.secondary;

  return (
    <Accordion
      expanded={expanded}
      onChange={onToggle}
      disableGutters
      sx={{
        "border": `1px solid ${border.light}`,
        "borderRadius": `${radiusPx.sm} !important`,
        "&:before": { display: "none" },
        "boxShadow": "none",
        "mb": 6,
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
              color: text.icon,
            }}
          />
        }
        sx={{
          "backgroundColor": expanded ? background.alt : background.main,
          "&:hover": { backgroundColor: background.alt },
          "px": 8,
          "py": 6,
          "& .MuiAccordionSummary-expandIconWrapper": {
            transform: "none !important",
          },
        }}
      >
        <Stack direction="row" alignItems="center" sx={{ width: "100%", gap: 6 }}>
          <Stack sx={{ flex: 1 }}>
            <Typography sx={{ ...textStyles.cardTitle, color: text.secondary }}>
              {phase.name}
            </Typography>
            {phase.description && (
              <Typography sx={{ ...textStyles.body, color: text.secondary, mt: 2 }}>
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
        <Stack spacing={0} divider={<Box sx={{ borderTop: `1px solid ${border.light}` }} />}>
          {items.map((item) => (
            <Stack key={item.id} sx={{ px: 8, py: 8, gap: 4 }}>
              <Stack direction="row" alignItems="center" sx={{ gap: 4 }}>
                <Typography sx={{ ...textStyles.formLabel, color: text.secondary }}>
                  {item.name}
                </Typography>
                {item.is_required && (
                  <Typography sx={{ ...textStyles.caption, color: text.error }}>
                    Required
                  </Typography>
                )}
              </Stack>
              {item.description && (
                <Typography sx={{ ...textStyles.body, color: text.secondary, display: "block" }}>
                  {item.description}
                </Typography>
              )}
              <LifecycleItemField modelId={modelId} item={item} onValueChanged={onValueChanged} />
            </Stack>
          ))}
          {items.length === 0 && (
            <Typography
              sx={{ ...textStyles.body, textAlign: "center", color: text.subdued, py: 4 }}
            >
              No items configured for this phase
            </Typography>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
