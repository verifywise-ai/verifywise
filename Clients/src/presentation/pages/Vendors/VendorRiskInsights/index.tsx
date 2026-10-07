import { useCallback, useState } from "react";
import { Stack } from "@mui/material";
import type { VendorRisk } from "../../../../domain/types/VendorRisk";
import type { HeatMapCellRef } from "../../../types/interfaces/i.risk";
import InsightSection from "./InsightSection";
import HeatMapSection from "./HeatMapSection";
import BlastRadiusSection from "./BlastRadiusSection";
import DuplicatesSection from "./DuplicatesSection";
import CoverageSection from "./CoverageSection";

type SectionKey = "heatMap" | "blastRadius" | "duplicates" | "coverage";

const STORAGE_KEY = "vendor-risk-insights-open";

/** Which sections this viewer left open. Per-browser convenience only. */
function readOpen(): Set<SectionKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as SectionKey[]) : []);
  } catch {
    return new Set();
  }
}

function writeOpen(open: Set<SectionKey>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
  } catch {
    // Private mode or blocked storage: the sections just start closed next time.
  }
}

interface VendorRiskInsightsProps {
  risks: VendorRisk[];
  selectedCell: HeatMapCellRef | null;
  onSelectCell: (cell: HeatMapCellRef | null) => void;
  onOpenRisk: (vendorRiskId: number) => void;
}

/**
 * The analysis above the vendor risks table. Each section is collapsed until
 * opened, and the duplicate and coverage scans only run once their section is
 * first opened.
 */
export default function VendorRiskInsights({
  risks,
  selectedCell,
  onSelectCell,
  onOpenRisk,
}: VendorRiskInsightsProps) {
  const [open, setOpen] = useState<Set<SectionKey>>(readOpen);

  const toggle = useCallback((key: SectionKey, expanded: boolean) => {
    setOpen((current) => {
      const next = new Set(current);
      if (expanded) next.add(key);
      else next.delete(key);
      writeOpen(next);
      return next;
    });
  }, []);

  return (
    <Stack spacing={4}>
      <InsightSection
        title="Heat map"
        description="Vendor risks by likelihood and severity. Select a cell to filter the table."
        expanded={open.has("heatMap")}
        onToggle={(expanded) => toggle("heatMap", expanded)}
      >
        <HeatMapSection risks={risks} selectedCell={selectedCell} onSelectCell={onSelectCell} />
      </InsightSection>
      <InsightSection
        title="Blast radius"
        description="How many project risks and use cases inherit from the risks of each vendor."
        expanded={open.has("blastRadius")}
        onToggle={(expanded) => toggle("blastRadius", expanded)}
      >
        <BlastRadiusSection />
      </InsightSection>
      <InsightSection
        title="Duplicate vendor risks"
        description="Risks of the same vendor that look like one risk entered twice."
        expanded={open.has("duplicates")}
        onToggle={(expanded) => toggle("duplicates", expanded)}
      >
        <DuplicatesSection onOpenRisk={onOpenRisk} />
      </InsightSection>
      <InsightSection
        title="Framework coverage"
        description="Which vendor risks are not mapped to a framework yet."
        expanded={open.has("coverage")}
        onToggle={(expanded) => toggle("coverage", expanded)}
      >
        <CoverageSection onOpenRisk={onOpenRisk} />
      </InsightSection>
    </Stack>
  );
}
