import { useRef, useState } from "react";
import { Stack, Typography } from "@mui/material";
import { FileUp } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import Alert from "../../../components/Alert";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { palette } from "../../../themes/palette";
import { fill } from "../../../../i18n/fill";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { useUploadAiAppAssessmentAnswers } from "../../../../application/hooks/useAiAppBulk";
import { errorBody, errorMessage } from "../../../../application/repository/aiAppBulk.repository";
import {
  parseSpreadsheet,
  SpreadsheetParseError,
} from "../../../../application/utils/parseSpreadsheet";
import type {
  IAiAppAnswersRow,
  IAiAppAnswersUploadResult,
  IAiAppQuestionnaire,
  IAiAppRowError,
} from "../../../../domain/interfaces/i.aiAppBulk";
import { mapWorksheetRows, MAX_BULK_ROWS } from "../bulkUtils";
import { controlButtonSx } from "../style";
import { CountSummary, RowIssuesTable } from "./AssessmentDisplay";

interface WorksheetUploadModalProps {
  questionnaire: IAiAppQuestionnaire;
  onClose: () => void;
}

export default function WorksheetUploadModal({
  questionnaire,
  onClose,
}: WorksheetUploadModalProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [rows, setRows] = useState<IAiAppAnswersRow[]>([]);
  const [rowErrors, setRowErrors] = useState<IAiAppRowError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IAiAppAnswersUploadResult | null>(null);
  const uploadMutation = useUploadAiAppAssessmentAnswers();

  const handleFile = async (file: File) => {
    const run = ++runRef.current;
    setFileName(file.name);
    setRows([]);
    setRowErrors([]);
    setError(null);
    setResult(null);
    setIsReading(true);
    try {
      const mapped = mapWorksheetRows(await parseSpreadsheet(file), questionnaire.questions);
      if (run !== runRef.current) return;
      if (mapped.missingColumns.length > 0) {
        setError(
          fill(
            t(
              "This worksheet no longer matches the questionnaire. Download a new one and enter your answers there. Missing columns: {columns}",
            ),
            { columns: mapped.missingColumns.join(", ") },
          ),
        );
      } else if (mapped.rows.length + mapped.errors.length === 0) {
        setError(t("The worksheet has no rows."));
      } else if (mapped.rows.length + mapped.errors.length > MAX_BULK_ROWS) {
        setError(
          fill(t("A worksheet can hold up to {max} rows. Split it and upload each part."), {
            max: MAX_BULK_ROWS,
          }),
        );
      } else {
        setRows(mapped.rows);
        setRowErrors(mapped.errors);
      }
    } catch (err) {
      if (run === runRef.current) {
        setError(
          err instanceof SpreadsheetParseError
            ? t(err.message)
            : t("The file could not be read. Check that it is a valid Excel file."),
        );
      }
    } finally {
      if (run === runRef.current) setIsReading(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same file again, after fixing it, fires a change.
    event.target.value = "";
    if (file) void handleFile(file);
  };

  const handleUpload = async () => {
    setError(null);
    try {
      setResult(await uploadMutation.mutateAsync({ questionnaire_id: questionnaire.id, rows }));
      setRows([]);
    } catch (err) {
      const rejected = errorBody<IAiAppAnswersUploadResult>(err, 422);
      if (rejected?.errors?.length) {
        setRowErrors(rejected.errors);
        setError(t("No answers were saved. Fix these rows and upload the worksheet again."));
      } else {
        setError(errorMessage(err, t("Could not upload the answers. Try again.")));
      }
    }
  };

  const answered = rows.filter((row) => Object.keys(row.answers).length > 0).length;

  return (
    <StandardModal
      isOpen
      onClose={onClose}
      title="Upload answers"
      description={fill(t("Worksheet for {name}. Saved answers can't be changed."), {
        name: questionnaire.name,
      })}
      onSubmit={handleUpload}
      submitButtonText="Upload answers"
      isSubmitting={uploadMutation.isPending}
      isSubmitDisabled={rows.length === 0 || rowErrors.length > 0 || isReading}
      hideSubmitButton={!!result}
      cancelButtonText={result ? "Close" : "Cancel"}
      fitContent
    >
      <Stack gap="16px">
        {result ? (
          <CountSummary
            items={[
              { label: t("Completed"), value: result.completed },
              { label: t("Left blank, still pending"), value: result.left_blank },
              { label: t("Already completed"), value: result.already_completed },
            ]}
          />
        ) : (
          <Stack direction="row" gap="8px" alignItems="center" flexWrap="wrap">
            <CustomizableButton
              text="Choose file"
              variant="outlined"
              startIcon={<FileUp size={16} strokeWidth={1.5} />}
              onClick={() => inputRef.current?.click()}
              disabled={isReading || uploadMutation.isPending}
              testId="ai-app-worksheet-choose-file"
              sx={controlButtonSx}
            />
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={handleInputChange}
              aria-label="Choose an Excel file"
              data-testid="ai-app-worksheet-file-input"
            />
            {fileName && (
              <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                {fileName}
              </Typography>
            )}
          </Stack>
        )}

        {rows.length > 0 && rowErrors.length === 0 && (
          <Typography sx={{ fontSize: 13 }}>
            {fill(t("{answered} of {total} rows have answers."), {
              answered,
              total: rows.length,
            })}
          </Typography>
        )}

        {error && <Alert variant="error" body={error} inline />}

        {rowErrors.length > 0 && (
          <RowIssuesTable
            title={t("Rows to fix")}
            headers={[t("Row"), t("Field"), t("Message")]}
            rows={rowErrors.map((issue) => ({ ...issue, message: t(issue.message) }))}
          />
        )}
      </Stack>
    </StandardModal>
  );
}
