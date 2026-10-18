import { useState } from "react";
import {
  Alert,
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Download, FileText } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import {
  describeAedtError,
  downloadAedtStance,
  type AedtStanceRow,
} from "../../../application/repository/aedtBiasAudit.repository";
import { palette } from "../../themes/palette";
import { triggerBrowserDownload } from "../../utils/browserDownload.utils";
import EducationPanel from "./EducationPanel";
import PersonLabel from "./PersonLabel";
import { cellSx, headSx, tableFrameSx, titleSx, twoColumnSx } from "./styles";

export interface StancePanelProps {
  /** "run" for a run's stances; "scope" for scope determinations from the profile. */
  kind: "run" | "scope";
  stances: Array<AedtStanceRow & { isCurrent?: boolean }>;
  /** Null when a new one may be generated; otherwise why not. */
  generateBlockedReason: string | null;
  onGenerate: () => void;
  isGenerating: boolean;
  /** The server's message for a refused generation (422 and the rest). */
  generateError: string | null;
}

interface DownloadError {
  status: number | null;
  message: string;
  /** The stance whose download failed. */
  stanceId: number;
}

/**
 * The stances generated for a run, or the scope determinations generated
 * from an attested profile. A stance is immutable: generating again files a
 * new version and leaves the earlier ones readable.
 */
const StancePanel = ({
  kind,
  stances,
  generateBlockedReason,
  onGenerate,
  isGenerating,
  generateError,
}: StancePanelProps) => {
  const formatDate = useFormattedDate();
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<DownloadError | null>(null);

  const handleDownload = async (stanceId: number) => {
    setDownloading(stanceId);
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadAedtStance(stanceId);
      triggerBrowserDownload(blob, filename);
    } catch (error) {
      setDownloadError({ ...describeAedtError(error), stanceId });
    } finally {
      setDownloading(null);
    }
  };

  // A run's stance is generated again from the same run. A scope
  // determination is generated from the CURRENT attested profile, so only the
  // current one can be regenerated. Read from the stances as they are now, so
  // a re-attestation after the failure withdraws the offer.
  const failedStance = downloadError
    ? stances.find((s) => s.id === downloadError.stanceId)
    : undefined;
  // A stance no longer listed says nothing about what it cited: no offer,
  // and no claim about attestation.
  const failedStanceGone = downloadError !== null && failedStance === undefined;
  const canRegenerate = !failedStanceGone && (kind === "run" || failedStance?.isCurrent === true);

  const generateText = kind === "run" ? "Generate stance" : "Generate scope determination";
  const canGenerate = generateBlockedReason === null;

  // What a failed download shows. The server's 410 text says to generate the
  // stance again, so it appears only where the button does.
  type DownloadVariant = "error" | "regenerate" | "gone" | "superseded";
  const variant: DownloadVariant | null = !downloadError
    ? null
    : downloadError.status !== 410
      ? "error"
      : failedStanceGone
        ? "gone"
        : !canRegenerate
          ? "superseded"
          : canGenerate
            ? "regenerate"
            : "gone";

  const renderDownloadError = () => {
    switch (variant) {
      case "error":
        return <Typography sx={{ fontSize: 13 }}>{downloadError?.message}</Typography>;
      case "regenerate":
        return (
          <>
            <Typography sx={{ fontSize: 13 }}>{downloadError?.message}</Typography>
            <Box sx={{ mt: "8px" }}>
              <CustomizableButton
                variant="outlined"
                size="small"
                text="Generate it again"
                testId="aedt-regenerate-stance"
                onClick={onGenerate}
                isDisabled={isGenerating}
              />
            </Box>
          </>
        );
      // The stance is no longer listed, or this viewer cannot generate (the
      // reason already shows under the disabled button): nothing more to say.
      case "gone":
        return (
          <Typography sx={{ fontSize: 13 }} data-testid="stance-file-gone">
            The file is no longer stored.
          </Typography>
        );
      case "superseded":
        return (
          <Typography sx={{ fontSize: 13 }} data-testid="stance-not-regenerable">
            This scope determination cites an earlier attestation, so generating it again would cite
            the current one instead. Its file is no longer stored.
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <Stack gap="16px">
      <Box sx={twoColumnSx}>
        <Stack gap="12px">
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap="8px">
            <Typography sx={titleSx}>
              {kind === "run" ? "Stances" : "Scope determinations"}
            </Typography>
            <CustomizableButton
              variant="contained"
              text={generateText}
              testId={kind === "run" ? "aedt-generate-stance" : "aedt-generate-scope"}
              startIcon={<FileText size={14} strokeWidth={1.5} />}
              onClick={onGenerate}
              isDisabled={!canGenerate || isGenerating}
              loading={isGenerating}
            />
          </Stack>
          {generateBlockedReason && (
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              {generateBlockedReason}
            </Typography>
          )}
          {generateError && (
            <Alert severity="error" sx={{ borderRadius: "4px" }}>
              {generateError}
            </Alert>
          )}
          {downloadError && (
            <Alert
              severity={downloadError.status === 410 ? "warning" : "error"}
              sx={{ borderRadius: "4px" }}
            >
              {renderDownloadError()}
            </Alert>
          )}

          {stances.length === 0 ? (
            <EmptyState
              icon={FileText}
              message={
                kind === "run"
                  ? "No stance has been generated for this run yet."
                  : "No scope determination has been generated yet."
              }
              showBorder
            />
          ) : (
            <Box sx={tableFrameSx}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headSx}>Version</TableCell>
                    <TableCell sx={headSx}>Generated</TableCell>
                    <TableCell sx={headSx}>Generated by</TableCell>
                    <TableCell sx={headSx}>Profile version</TableCell>
                    <TableCell sx={headSx}>SHA-256</TableCell>
                    <TableCell sx={headSx} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stances.map((s) => (
                    <TableRow key={s.id} data-testid={`stance-row-${s.id}`}>
                      <TableCell sx={cellSx}>
                        <Stack gap="2px">
                          <span>{`v${s.version}`}</span>
                          {kind === "scope" && s.isCurrent === false && (
                            <Typography sx={{ fontSize: 11, color: palette.status.warning.text }}>
                              Superseded by a later attestation
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {formatDate(s.generated_at, { includeTime: true })}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <PersonLabel userId={s.generated_by} />
                      </TableCell>
                      <TableCell sx={cellSx}>{s.profile_version}</TableCell>
                      <TableCell
                        sx={{ ...cellSx, fontSize: 11, wordBreak: "break-all", maxWidth: "180px" }}
                      >
                        {s.pdf_sha256 ?? "—"}
                      </TableCell>
                      <TableCell sx={cellSx} align="right">
                        <CustomizableButton
                          variant="outlined"
                          size="small"
                          text="Download"
                          testId={`aedt-download-stance-${s.id}`}
                          startIcon={<Download size={14} strokeWidth={1.5} />}
                          onClick={() => void handleDownload(s.id)}
                          isDisabled={downloading !== null}
                          loading={downloading === s.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
        <EducationPanel pageKey="stance" />
      </Box>
    </Stack>
  );
};

export default StancePanel;
