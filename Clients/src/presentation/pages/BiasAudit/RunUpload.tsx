import { useMemo, useRef, useState } from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { Upload } from "lucide-react";
import Select from "../../components/Inputs/Select";
import { CustomizableButton } from "../../components/button/customizable-button";
import { palette } from "../../themes/palette";
import { useCreateAedtRun } from "../../../application/hooks/useAedtBiasAudit";
import {
  describeAedtError,
  type AedtProfileAnswer,
  type AedtQuestion,
} from "../../../application/repository/aedtBiasAudit.repository";
import EducationPanel from "./EducationPanel";
import { readCsvHeaders } from "./csvHeaders";

/** The server's upload limit (`DATASET_MAX_BYTES`, 30 MB). */
const MAX_BYTES = 30 * 1024 * 1024;
const UNMAPPED = "";

type Metric = "selection_rate" | "scoring_rate";

interface RunUploadProps {
  projectId: number;
  /** Questions and answers of the profile, to tell which rate the run computes. */
  questions: AedtQuestion[];
  answers: AedtProfileAnswer[];
  canEdit: boolean;
  /** Null when a run may be recorded; otherwise why not. */
  blockedReason: string | null;
  onCreated: (runId: number) => void;
}

/**
 * The rate the cutoff answer forces, read from the option's own
 * `metric_forced` consequence as the server reads it. Null until answered.
 */
function forcedMetric(questions: AedtQuestion[], answers: AedtProfileAnswer[]): Metric | null {
  const q = questions.find((x) => x.key === "cutoff.applied_by");
  const a = answers.find((x) => x.questionKey === "cutoff.applied_by");
  if (!q || !a || a.dontKnow || a.value === null) return null;
  const emit = q.options
    .find((o) => o.value === a.value)
    ?.emits?.find((e) => e.kind === "metric_forced");
  const metric = emit?.payload?.metric ?? emit?.text;
  return metric === "selection_rate" || metric === "scoring_rate" ? metric : null;
}

/**
 * Upload a dataset and map its columns. The file is read here only for its
 * header line; the server hashes and reads the whole file and keeps none of
 * it. A mapped column the file lacks is reported by the server as a fault in
 * the mapping, not in the data.
 */
const RunUpload = ({
  projectId,
  questions,
  answers,
  canEdit,
  blockedReason,
  onCreated,
}: RunUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const createRun = useCreateAedtRun(projectId);

  const metric = useMemo(() => forcedMetric(questions, answers), [questions, answers]);

  const fields = useMemo(
    () => [
      { key: "sex", label: "Sex column" },
      { key: "race_ethnicity", label: "Race or ethnicity column" },
      metric === "scoring_rate"
        ? { key: "score", label: "Score column" }
        : { key: "selected", label: "Selected column (1, 0, yes, no, true, false)" },
    ],
    [metric],
  );

  const handleFile = async (picked: File | undefined) => {
    setFileError(null);
    setFile(null);
    setHeaders([]);
    setMapping({});
    createRun.reset();
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(".csv")) {
      setFileError("Upload the dataset as a .csv file.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFileError("The dataset is larger than the 30 MB upload limit.");
      return;
    }
    try {
      const found = await readCsvHeaders(picked);
      if (found.length === 0) {
        setFileError("The file has no header row. Put the column names on the first line.");
        return;
      }
      setFile(picked);
      setHeaders(found);
    } catch {
      setFileError("The file could not be read. Choose it again.");
    }
  };

  const outcomeKey = metric === "scoring_rate" ? "score" : "selected";
  const runReason =
    blockedReason ??
    (!canEdit
      ? "Only an Admin or Editor can record a run."
      : metric === null
        ? "Answer who applies the cutoff, save and attest the profile, so the module knows whether to compute selection rates or scoring rates."
        : null);
  const runDisabled = runReason !== null || !file || !mapping[outcomeKey] || createRun.isPending;

  const handleRun = () => {
    if (runDisabled || !file) return;
    const sent: Record<string, string> = {};
    for (const f of fields) if (mapping[f.key]) sent[f.key] = mapping[f.key];
    createRun.mutate({ file, mapping: sent }, { onSuccess: (r) => onCreated(r.runId) });
  };

  const items = [
    { _id: UNMAPPED, name: "Not in this file" },
    ...headers.map((h) => ({ _id: h, name: h })),
  ];
  const runError = createRun.error ? describeAedtError(createRun.error).message : null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" },
        gap: "16px",
        alignItems: "start",
      }}
    >
      <Box
        sx={{
          border: `1px solid ${palette.border.dark}`,
          borderRadius: "4px",
          backgroundColor: palette.background.main,
          p: "16px",
        }}
      >
        <Stack gap="16px">
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
              New run
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mt: "4px" }}>
              Upload one CSV file with a row per candidate, then say which column holds each value.
            </Typography>
            {metric && (
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mt: "4px" }}>
                {metric === "scoring_rate"
                  ? "Your cutoff answer means this run computes scoring rates under 5-301(c)."
                  : "Your cutoff answer means this run computes selection rates under 5-301(b)."}
              </Typography>
            )}
          </Box>

          <Stack direction="row" alignItems="center" gap="12px" flexWrap="wrap">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              data-testid="aedt-dataset-input"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <CustomizableButton
              variant="outlined"
              text="Choose CSV file"
              testId="aedt-choose-dataset"
              startIcon={<Upload size={14} strokeWidth={1.5} />}
              onClick={() => inputRef.current?.click()}
              isDisabled={runReason !== null}
            />
            {file && (
              <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                {file.name}
              </Typography>
            )}
          </Stack>
          {fileError && (
            <Alert severity="error" sx={{ borderRadius: "4px" }}>
              {fileError}
            </Alert>
          )}

          {file && (
            <Stack gap="12px">
              {fields.map((f) => (
                <Select
                  key={f.key}
                  id={`aedt-map-${f.key}`}
                  label={f.label}
                  value={mapping[f.key] ?? UNMAPPED}
                  items={items}
                  isRequired={f.key === outcomeKey}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [f.key]: String(e.target.value) }))
                  }
                  sx={{ width: "100%", maxWidth: "420px" }}
                />
              ))}
            </Stack>
          )}

          <Stack gap="8px" alignItems="flex-start">
            <CustomizableButton
              variant="contained"
              text="Run measures"
              testId="aedt-create-run"
              onClick={handleRun}
              isDisabled={runDisabled}
              loading={createRun.isPending}
            />
            {runReason && (
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {runReason}
              </Typography>
            )}
            {runError && (
              <Alert severity="error" sx={{ borderRadius: "4px" }}>
                {runError}
              </Alert>
            )}
          </Stack>
        </Stack>
      </Box>
      <EducationPanel pageKey="run.upload" />
    </Box>
  );
};

export default RunUpload;
