import { Box } from "@mui/material";
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABELS,
  LifecycleStage,
} from "../../../domain/enums/lifecycleStage.enum";
import { radiusPx, stage as stageTokens } from "../../themes/palette";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";

interface StageStepsProps {
  stage: LifecycleStage | string | null | undefined;
}

const TOTAL_STEPS = LIFECYCLE_STAGES.length;

/**
 * Lifecycle stage as plain text with four step bars: one more bar is filled
 * at each stage. The bars are decorative; the label carries the meaning.
 */
const StageSteps = ({ stage }: StageStepsProps) => {
  const { t } = useTranslation();
  const index = LIFECYCLE_STAGES.indexOf(stage as LifecycleStage);
  const known = index >= 0;
  const filled = known ? index + 1 : 0;
  const label = known ? LIFECYCLE_STAGE_LABELS[stage as LifecycleStage] : (stage ?? "");
  const isPast = stage === LifecycleStage.RETIRED;

  return (
    <Box
      data-testid="stage-steps"
      title={
        known
          ? fill(t("Step {current} of {total}"), { current: filled, total: TOTAL_STEPS })
          : undefined
      }
      sx={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
    >
      <Box aria-hidden="true" sx={{ display: "inline-flex", gap: "2px" }}>
        {LIFECYCLE_STAGES.map((_, i) => (
          <Box
            key={i}
            data-testid="stage-step-bar"
            data-on={i < filled}
            sx={{
              width: "5px",
              height: "12px",
              borderRadius: radiusPx.sm,
              backgroundColor: i < filled ? stageTokens.barOn : stageTokens.barOff,
            }}
          />
        ))}
      </Box>
      <Box
        component="span"
        data-testid="stage-steps-label"
        sx={{
          fontSize: "13px",
          color: isPast ? stageTokens.textPast : stageTokens.text,
        }}
      >
        {label}
      </Box>
    </Box>
  );
};

export default StageSteps;
