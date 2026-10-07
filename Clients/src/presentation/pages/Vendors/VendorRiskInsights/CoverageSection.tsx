import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { Info, ShieldCheck } from "lucide-react";
import { useVendorFrameworkCoverage } from "../../../../application/hooks/useRiskLinks";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type { VendorCoverageRisk } from "../../../../domain/interfaces/i.riskLink";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import ReportTable, { type ReportColumn } from "../../RiskInheritanceGraph/ReportTable";
import { listHeading } from "../../RiskInheritanceGraph/ControlCoverage";
import { useOwnerName } from "../../RiskInheritanceGraph/useOwnerName";
import { blockHeadingSx, captionSx } from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import {
  alertTextSx,
  infoAlertSx,
  riskMetaSx,
  successAlertSx,
  summaryGridSx,
  summaryLabelSx,
  summaryTileSx,
  summaryValueSx,
  wrapCellSx,
} from "../../RiskInheritanceGraph/reportStyles";
import { fill } from "../../../../i18n/fill";
import { ReportError, ReportLoading } from "./ReportState";

/** Vendor risk levels are words ("High", "Very high risk"); rank them, never sort alphabetically. */
export function vendorLevelRank(level: string | null): number | null {
  const value = (level ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("very high") || value.includes("critical")) return 5;
  if (value.includes("high")) return 4;
  if (value.includes("medium") || value.includes("moderate")) return 3;
  if (value.includes("very low")) return 1;
  if (value.includes("low")) return 2;
  return 0;
}

interface CoverageSectionProps {
  onOpenRisk: (vendorRiskId: number) => void;
}

/**
 * Which vendor risks are not mapped to a framework, split the way the control
 * coverage report splits project risks: a gap is an unmapped risk whose vendor
 * serves a use case that has a framework attached; with no framework anywhere
 * in reach there is nothing to map to yet, which is not a finding.
 */
export default function CoverageSection({ onOpenRisk }: CoverageSectionProps) {
  const { data, isLoading, error } = useVendorFrameworkCoverage();
  const ownerName = useOwnerName();
  const { t } = useTranslation();

  const [gapColumns, noFrameworkColumns] = useMemo(() => {
    const base: ReportColumn<VendorCoverageRisk>[] = [
      {
        id: "risk",
        label: "Risk",
        sortable: true,
        sortValue: (r) => r.risk_description,
        cellSx: wrapCellSx,
        render: (r) => (
          <>
            <VWLink onClick={() => onOpenRisk(r.id)} showUnderline={false} showIcon={false}>
              {r.risk_description || fill(t("Vendor risk {id}"), { id: r.id })}
            </VWLink>
            <Typography sx={riskMetaSx}>
              #{r.id} · {ownerName(r.action_owner)}
            </Typography>
          </>
        ),
      },
      {
        id: "vendor",
        label: "Vendor",
        sortable: true,
        sortValue: (r) => r.vendor.name,
        render: (r) => r.vendor.name ?? "—",
      },
      {
        id: "level",
        label: "Level",
        sortable: true,
        sortValue: (r) => vendorLevelRank(r.risk_level),
        render: (r) => (r.risk_level ? <Chip label={r.risk_level} size="small" /> : "—"),
      },
    ];
    const available: ReportColumn<VendorCoverageRisk> = {
      id: "available",
      label: "Frameworks in its use cases",
      sortable: true,
      sortValue: (r) => r.available_frameworks.join(", "),
      cellSx: wrapCellSx,
      render: (r) => r.available_frameworks.join(", "),
    };
    return [[...base, available], base];
  }, [onOpenRisk, ownerName, t]);

  if (isLoading) return <ReportLoading />;
  if (error) return <ReportError message={(error as Error).message} />;
  if (!data || data.summary.total_active_risks === 0) {
    return <Typography sx={captionSx}>No vendor risks yet.</Typography>;
  }

  const { summary, gaps, no_framework: noFramework } = data;

  return (
    <>
      <Box sx={summaryGridSx}>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>Active vendor risks</Typography>
          <Typography sx={summaryValueSx}>{summary.total_active_risks.toLocaleString()}</Typography>
        </Box>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>Mapped to a framework</Typography>
          <Typography sx={summaryValueSx}>{summary.mapped.toLocaleString()}</Typography>
        </Box>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>Coverage gaps</Typography>
          <Typography sx={summaryValueSx}>{summary.gap.toLocaleString()}</Typography>
        </Box>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>No framework yet</Typography>
          <Typography sx={summaryValueSx}>{summary.no_framework.toLocaleString()}</Typography>
        </Box>
      </Box>

      {data.truncated && (
        <Box sx={infoAlertSx} role="status">
          <Info size={16} />
          <Typography sx={alertTextSx}>
            More risks matched than a single report lists. The counts above are complete; the tables
            below show the worst of each list.
          </Typography>
        </Box>
      )}

      {summary.gap === 0 && summary.no_framework === 0 ? (
        <Box sx={successAlertSx} role="status">
          <ShieldCheck size={16} />
          <Typography sx={alertTextSx}>
            Every active vendor risk is mapped to at least one framework.
          </Typography>
        </Box>
      ) : (
        <>
          {gaps.length > 0 && (
            <>
              <Typography sx={blockHeadingSx}>
                {listHeading(t("Coverage gaps"), gaps.length, summary.gap, t("of"))}
              </Typography>
              <Typography sx={captionSx}>
                The vendor serves a use case that has a framework attached, but these risks are not
                mapped to any framework. Map them from the risk itself.
              </Typography>
              <ReportTable
                columns={gapColumns}
                rows={gaps}
                getRowKey={(r) => r.id}
                storageKey="vendor-risk-insights-coverage-gaps"
                defaultSortColumn="level"
                entityLabel="risk"
              />
            </>
          )}
          {noFramework.length > 0 && (
            <>
              <Typography sx={blockHeadingSx}>
                {listHeading(
                  t("No framework yet"),
                  noFramework.length,
                  summary.no_framework,
                  t("of"),
                )}
              </Typography>
              <Typography sx={captionSx}>
                None of the use cases these vendors serve has a framework attached, so there is
                nothing to map to. Not a finding: attach a framework to the use case first.
              </Typography>
              <ReportTable
                columns={noFrameworkColumns}
                rows={noFramework}
                getRowKey={(r) => r.id}
                storageKey="vendor-risk-insights-coverage-no-framework"
                defaultSortColumn="level"
                entityLabel="risk"
              />
            </>
          )}
        </>
      )}
    </>
  );
}
