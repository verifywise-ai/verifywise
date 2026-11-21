import { useCallback, useState } from "react";
import { Stack, Typography } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import type { VendorRisk } from "../../../../domain/types/VendorRisk";
import type { HeatMapCellRef } from "../../../types/interfaces/i.risk";
import TabBar from "../../../components/TabBar";
import CustomizableSkeleton from "../../../components/Skeletons";
import { textStyles } from "../../../themes/typography";
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
    description:
      "Vendor risks by likelihood and severity. Select a cell to see its risks in the Risks tab.",
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

/** The report the tab was left on. Per-browser convenience only. */
function readTab(): SectionKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "heatMap";
    const parsed = JSON.parse(raw) as { tab?: unknown };
    return SECTIONS.find((s) => s.key === parsed.tab)?.key ?? "heatMap";
  } catch {
    return "heatMap";
  }
}

function writeTab(tab: SectionKey) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab }));
  } catch {
    // Private mode or blocked storage: the tab just starts on the heat map next time.
  }
}

interface VendorRiskInsightsProps {
  risks: VendorRisk[];
  /** Whether the risks are still being read. Only the heat map waits for them. */
  loading?: boolean;
  selectedCell: HeatMapCellRef | null;
  onSelectCell: (cell: HeatMapCellRef | null) => void;
  onOpenRisk: (vendorRiskId: number) => void;
}

/**
 * The content of the Insights tab: one report at a time, chosen by a tab per report. Only the
 * report on screen is mounted, so the duplicate and coverage scans run once their report is first
 * shown.
 */
export default function VendorRiskInsights({
  risks,
  loading = false,
  selectedCell,
  onSelectCell,
  onOpenRisk,
}: VendorRiskInsightsProps) {
  const [tab, setTab] = useState<SectionKey>(readTab);

  const select = useCallback((next: SectionKey) => {
    setTab(next);
    writeTab(next);
  }, []);

  const active = SECTIONS.find((section) => section.key === tab) ?? SECTIONS[0];

  return (
    <Stack>
      <TabContext value={tab}>
        <TabBar
          tabs={SECTIONS.map(({ key, label, icon }) => ({ label, value: key, icon }))}
          activeTab={tab}
          onChange={(_event, next) => select(next as SectionKey)}
        />
      </TabContext>
      <Typography sx={{ ...textStyles.body, color: "text.tertiary", mt: 6, mb: 8 }}>
        {active.description}
      </Typography>
      {tab === "heatMap" &&
        (loading ? (
          <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
        ) : (
          <HeatMapSection risks={risks} selectedCell={selectedCell} onSelectCell={onSelectCell} />
        ))}
      {tab === "blastRadius" && <BlastRadiusSection />}
      {tab === "duplicates" && <DuplicatesSection onOpenRisk={onOpenRisk} />}
      {tab === "coverage" && <CoverageSection onOpenRisk={onOpenRisk} />}
    </Stack>
  );
}
