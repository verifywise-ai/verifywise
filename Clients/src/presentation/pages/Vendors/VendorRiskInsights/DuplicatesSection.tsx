import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { Info } from "lucide-react";
import { useVendorDuplicateCandidates } from "../../../../application/hooks/useRiskLinks";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type { VendorDuplicateCandidate } from "../../../../domain/interfaces/i.riskLink";
import { VWLink } from "../../../components/Link";
import ReportTable, { type ReportColumn } from "../../RiskInheritanceGraph/ReportTable";
import { similarityPercent, summariseTerms } from "../../RiskInheritanceGraph/DuplicateCandidates";
import { useOwnerName } from "../../RiskInheritanceGraph/useOwnerName";
import {
  barFillSx,
  barTrackSx,
  captionSx,
  rateCellSx,
} from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import {
  alertTextSx,
  infoAlertSx,
  metricLabelSx,
  riskMetaSx,
  successAlertSx,
  wrapCellSx,
} from "../../RiskInheritanceGraph/reportStyles";
import { fill } from "../../../../i18n/fill";
import { ReportError, ReportLoading } from "./ReportState";

interface DuplicatesSectionProps {
  onOpenRisk: (vendorRiskId: number) => void;
}

/**
 * Pairs of one vendor's risks that read like the same risk entered twice. The
 * pair links to both risks; cleaning up is a human decision, so nothing here
 * merges or deletes.
 */
export default function DuplicatesSection({ onOpenRisk }: DuplicatesSectionProps) {
  const { data, isLoading, error } = useVendorDuplicateCandidates();
  const ownerName = useOwnerName();
  const { t } = useTranslation();

  const columns = useMemo<ReportColumn<VendorDuplicateCandidate>[]>(() => {
    const riskCell = (risk: VendorDuplicateCandidate["risk_a"]) => (
      <>
        <VWLink onClick={() => onOpenRisk(risk.id)} showUnderline={false} showIcon={false}>
          {risk.risk_description || fill(t("Vendor risk {id}"), { id: risk.id })}
        </VWLink>
        <Typography sx={riskMetaSx}>
          #{risk.id} · {ownerName(risk.action_owner)}
        </Typography>
      </>
    );
    return [
      {
        id: "vendor",
        label: "Vendor",
        sortable: true,
        sortValue: (c) => c.vendor.name,
        render: (c) => c.vendor.name ?? fill(t("Vendor {id}"), { id: c.vendor.id }),
      },
      {
        id: "risk",
        label: "Risk",
        sortable: true,
        sortValue: (c) => c.risk_a.risk_description,
        cellSx: wrapCellSx,
        render: (c) => riskCell(c.risk_a),
      },
      {
        id: "duplicateOf",
        label: "Possible duplicate of",
        sortable: true,
        sortValue: (c) => c.risk_b.risk_description,
        cellSx: wrapCellSx,
        render: (c) => riskCell(c.risk_b),
      },
      {
        id: "similarity",
        label: "Similarity",
        sortable: true,
        sortValue: (c) => c.similarity,
        render: (c) => {
          const percent = similarityPercent(c.similarity);
          return (
            <Box sx={rateCellSx}>
              <Box sx={barTrackSx}>
                <Box sx={barFillSx(percent)} />
              </Box>
              <Typography
                sx={metricLabelSx}
                aria-label={fill(t("{percent} percent similar"), { percent })}
              >
                {percent}%
              </Typography>
            </Box>
          );
        },
      },
      {
        id: "sharedTokens",
        label: "Words in common",
        sortable: true,
        sortValue: (c) => c.shared_tokens.length,
        cellSx: wrapCellSx,
        render: (c) => summariseTerms(c.shared_tokens, t("more")),
      },
    ];
  }, [onOpenRisk, ownerName, t]);

  if (isLoading) return <ReportLoading />;
  if (error) return <ReportError message={(error as Error).message} />;
  if (!data) return null;

  return (
    <>
      <Typography sx={captionSx}>
        {fill(t("{scanned} vendor risks scanned, {compared} pairs compared."), {
          scanned: data.scanned.toLocaleString(),
          compared: data.compared.toLocaleString(),
        })}{" "}
        Only risks of the same vendor are compared: the same risk at two vendors is a pattern, not a
        duplicate.
      </Typography>

      {data.truncated && (
        <Box sx={infoAlertSx} role="status">
          <Info size={16} />
          <Typography sx={alertTextSx}>
            This scan hit its size limit, so the list below is a sample rather than every pair.
          </Typography>
        </Box>
      )}

      {data.candidates.length === 0 ? (
        <Box sx={successAlertSx} role="status">
          <Info size={16} />
          <Typography sx={alertTextSx}>No likely duplicates among vendor risks.</Typography>
        </Box>
      ) : (
        <ReportTable
          columns={columns}
          rows={data.candidates}
          getRowKey={(c) => `${c.risk_a.id}:${c.risk_b.id}`}
          storageKey="vendor-risk-insights-duplicates"
          defaultSortColumn="similarity"
          entityLabel="pair"
        />
      )}
    </>
  );
}
