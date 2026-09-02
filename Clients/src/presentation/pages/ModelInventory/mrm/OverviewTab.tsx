import { useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import { MrmFindingSeverity, MrmTier } from "../../../../domain/enums/mrm.enum";
import { IMrmAttestationSummary } from "../../../../domain/interfaces/i.mrm";
import { useAttestationSummary } from "../../../../application/hooks/useMrm";
import { downloadAttestationReport } from "../../../../application/repository/mrm.repository";
import {
  attestationStatusChipVariant,
  attestationStatusLabel,
  mrmErrorMessage,
  tierChipVariant,
  tierLabel,
} from "./constants";
import {
  mrmCardLabelStyle,
  mrmCardNoteStyle,
  mrmCardNumberStyle,
  mrmCardStyle,
  mrmCardsStyle,
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
  mrmToolbarStyle,
} from "./mrmStyles";

interface OverviewTabProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const TIER_ORDER: MrmTier[] = [MrmTier.TIER_1, MrmTier.TIER_2, MrmTier.TIER_3];

/** "2 · 1 · 2" — models in tier 1 · 2 · 3. */
const modelsByTierText = (summary: IMrmAttestationSummary): string =>
  TIER_ORDER.map((tier) => summary.models_by_tier[tier] ?? 0).join(" · ");

/** Validation coverage % = validated / total models (0 when no models). */
const coveragePercent = (summary: IMrmAttestationSummary): number => {
  if (summary.models_total === 0) return 0;
  return Math.round((summary.validation_coverage.validated / summary.models_total) * 100);
};

const findingsBreakdownText = (summary: IMrmAttestationSummary): string => {
  const s = summary.open_findings_by_severity;
  const parts: string[] = [];
  if (s[MrmFindingSeverity.CRITICAL]) parts.push(`${s[MrmFindingSeverity.CRITICAL]} critical`);
  if (s[MrmFindingSeverity.HIGH]) parts.push(`${s[MrmFindingSeverity.HIGH]} high`);
  if (s[MrmFindingSeverity.MEDIUM]) parts.push(`${s[MrmFindingSeverity.MEDIUM]} medium`);
  if (s[MrmFindingSeverity.LOW]) parts.push(`${s[MrmFindingSeverity.LOW]} low`);
  return parts.length ? parts.join(" · ") : "No open findings";
};

const totalOpenFindings = (summary: IMrmAttestationSummary): number => {
  const s = summary.open_findings_by_severity;
  return (
    (s[MrmFindingSeverity.CRITICAL] ?? 0) +
    (s[MrmFindingSeverity.HIGH] ?? 0) +
    (s[MrmFindingSeverity.MEDIUM] ?? 0) +
    (s[MrmFindingSeverity.LOW] ?? 0)
  );
};

const OverviewTab = ({ onError, onSuccess }: OverviewTabProps) => {
  const { data: summary, isLoading, isError } = useAttestationSummary();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      await downloadAttestationReport();
      onSuccess("Attestation report generated");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to generate attestation report"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Box>
      <Box sx={mrmToolbarStyle}>
        <Typography sx={{ ...mrmSectionIntroStyle, marginBottom: 0, maxWidth: "640px" }}>
          Model risk overview. Fleet-wide view of whether tiering is up to date, validation status
          and open findings — the portfolio summary that has no home on a single model record. Feeds
          the inventory attestation report.
        </Typography>
        <CustomizableButton
          variant="contained"
          text="Generate attestation report"
          onClick={handleGenerateReport}
          isDisabled={isGenerating || isLoading || !summary}
          testId="mrm-generate-attestation-btn"
        />
      </Box>

      {isLoading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={280} />
      ) : isError || !summary ? (
        <EmptyState message="Could not load the portfolio summary. Try again shortly." />
      ) : summary.models_total === 0 ? (
        <EmptyState message="No models in the inventory yet. Add models and assign tiers to build the portfolio summary." />
      ) : (
        <>
          <Box sx={mrmCardsStyle}>
            <Box sx={mrmCardStyle}>
              <Typography sx={mrmCardLabelStyle}>Models by tier</Typography>
              <Typography sx={mrmCardNumberStyle}>{modelsByTierText(summary)}</Typography>
              <Typography sx={mrmCardNoteStyle}>Tier 1 · 2 · 3</Typography>
            </Box>
            <Box sx={mrmCardStyle}>
              <Typography sx={mrmCardLabelStyle}>Validation coverage</Typography>
              <Typography sx={mrmCardNumberStyle}>{coveragePercent(summary)}%</Typography>
              <Typography sx={mrmCardNoteStyle}>
                {summary.validation_coverage.validated} validated ·{" "}
                {summary.validation_coverage.in_review} in review of {summary.models_total}
              </Typography>
            </Box>
            <Box sx={mrmCardStyle}>
              <Typography sx={mrmCardLabelStyle}>Overdue validations</Typography>
              <Typography
                sx={{
                  ...mrmCardNumberStyle,
                  color: summary.overdue_validations > 0 ? "error.main" : "text.primary",
                }}
              >
                {summary.overdue_validations}
              </Typography>
              <Typography sx={mrmCardNoteStyle}>Past their next due date</Typography>
            </Box>
            <Box sx={mrmCardStyle}>
              <Typography sx={mrmCardLabelStyle}>Open findings</Typography>
              <Typography sx={mrmCardNumberStyle}>{totalOpenFindings(summary)}</Typography>
              <Typography sx={mrmCardNoteStyle}>{findingsBreakdownText(summary)}</Typography>
            </Box>
          </Box>

          <TableContainer sx={mrmTableContainerStyle}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={mrmTableHeadCellStyle}>Tier</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Models</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Tiering up to date</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Validated</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Monitoring active</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Open findings</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Attestation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.per_tier.length === 0 ? (
                  <TableRow>
                    <TableCell sx={mrmTableCellStyle} colSpan={7}>
                      No tiered models yet. Assign tiers on the Tiering tab.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.per_tier.map((row) => (
                    <TableRow key={row.tier}>
                      <TableCell sx={mrmTableCellStyle}>
                        <Chip
                          label={tierLabel(row.tier)}
                          variant={tierChipVariant(row.tier)}
                          uppercase={false}
                        />
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>{row.models}</TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        {row.tiering_current} / {row.models}
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        {row.validated} / {row.models}
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        {row.monitoring_active} / {row.models}
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>{row.open_findings}</TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        <Chip
                          label={attestationStatusLabel(row.attestation_status)}
                          variant={attestationStatusChipVariant(row.attestation_status)}
                          uppercase={false}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              gap: "8px",
              marginTop: "16px",
            }}
          >
            <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>
              Fleet attestation status
            </Typography>
            <Chip
              label={attestationStatusLabel(summary.attestation_status)}
              variant={attestationStatusChipVariant(summary.attestation_status)}
              uppercase={false}
            />
          </Stack>
        </>
      )}
    </Box>
  );
};

export default OverviewTab;
