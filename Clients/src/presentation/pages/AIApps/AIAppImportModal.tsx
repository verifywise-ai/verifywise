import { useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Download, FileUp } from "lucide-react";
import StandardModal from "../../components/Modals/StandardModal";
import { CustomizableButton } from "../../components/button/customizable-button";
import Alert from "../../components/Alert";
import { palette } from "../../themes/palette";
import { fill } from "../../../i18n/fill";
import { useTranslation } from "../../../application/hooks/useTranslation";
import {
  useDownloadAiAppImportTemplate,
  useImportAiApps,
} from "../../../application/hooks/useAiAppBulk";
import { errorBody, errorMessage } from "../../../application/repository/aiAppBulk.repository";
import {
  parseSpreadsheet,
  SpreadsheetParseError,
} from "../../../application/utils/parseSpreadsheet";
import type { IAiAppImportResult, IAiAppImportRow } from "../../../domain/interfaces/i.aiAppBulk";
import { CountSummary, RowIssuesTable } from "./AIAppAssessments/AssessmentDisplay";
import { mapImportRows, MAX_BULK_ROWS, saveBlob } from "./bulkUtils";
import { controlButtonSx } from "./style";

interface AIAppImportModalProps {
  onClose: () => void;
}

export default function AIAppImportModal({ onClose }: AIAppImportModalProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  // Only the latest file may set state: an earlier one can still be in flight.
  const runRef = useRef(0);

  const [fileName, setFileName] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [rows, setRows] = useState<IAiAppImportRow[]>([]);
  const [preview, setPreview] = useState<IAiAppImportResult | null>(null);
  const [outcome, setOutcome] = useState<IAiAppImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importMutation = useImportAiApps();
  const templateMutation = useDownloadAiAppImportTemplate();

  const handleDownloadTemplate = async () => {
    try {
      saveBlob(await templateMutation.mutateAsync(), "ai-apps-import-template.xlsx");
    } catch {
      setError(t("Could not download the template. Try again."));
    }
  };

  const handleFile = async (file: File) => {
    const run = ++runRef.current;
    setFileName(file.name);
    setRows([]);
    setPreview(null);
    setError(null);
    setIsChecking(true);

    const fail = (message: string) => {
      if (run === runRef.current) setError(message);
    };

    try {
      const parsed = await parseSpreadsheet(file);
      const mapped = mapImportRows(parsed);
      if (!mapped.hasNameColumn) {
        fail(t("The first row needs a Name column. Download the template and try again."));
        return;
      }
      if (mapped.rows.length === 0) {
        fail(t("The first sheet has no rows to import."));
        return;
      }
      if (mapped.rows.length > MAX_BULK_ROWS) {
        fail(
          fill(t("A file can hold up to {max} apps. This one has {count}."), {
            max: MAX_BULK_ROWS,
            count: mapped.rows.length,
          }),
        );
        return;
      }
      const result = await importMutation.mutateAsync({ rows: mapped.rows, dry_run: true });
      if (run !== runRef.current) return;
      setRows(mapped.rows);
      setPreview(result);
    } catch (err) {
      fail(
        err instanceof SpreadsheetParseError
          ? t(err.message)
          : errorMessage(err, t("Could not check the file. Try again.")),
      );
    } finally {
      if (run === runRef.current) setIsChecking(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same file again, after fixing it, fires a change.
    event.target.value = "";
    if (file) void handleFile(file);
  };

  const handleImport = async () => {
    setError(null);
    try {
      setOutcome(await importMutation.mutateAsync({ rows, dry_run: false }));
    } catch (err) {
      const rejected = errorBody<IAiAppImportResult>(err, 422);
      if (rejected) setPreview(rejected);
      setError(
        rejected
          ? t("Nothing was imported. Fix these rows and choose the file again.")
          : errorMessage(err, t("The import failed. Nothing was imported.")),
      );
    }
  };

  const errors = preview?.errors ?? [];
  const skipped = preview?.skipped ?? [];
  const newVendors = preview?.new_vendors ?? [];
  const toCreate = preview?.to_create ?? 0;
  const canImport = !!preview && errors.length === 0 && toCreate > 0;
  const isCommitting = importMutation.isPending && !isChecking;

  return (
    <StandardModal
      isOpen
      onClose={onClose}
      title="Import AI apps"
      description="Add many AI apps from one Excel file. Existing apps are never changed."
      maxWidth="800px"
      onSubmit={handleImport}
      submitButtonText={
        toCreate === 1 ? t("Import 1 app") : fill(t("Import {count} apps"), { count: toCreate })
      }
      isSubmitDisabled={!canImport || isChecking}
      isSubmitting={isCommitting}
      hideSubmitButton={!!outcome}
      cancelButtonText={outcome ? "Close" : "Cancel"}
    >
      <Stack gap="16px">
        {outcome ? (
          <>
            <Alert
              variant="success"
              body={
                outcome.created === 1
                  ? t("1 AI app was imported.")
                  : fill(t("{count} AI apps were imported."), { count: outcome.created })
              }
              inline
            />
            <CountSummary
              items={[
                { label: t("Imported"), value: outcome.created },
                { label: t("Skipped, already in your inventory"), value: outcome.skipped.length },
                { label: t("New vendors added"), value: outcome.new_vendors.length },
              ]}
            />
          </>
        ) : (
          <>
            <Stack direction="row" gap="8px" alignItems="center" flexWrap="wrap">
              <CustomizableButton
                text="Download template"
                variant="outlined"
                startIcon={<Download size={16} strokeWidth={1.5} />}
                onClick={handleDownloadTemplate}
                loading={templateMutation.isPending}
                testId="ai-apps-import-download-template"
                sx={controlButtonSx}
              />
              <CustomizableButton
                text="Choose file"
                variant="contained"
                startIcon={<FileUp size={16} strokeWidth={1.5} />}
                onClick={() => inputRef.current?.click()}
                disabled={isChecking || isCommitting}
                testId="ai-apps-import-choose-file"
                sx={controlButtonSx}
              />
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                hidden
                onChange={handleInputChange}
                aria-label="Choose an Excel file"
                data-testid="ai-apps-import-file-input"
              />
              {fileName && (
                <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                  {fileName}
                </Typography>
              )}
            </Stack>

            {isChecking && (
              <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                Checking the file...
              </Typography>
            )}

            {error && <Alert variant="error" body={error} inline />}

            {preview && (
              <>
                <CountSummary
                  items={[
                    { label: t("To create"), value: toCreate },
                    { label: t("To skip, already in your inventory"), value: skipped.length },
                    { label: t("Rows with errors"), value: errors.length },
                  ]}
                />

                {newVendors.length > 0 && (
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, mb: "4px" }}>
                      New vendors that will be added
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                      {newVendors.join(", ")}
                    </Typography>
                  </Box>
                )}

                {errors.length > 0 && (
                  <RowIssuesTable
                    title={t("Fix these rows, then choose the file again")}
                    headers={[t("Row"), t("Field"), t("Message")]}
                    rows={errors}
                  />
                )}

                {skipped.length > 0 && (
                  <RowIssuesTable
                    title={t("Rows that will be skipped")}
                    headers={[t("Row"), t("AI app"), t("Reason")]}
                    rows={skipped.map((item) => ({
                      row: item.row,
                      field: item.name,
                      message: item.reason,
                    }))}
                  />
                )}

                {errors.length === 0 && toCreate === 0 && (
                  <Alert
                    variant="info"
                    body={t("There is nothing new to import in this file.")}
                    inline
                  />
                )}
              </>
            )}
          </>
        )}
      </Stack>
    </StandardModal>
  );
}
