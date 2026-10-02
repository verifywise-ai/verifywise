import { useCallback, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { Filter } from "lucide-react";
import type { VendorRisk } from "../../../../domain/types/VendorRisk";
import type { HeatMapCellRef } from "../../../types/interfaces/i.risk";
import TabBar from "../../../components/TabBar";
import { VWLink } from "../../../components/Link";
import { textStyles } from "../../../themes/typography";
import { alertTextSx, infoAlertSx } from "../../RiskInheritanceGraph/reportStyles";
import InsightSection from "./InsightSection";
import HeatMapSection from "./HeatMapSection";
import BlastRadiusSection from "./BlastRadiusSection";
import DuplicatesSection from "./DuplicatesSection";
import CoverageSection from "./CoverageSection";

type SectionKey = "heatMap" | "blastRadius" | "duplicates" | "coverage";

const SECTIONS: {
  key: SectionKey;
  label: string;
  icon: "Grid3x3" | "Radar" | "Copy" | "ShieldCheck";
  description: string;
}[] = [
  {
    key: "heatMap",
    label: "Heat map",
    icon: "Grid3x3",
    description: "Vendor risks by likelihood and severity. Select a cell to filter the table.",
  },
  {
    key: "blastRadius",
    label: "Blast radius",
    icon: "Radar",
    description: "How many project risks and use cases inherit from the risks of each vendor.",
  },
  {
    key: "duplicates",
    label: "Duplicate vendor risks",
    icon: "Copy",
    description: "Risks of the same vendor that look like one risk entered twice.",
  },
  {
    key: "coverage",
    label: "Framework coverage",
    icon: "ShieldCheck",
    description: "Which vendor risks are not mapped to a framework yet.",
  },
];

const STORAGE_KEY = "vendor-risk-insights";

interface InsightsState {
  open: boolean;
  tab: SectionKey;
}

const CLOSED: InsightsState = { open: false, tab: "heatMap" };

/** Whether the panel was left open, and on which report. Per-browser convenience only. */
function readState(): InsightsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return CLOSED;
    const parsed = JSON.parse(raw) as Partial<InsightsState>;
    const tab = SECTIONS.some((s) => s.key === parsed.tab) ? (parsed.tab as SectionKey) : "heatMap";
    return { open: parsed.open === true, tab };
  } catch {
    return CLOSED;
  }
}

function writeState(state: InsightsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or blocked storage: the panel just starts closed next time.
  }
}

interface VendorRiskInsightsProps {
  risks: VendorRisk[];
  selectedCell: HeatMapCellRef | null;
  onSelectCell: (cell: HeatMapCellRef | null) => void;
  onOpenRisk: (vendorRiskId: number) => void;
}

/**
 * The analysis above the vendor risks table: one collapsible panel with a tab
 * per report, so closed it costs the table a single row. Only the open tab is
 * mounted, so the duplicate and coverage scans run once their tab is first
 * shown.
 */
export default function VendorRiskInsights({
  risks,
  selectedCell,
  onSelectCell,
  onOpenRisk,
}: VendorRiskInsightsProps) {
  const [state, setState] = useState<InsightsState>(readState);

  const update = useCallback((patch: Partial<InsightsState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      writeState(next);
      return next;
    });
  }, []);

  const active = SECTIONS.find((section) => section.key === state.tab) ?? SECTIONS[0];

  return (
    <Stack spacing={4}>
      <InsightSection
        title="Insights"
        description="Heat map, blast radius, duplicates and framework coverage of vendor risks."
        expanded={state.open}
        onToggle={(open) => update({ open })}
      >
        <TabContext value={state.tab}>
          <TabBar
            tabs={SECTIONS.map(({ key, label, icon }) => ({ label, value: key, icon }))}
            activeTab={state.tab}
            onChange={(_event, tab) => update({ tab: tab as SectionKey })}
          />
        </TabContext>
        <Typography sx={{ ...textStyles.body, color: "text.tertiary", mt: 6, mb: 8 }}>
          {active.description}
        </Typography>
        {state.tab === "heatMap" && (
          <HeatMapSection risks={risks} selectedCell={selectedCell} onSelectCell={onSelectCell} />
        )}
        {state.tab === "blastRadius" && <BlastRadiusSection />}
        {state.tab === "duplicates" && <DuplicatesSection onOpenRisk={onOpenRisk} />}
        {state.tab === "coverage" && <CoverageSection onOpenRisk={onOpenRisk} />}
      </InsightSection>

      {/* The table can be filtered by a cell while the panel is closed, so say so
          outside it, with the way back. */}
      {selectedCell && (
        <Box sx={{ ...infoAlertSx, mb: 0 }} role="status">
          <Filter size={16} />
          <Typography sx={alertTextSx}>
            The table shows only the risks in the selected heat map cell.
          </Typography>
          <Box sx={{ ml: "auto" }}>
            <VWLink onClick={() => onSelectCell(null)} showUnderline={false} showIcon={false}>
              Show all risks
            </VWLink>
          </Box>
        </Box>
      )}
    </Stack>
  );
}
