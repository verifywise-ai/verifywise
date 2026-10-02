import { useMemo } from "react";
import RiskHeatMap from "../../../components/RiskVisualization/RiskHeatMap";
import type { HeatMapCellRef, HeatMapRisk } from "../../../types/interfaces/i.risk";
import type { VendorRisk } from "../../../../domain/types/VendorRisk";

const LIKELIHOOD_ORDER = ["rare", "unlikely", "possible", "likely", "almost certain"];
const SEVERITY_ORDER = ["negligible", "minor", "moderate", "major", "catastrophic"];

/** Position on the heat map's 1-5 scales, with the same reading RiskHeatMap uses. */
export function heatPosition(likelihood: string, severity: string): HeatMapCellRef {
  const l = LIKELIHOOD_ORDER.indexOf((likelihood ?? "").toLowerCase());
  const raw = (severity ?? "").toLowerCase();
  const v = SEVERITY_ORDER.indexOf(raw === "critical" ? "catastrophic" : raw);
  // RiskHeatMap files anything it cannot read under 1; so does this.
  return { likelihood: l === -1 ? 1 : l + 1, severity: v === -1 ? 1 : v + 1 };
}

/** Whether a vendor risk sits in the selected heat map cell. */
export function matchesHeatCell(risk: VendorRisk, cell: HeatMapCellRef): boolean {
  const position = heatPosition(risk.likelihood, risk.risk_severity);
  return position.likelihood === cell.likelihood && position.severity === cell.severity;
}

interface HeatMapSectionProps {
  /** The page's rows, one per (risk, use case); plotted once per risk. */
  risks: VendorRisk[];
  selectedCell: HeatMapCellRef | null;
  onSelectCell: (cell: HeatMapCellRef | null) => void;
}

/**
 * Vendor risks on the same likelihood × severity grid the project risks view
 * uses. Selecting a cell filters the table below; selecting it again clears.
 */
export default function HeatMapSection({ risks, selectedCell, onSelectCell }: HeatMapSectionProps) {
  const plotted = useMemo<HeatMapRisk[]>(() => {
    const seen = new Set<number>();
    const out: HeatMapRisk[] = [];
    for (const risk of risks) {
      if (risk.risk_id === undefined || seen.has(risk.risk_id)) continue;
      seen.add(risk.risk_id);
      out.push({
        id: risk.risk_id,
        risk_name: risk.risk_description,
        likelihood: risk.likelihood,
        severity: risk.risk_severity,
      });
    }
    return out;
  }, [risks]);

  // The panel's tab description says what a cell does; no second caption here.
  return (
    <>
      <RiskHeatMap
        risks={plotted}
        selectedCell={selectedCell}
        onCellSelect={(cell) =>
          onSelectCell(
            selectedCell &&
              selectedCell.likelihood === cell.likelihood &&
              selectedCell.severity === cell.severity
              ? null
              : cell,
          )
        }
      />
    </>
  );
}
