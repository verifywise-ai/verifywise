import { FC } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../Modals/StandardModal";
import Chip from "../Chip";
import { CustomizableButton } from "../button/customizable-button";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { RelatedRisk } from "../../../application/tools/relatedRisks";

interface RelatedRisksSummaryProps {
  /** The risk the user just saved. */
  subject: RiskModel;
  /** Scored matches, best first. The caller only renders this when non-empty. */
  related: RelatedRisk[];
  onClose: () => void;
  onOpenRisk: (risk: RiskModel) => void;
}

/**
 * Read-only summary shown after a risk is created or updated: the other risks
 * that share signals with it, why they matched, and what to look at. Opening a
 * row hands the risk back to the page, which opens it in the risk form.
 */
const RelatedRisksSummary: FC<RelatedRisksSummaryProps> = ({
  subject,
  related,
  onClose,
  onOpenRisk,
}) => (
  <StandardModal
    isOpen
    onClose={onClose}
    title="Risks that may be affected"
    description={`"${subject.risk_name}" was saved. These risks share signals with it — review whether they need an update.`}
    cancelButtonText="Close"
    hideSubmitButton
    fitContent
    maxWidth="760px"
  >
    <Stack spacing={4}>
      {related.map(({ risk, reasons, recommendation }) => (
        <Stack
          key={risk.id}
          spacing={2}
          sx={{
            border: "1px solid #EAECF0",
            borderRadius: "4px",
            padding: "12px",
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{risk.risk_name}</Typography>
              {risk.risk_level_autocalculated && (
                <Chip label={risk.risk_level_autocalculated} size="small" />
              )}
            </Stack>
            <CustomizableButton
              variant="text"
              text="Open"
              onClick={() => onOpenRisk(risk)}
              sx={{ minWidth: "auto" }}
            />
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            {reasons.map((reason) => (
              <Chip key={reason} label={reason} variant="default" size="small" />
            ))}
          </Stack>
          <Typography sx={{ fontSize: 13, color: "#475467" }}>{recommendation}</Typography>
        </Stack>
      ))}
    </Stack>
  </StandardModal>
);

export default RelatedRisksSummary;
