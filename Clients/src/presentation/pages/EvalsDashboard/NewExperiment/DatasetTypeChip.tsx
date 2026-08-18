/**
 * @fileoverview Turn-type chip for dataset cards (user uploads and templates).
 *
 * @module pages/EvalsDashboard/NewExperiment/DatasetTypeChip
 */

import Chip from "../../../components/Chip";
import { palette } from "../../../themes/palette";
import type { DatasetTurnType } from "./newExperimentConfig";

interface DatasetTypeChipProps {
  /** Underlying turn type; omit / undefined treated as single-turn. */
  turnType?: DatasetTurnType | "single-turn" | "multi-turn";
  /** When true and promptCount > 0, label shows the loaded prompt count. */
  isSelected?: boolean;
  promptCount?: number;
  /** Force the Empty chip (user datasets with promptCount === 0). */
  isEmpty?: boolean;
}

export default function DatasetTypeChip({
  turnType,
  isSelected = false,
  promptCount = 0,
  isEmpty = false,
}: DatasetTypeChipProps) {
  if (isEmpty) {
    return (
      <Chip
        label="Empty"
        backgroundColor={palette.status.error.bg}
        textColor={palette.status.error.text}
        uppercase={false}
      />
    );
  }

  const countLabel = isSelected && promptCount > 0 ? `${promptCount} prompts` : undefined;

  if (turnType === "multi-turn") {
    return (
      <Chip
        label={countLabel ?? "Multi-Turn"}
        backgroundColor={palette.accent.blue.bg}
        textColor={palette.accent.blue.text}
        uppercase={false}
      />
    );
  }

  if (turnType === "simulated") {
    return (
      <Chip
        label={countLabel ?? "Simulated"}
        backgroundColor={palette.accent.purple.bg}
        textColor={palette.accent.purple.text}
        uppercase={false}
      />
    );
  }

  return (
    <Chip
      label={countLabel ?? "Single-Turn"}
      backgroundColor={palette.status.warning.bg}
      textColor={palette.status.warning.text}
      uppercase={false}
    />
  );
}
