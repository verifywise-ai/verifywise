import { Stack, SelectChangeEvent, useTheme } from "@mui/material";
import { ArrowRight } from "lucide-react";
import Select from "../Inputs/Select";
import GovernanceTooltip from "./GovernanceTooltip";
import { text } from "../../themes/palette";

const FRAMEWORKS = [
  { _id: 1, name: "EU AI Act" },
  { _id: 2, name: "ISO 42001" },
  { _id: 3, name: "ISO 27001" },
  { _id: 4, name: "NIST AI RMF" },
];

interface FrameworkSelectorProps {
  sourceId: number;
  targetId: number;
  onSourceChange: (id: number) => void;
  onTargetChange: (id: number) => void;
}

const FrameworkSelector = ({
  sourceId,
  targetId,
  onSourceChange,
  onTargetChange,
}: FrameworkSelectorProps) => {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={3} sx={{ mb: 3 }} alignItems="flex-end">
      <GovernanceTooltip
        header="Source framework"
        description="Choose the framework to map controls from"
      >
        <span>
          <Select
            id="source-framework"
            label="Source Framework"
            value={sourceId}
            items={FRAMEWORKS.filter((fw) => fw._id !== targetId)}
            onChange={(e: SelectChangeEvent<string | number>) =>
              onSourceChange(Number(e.target.value))
            }
            sx={{ minWidth: 200 }}
          />
        </span>
      </GovernanceTooltip>

      <ArrowRight size={16} color={text.muted} style={{ marginBottom: theme.spacing(2.5) }} />

      <GovernanceTooltip
        header="Target framework"
        description="Choose the framework to map controls into"
      >
        <span>
          <Select
            id="target-framework"
            label="Target Framework"
            value={targetId}
            items={FRAMEWORKS.filter((fw) => fw._id !== sourceId)}
            onChange={(e: SelectChangeEvent<string | number>) =>
              onTargetChange(Number(e.target.value))
            }
            sx={{ minWidth: 200 }}
          />
        </span>
      </GovernanceTooltip>
    </Stack>
  );
};

export default FrameworkSelector;
