import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { Info } from "lucide-react";
import { useNavigate } from "react-router";
import { useVendorExposure } from "../../../../application/hooks/useRiskLinks";
import { useIsAdmin } from "../../../../application/hooks/useIsAdmin";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type { VendorExposureSummary } from "../../../../domain/interfaces/i.riskLink";
import { VWLink } from "../../../components/Link";
import ReportTable, { type ReportColumn } from "../../RiskInheritanceGraph/ReportTable";
import { summariseTerms } from "../../RiskInheritanceGraph/DuplicateCandidates";
import { captionSx } from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import {
  alertTextSx,
  infoAlertSx,
  numericCellSx,
  riskNameSx,
  summaryGridSx,
  summaryLabelSx,
  summaryTileSx,
  summaryValueSx,
  wrapCellSx,
} from "../../RiskInheritanceGraph/reportStyles";
import { fill } from "../../../../i18n/fill";
import { ReportError, ReportLoading } from "./ReportState";

/**
 * Blast radius: for each vendor, how many project risks inherit from its risks
 * and which use cases they sit in. Built from confirmed value-chain links only;
 * open suggestions are counted beside the reach, never inside it.
 */
export default function BlastRadiusSection() {
  const { data, isLoading, error } = useVendorExposure();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const totals = useMemo(() => {
    if (!data) return null;
    const useCases = new Set<number>();
    for (const vendor of data.vendors) for (const u of vendor.use_cases) useCases.add(u.id);
    return {
      vendorsWithReach: data.vendors.filter((v) => v.inheriting_risks > 0).length,
      // One confirmed parent per child, so per-vendor counts never overlap.
      inheriting: data.vendors.reduce((sum, v) => sum + v.inheriting_risks, 0),
      useCases: useCases.size,
      unlinked: data.risks.filter((r) => r.children === 0).length,
    };
  }, [data]);

  const columns = useMemo<ReportColumn<VendorExposureSummary>[]>(
    () => [
      {
        id: "vendor",
        label: "Vendor",
        sortable: true,
        sortValue: (v) => v.vendor_name,
        render: (v) => (
          <Typography sx={riskNameSx}>
            {v.vendor_name ?? fill(t("Vendor {id}"), { id: v.vendor_id })}
          </Typography>
        ),
      },
      {
        id: "vendorRisks",
        label: "Vendor risks with children",
        sortable: true,
        sortValue: (v) => v.linked_vendor_risks,
        cellSx: numericCellSx,
        render: (v) =>
          fill(t("{linked} of {total}"), { linked: v.linked_vendor_risks, total: v.vendor_risks }),
      },
      {
        id: "inheriting",
        label: "Inheriting project risks",
        sortable: true,
        sortValue: (v) => v.inheriting_risks,
        cellSx: numericCellSx,
        render: (v) => v.inheriting_risks,
      },
      {
        id: "useCases",
        label: "Affected use cases",
        sortable: true,
        sortValue: (v) => v.use_cases.length,
        cellSx: wrapCellSx,
        render: (v) =>
          summariseTerms(
            v.use_cases.map((u) => u.name),
            t("more"),
          ),
      },
      {
        id: "suggested",
        label: "Suggested",
        sortable: true,
        sortValue: (v) => v.suggested,
        cellSx: numericCellSx,
        render: (v) => v.suggested,
      },
      // The map is admin-only, so the way into it is too.
      ...(isAdmin
        ? [
            {
              id: "map",
              label: "",
              sortable: false,
              render: (v: VendorExposureSummary) =>
                v.inheriting_risks + v.suggested > 0 ? (
                  <VWLink
                    onClick={() => navigate(`/risk-inheritance?vendor=${v.vendor_id}`)}
                    showUnderline={false}
                    showIcon={false}
                  >
                    View on map
                  </VWLink>
                ) : null,
            },
          ]
        : []),
    ],
    [isAdmin, navigate, t],
  );

  if (isLoading) return <ReportLoading />;
  if (error) return <ReportError message={(error as Error).message} />;
  if (!data || !totals || data.risks.length === 0) {
    return <Typography sx={captionSx}>No vendor risks yet.</Typography>;
  }

  return (
    <>
      <Box sx={summaryGridSx}>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>Vendors with reach</Typography>
          <Typography sx={summaryValueSx}>{totals.vendorsWithReach.toLocaleString()}</Typography>
        </Box>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>Inheriting project risks</Typography>
          <Typography sx={summaryValueSx}>{totals.inheriting.toLocaleString()}</Typography>
        </Box>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>Affected use cases</Typography>
          <Typography sx={summaryValueSx}>{totals.useCases.toLocaleString()}</Typography>
        </Box>
        <Box sx={summaryTileSx}>
          <Typography sx={summaryLabelSx}>Vendor risks with no children</Typography>
          <Typography sx={summaryValueSx}>{totals.unlinked.toLocaleString()}</Typography>
        </Box>
      </Box>

      {totals.inheriting === 0 && (
        <Box sx={infoAlertSx} role="status">
          <Info size={16} />
          <Typography sx={alertTextSx}>
            No project risk inherits from a vendor risk yet. Open a vendor risk and link the project
            risks it applies to from its Linked risks tab.
          </Typography>
        </Box>
      )}

      <ReportTable
        columns={columns}
        rows={data.vendors}
        getRowKey={(v) => v.vendor_id}
        storageKey="vendor-risk-insights-blast-radius"
        defaultSortColumn="inheriting"
        entityLabel="vendor"
      />
    </>
  );
}
