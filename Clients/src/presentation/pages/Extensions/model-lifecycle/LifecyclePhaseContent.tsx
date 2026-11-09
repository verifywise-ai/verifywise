import { Stack, Typography, Box } from "@mui/material";
import { LifecyclePhase } from "./useModelLifecycle";
import LifecycleItemField from "./LifecycleItemField";
import { border, text } from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";

interface LifecyclePhaseContentProps {
  phase: LifecyclePhase;
  modelId: number;
  onValueChanged?: () => void;
}

export default function LifecyclePhaseContent({
  phase,
  modelId,
  onValueChanged,
}: LifecyclePhaseContentProps) {
  const items = Array.isArray(phase.items) ? phase.items : [];

  return (
    <Stack sx={{ flex: 1, overflowY: "auto", p: 12, gap: 8 }}>
      <Stack sx={{ gap: 2 }}>
        <Typography sx={{ ...textStyles.cardTitle, color: text.primary }}>{phase.name}</Typography>
        {phase.description && (
          <Typography sx={{ ...textStyles.body, color: text.secondary }}>
            {phase.description}
          </Typography>
        )}
      </Stack>

      <Box sx={{ borderTop: `1px solid ${border.light}` }} />

      {items.length > 0 ? (
        <Stack spacing={0} divider={<Box sx={{ borderTop: `1px solid ${border.light}` }} />}>
          {items.map((item) => (
            <Stack key={item.id} sx={{ py: 8, gap: 4 }}>
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
                <Typography sx={{ ...textStyles.body, display: "block", color: text.secondary }}>
                  {item.description}
                </Typography>
              )}
              <LifecycleItemField modelId={modelId} item={item} onValueChanged={onValueChanged} />
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ textAlign: "center", color: text.subdued, py: 4 }}>
          No items configured for this phase
        </Typography>
      )}
    </Stack>
  );
}
