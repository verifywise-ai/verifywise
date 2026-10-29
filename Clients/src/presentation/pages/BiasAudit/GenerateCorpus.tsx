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
import { Circle, CircleDot, Copy, Database, Download, RotateCw } from "lucide-react";
import Field from "../../components/Inputs/Field";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import {
  useAedtCorpora,
  useAedtJobDescriptions,
  useCompareAedtCriteria,
  useCreateAedtCorpus,
  useResumeAedtCorpus,
} from "../../../application/hooks/useAedtBiasAudit";
import {
  describeAedtError,
  downloadAedtCorpus,
  type AedtCorpus,
  type AedtCorpusStatus,
  type AedtCriteriaComparison,
  type AedtJobDescription,
} from "../../../application/repository/aedtBiasAudit.repository";
import { palette } from "../../themes/palette";
import { triggerBrowserDownload } from "../../utils/browserDownload.utils";
import EducationPanel from "./EducationPanel";
import { cardSx, cellSx, headSx, helperSx, tableFrameSx, titleSx } from "./styles";

/** The server's bounds on a corpus (`CORPUS_COUNT` in corpusService.ts). */
const DEFAULT_COUNT = 5000;
const MIN_COUNT = 700;
const MAX_COUNT = 10000;
/** The server's limit on the pasted criteria. */
const CRITERIA_MAX = 10000;

interface GenerateCorpusProps {
  projectId: number;
  canEdit: boolean;
  /** Whether the attested profile allows generation. */
  mayGenerate: boolean;
  /** Why the attested profile blocks generation; null when it does not. */
  blockedReason: string | null;
}

const STATUS_LABEL: Record<AedtCorpusStatus, string> = {
  running: "Generating",
  complete: "Complete",
  blocked: "Blocked",
  failed: "Failed",
};

/**
 * Failures the runner treats as final: the job description, model or plan
 * changed under the corpus, or it names something this deployment does not
 * hold. Resuming would fail the same way.
 */
const FINAL_FAILURES = new Set([
  "job_description_changed",
  "model_changed",
  "corpus_model_changed",
  "plan_changed",
  "plan_failed",
  "unknown_job_description",
  "unknown_artifact_kind",
]);

/** What a failed corpus says under its status; raw failure codes stay off the page. */
function failureText(code: string | null): string {
  if (code === null) return "Generation stopped before it finished.";
  if (code === "model_changed" || code === "corpus_model_changed") {
    return "The configured model changed, so this set cannot be finished. Generate a new one.";
  }
  if (code === "job_description_changed" || code === "plan_changed") {
    return "The job description or plan changed, so this set cannot be finished. Generate a new one.";
  }
  if (FINAL_FAILURES.has(code)) return "This set cannot be finished. Generate a new one.";
  if (code === "gateway_guardrail") {
    return "An AI Gateway guardrail blocked generation. Ask an Admin to let these requests through, then resume.";
  }
  return "Generation stopped before it finished.";
}

function countError(text: string): string | undefined {
  if (!/^\d+$/.test(text.trim())) return "Enter a whole number of records.";
  const n = Number(text.trim());
  if (n < MIN_COUNT) return "Use at least 700 records, 50 per cell.";
  if (n > MAX_COUNT) return "Use at most 10,000 records.";
  return undefined;
}

/**
 * Generate a synthetic candidate corpus from one of the two fixed job
 * descriptions. The customer runs the same job description through their own
 * platform, scores the corpus there, and brings the scores back as a run. The
 * gateway key is deployment configuration and never reaches this page.
 */
const GenerateCorpus = ({
  projectId,
  canEdit,
  mayGenerate,
  blockedReason,
}: GenerateCorpusProps) => {
  const formatDate = useFormattedDate();
  const jdQuery = useAedtJobDescriptions();
  const corporaQuery = useAedtCorpora(projectId);
  const compare = useCompareAedtCriteria();
  const create = useCreateAedtCorpus(projectId);
  const resume = useResumeAedtCorpus(projectId);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [criteria, setCriteria] = useState("");
  const [countText, setCountText] = useState(String(DEFAULT_COUNT));
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const jobDescriptions = jdQuery.data?.jobDescriptions ?? [];
  const generationAvailable = jdQuery.data?.generationAvailable ?? false;
  const selected = jobDescriptions.find((jd) => jd.key === selectedKey) ?? null;
  const roleTitleOf = (key: string) =>
    jobDescriptions.find((jd) => jd.key === key)?.roleTitle ?? key;

  const trimmedCriteria = criteria.trim();
  const criteriaError =
    criteria.length > CRITERIA_MAX ? "Use at most 10,000 characters." : undefined;
  const countProblem = countError(countText);
  const corpora = corporaQuery.data ?? [];
  const running = corpora.some((c) => c.status === "running");

  const generateReason = !canEdit
    ? "Only an Admin or Editor can generate test candidates."
    : !mayGenerate
      ? (blockedReason ?? "The attested profile does not allow generation.")
      : jdQuery.data && !generationAvailable
        ? "Generation is not available on this deployment. Contact VerifyWise."
        : running
          ? "Test candidates are already generating for this use case. Wait for them to finish."
          : !selected
            ? "Choose a role first."
            : null;
  // Resuming starts generation again, so it needs what starting it needs.
  const canResume = canEdit && mayGenerate && generationAvailable && !running;
  const generateDisabled =
    generateReason !== null ||
    !jdQuery.data ||
    countProblem !== undefined ||
    criteriaError !== undefined ||
    create.isPending;

  const choose = (key: string) => {
    if (key === selectedKey) return;
    setSelectedKey(key);
    setCopied("idle");
    compare.reset();
    create.reset();
  };

  const handleCopy = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.body);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };

  const handleCompare = () => {
    if (!canEdit || !selected || trimmedCriteria === "" || criteriaError) return;
    compare.mutate({ jobDescriptionKey: selected.key, criteriaSupplied: trimmedCriteria });
  };

  const handleGenerate = () => {
    if (generateDisabled || !selected) return;
    create.mutate({
      jobDescriptionKey: selected.key,
      criteriaSupplied: trimmedCriteria === "" ? null : trimmedCriteria,
      count: Number(countText.trim()),
    });
  };

  const handleDownload = async (corpusId: number) => {
    setDownloading(corpusId);
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadAedtCorpus(corpusId);
      triggerBrowserDownload(blob, filename);
    } catch (error) {
      setDownloadError(describeAedtError(error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Stack gap="16px">
      <Typography sx={helperSx} data-testid="aedt-generate-how">
        Pick a role and generate test candidates. Download them, score them in your platform with
        the same job description, then upload the scores under Runs.
      </Typography>
      <Box sx={cardSx}>
        <Stack gap="12px">
          <Box>
            <Typography component="h2" sx={titleSx}>
              Role to test
            </Typography>
            <Box sx={{ mt: "4px" }}>
              <EducationPanel pageKey="run.job_description" />
            </Box>
          </Box>
          {jdQuery.error && (
            <Alert severity="error" sx={{ borderRadius: "4px" }}>
              {describeAedtError(jdQuery.error).message}
            </Alert>
          )}
          <Box
            role="radiogroup"
            aria-label="Job description"
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: "12px",
            }}
          >
            {jobDescriptions.map((jd) => (
              <JobDescriptionCard
                key={jd.key}
                jd={jd}
                selected={jd.key === selectedKey}
                onSelect={() => choose(jd.key)}
              />
            ))}
          </Box>
          {selected && (
            <Stack gap="8px">
              <Box
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: "12px",
                  maxHeight: "280px",
                  overflowY: "auto",
                  fontSize: 13,
                  color: palette.text.secondary,
                  whiteSpace: "pre-wrap",
                }}
                data-testid="aedt-job-description-body"
              >
                {selected.body}
              </Box>
              <Box>
                <CustomizableButton
                  variant="outlined"
                  size="small"
                  text={copied === "copied" ? "Copied" : "Copy job description"}
                  testId="aedt-copy-job-description"
                  startIcon={<Copy size={14} strokeWidth={1.5} />}
                  onClick={() => void handleCopy()}
                />
              </Box>
              {copied === "failed" && (
                <Typography sx={{ ...helperSx, color: palette.status.error.text }}>
                  The job description could not be copied. Select the text above and copy it.
                </Typography>
              )}
            </Stack>
          )}
          <Typography sx={helperSx} data-testid="aedt-generate-role-statement">
            The result describes your tool on that role, not across all of your hiring.
          </Typography>
        </Stack>
      </Box>

      {selected && (
        <Box sx={cardSx}>
          <Stack gap="12px">
            <Box>
              <Typography component="h2" sx={titleSx}>
                Compare with the criteria from your platform (optional)
              </Typography>
              <Box sx={{ mt: "4px" }}>
                <EducationPanel pageKey="run.criteria_comparison" />
              </Box>
            </Box>
            <Field
              id="aedt-criteria-supplied"
              label="Criteria your platform generated"
              isOptional
              multiline
              rows={4}
              placeholder="One criterion per line"
              value={criteria}
              disabled={!canEdit}
              onChange={(e) => {
                setCriteria(e.target.value);
                compare.reset();
              }}
              error={criteriaError}
              helperText="Paste the criteria your platform produced from this job description."
              sx={{ width: "100%", maxWidth: "760px" }}
            />
            <Box>
              <CustomizableButton
                variant="outlined"
                text="Compare criteria"
                testId="aedt-compare-criteria"
                onClick={handleCompare}
                isDisabled={
                  !canEdit || !selected || trimmedCriteria === "" || criteriaError !== undefined
                }
                loading={compare.isPending}
              />
            </Box>
            {compare.error && (
              <Alert severity="error" sx={{ borderRadius: "4px" }}>
                {describeAedtError(compare.error).message}
              </Alert>
            )}
            {compare.data && (
              <ComparisonResult comparison={compare.data} jobDescription={selected} />
            )}
          </Stack>
        </Box>
      )}

      <Box sx={cardSx}>
        <Stack gap="12px" alignItems="flex-start">
          <Typography component="h2" sx={titleSx}>
            Generate test candidates
          </Typography>
          <Field
            id="aedt-corpus-count"
            label="Number of candidates"
            value={countText}
            onChange={(e) => setCountText(e.target.value)}
            error={countProblem}
            helperText="Between 700 and 10,000, rounded down so every group gets the same mix."
            sx={{ width: "100%", maxWidth: "420px" }}
          />
          <CustomizableButton
            variant="contained"
            text="Generate test candidates"
            testId="aedt-generate-corpus"
            startIcon={<Database size={14} strokeWidth={1.5} />}
            onClick={handleGenerate}
            isDisabled={generateDisabled}
            loading={create.isPending}
          />
          {generateReason && <Typography sx={helperSx}>{generateReason}</Typography>}
          {create.error && (
            <Alert severity="error" sx={{ borderRadius: "4px" }}>
              {describeAedtError(create.error).message}
            </Alert>
          )}
        </Stack>
      </Box>

      <Stack gap="12px">
        <Typography component="h2" sx={titleSx}>
          Generated test sets
        </Typography>
        {corporaQuery.error && (
          <Alert severity="error" sx={{ borderRadius: "4px" }}>
            {describeAedtError(corporaQuery.error).message}
          </Alert>
        )}
        {downloadError && (
          <Alert severity="error" sx={{ borderRadius: "4px" }}>
            {downloadError}
          </Alert>
        )}
        {resume.error && (
          <Alert severity="error" sx={{ borderRadius: "4px" }}>
            {describeAedtError(resume.error).message}
          </Alert>
        )}
        {corpora.length === 0 ? (
          !corporaQuery.isLoading && (
            <EmptyState
              icon={Database}
              message="No test candidates have been generated yet."
              showBorder
            />
          )
        ) : (
          <Box sx={tableFrameSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Role</TableCell>
                  <TableCell sx={headSx}>Status</TableCell>
                  <TableCell sx={headSx}>Candidates</TableCell>
                  <TableCell sx={headSx}>Model</TableCell>
                  <TableCell sx={headSx}>Checks</TableCell>
                  <TableCell sx={headSx}>Generated</TableCell>
                  <TableCell sx={headSx} />
                </TableRow>
              </TableHead>
              <TableBody>
                {corpora.map((c) => (
                  <CorpusRow
                    key={c.id}
                    corpus={c}
                    roleTitle={roleTitleOf(c.job_description_key)}
                    generatedAt={formatDate(c.generated_at, { includeTime: true })}
                    canResume={canResume}
                    downloading={downloading}
                    onDownload={(id) => void handleDownload(id)}
                    resuming={resume.isPending ? resume.variables : null}
                    onResume={(id) => resume.mutate(id)}
                  />
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Stack>
    </Stack>
  );
};

const JobDescriptionCard = ({
  jd,
  selected,
  onSelect,
}: {
  jd: AedtJobDescription;
  selected: boolean;
  onSelect: () => void;
}) => (
  <Box
    role="radio"
    aria-checked={selected}
    tabIndex={0}
    data-testid={`aedt-job-description-${jd.key}`}
    onClick={onSelect}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect();
      }
    }}
    sx={{
      "border": `1px solid ${selected ? palette.brand.primary : palette.border.dark}`,
      "borderRadius": "4px",
      "p": "12px 16px",
      "cursor": "pointer",
      "backgroundColor": selected ? palette.background.accent : palette.background.main,
      "&:hover": { borderColor: palette.brand.primary },
      "&:focus-visible": { outline: `2px solid ${palette.brand.primary}`, outlineOffset: "2px" },
    }}
  >
    <Stack direction="row" alignItems="center" gap="8px">
      {selected ? (
        <CircleDot size={16} strokeWidth={1.5} color={palette.brand.primary} />
      ) : (
        <Circle size={16} strokeWidth={1.5} color={palette.text.tertiary} />
      )}
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
        {jd.roleTitle}
      </Typography>
    </Stack>
    <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "8px" }}>
      Criteria the candidates are built on
    </Typography>
    <Box component="ul" sx={{ m: 0, mt: "4px", pl: "18px" }}>
      {jd.expectedCriteria.map((c) => (
        <Typography component="li" key={c.key} sx={{ fontSize: 13, color: palette.text.tertiary }}>
          {c.label}
        </Typography>
      ))}
    </Box>
  </Box>
);

const ComparisonResult = ({
  comparison,
  jobDescription,
}: {
  comparison: AedtCriteriaComparison;
  jobDescription: AedtJobDescription;
}) => {
  const labelOf = (key: string) =>
    jobDescription.expectedCriteria.find((c) => c.key === key)?.label ?? key;

  if (comparison.verdict === "not_supplied") {
    return (
      <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
        No criteria were found in the text. Put one criterion on each line.
      </Typography>
    );
  }
  return (
    <Alert
      severity={comparison.verdict === "divergent" ? "warning" : "success"}
      sx={{ borderRadius: "4px" }}
      data-testid="aedt-criteria-verdict"
    >
      <Stack gap="6px">
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          {comparison.verdict === "divergent"
            ? "The test candidates may not exercise your configuration well"
            : "The criteria from your platform are close to the ones the test candidates are built on"}
        </Typography>
        {comparison.unmatchedExpected.length > 0 && (
          <Typography sx={{ fontSize: 13 }}>
            {"Expected criteria not found: "}
            {comparison.unmatchedExpected.map(labelOf).join(", ")}
          </Typography>
        )}
        {comparison.unmatchedSupplied.length > 0 && (
          <Typography sx={{ fontSize: 13 }}>
            {"Your criteria the corpus does not cover: "}
            {comparison.unmatchedSupplied.join(", ")}
          </Typography>
        )}
      </Stack>
    </Alert>
  );
};

const CorpusRow = ({
  corpus,
  roleTitle,
  generatedAt,
  canResume,
  downloading,
  onDownload,
  resuming,
  onResume,
}: {
  corpus: AedtCorpus;
  roleTitle: string;
  generatedAt: string;
  /** Whether a failed corpus may be started again by this viewer, now. */
  canResume: boolean;
  downloading: number | null;
  onDownload: (corpusId: number) => void;
  resuming: number | null | undefined;
  onResume: (corpusId: number) => void;
}) => {
  const models = Object.entries(corpus.models_observed_json ?? {});
  const findings = corpus.release_findings_json ?? [];
  return (
    <TableRow data-testid={`corpus-row-${corpus.id}`}>
      <TableCell sx={cellSx}>{roleTitle}</TableCell>
      <TableCell sx={cellSx}>
        <Stack gap="2px">
          <span>{STATUS_LABEL[corpus.status]}</span>
          {corpus.status === "failed" && (
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              {failureText(corpus.failure_code)}
            </Typography>
          )}
        </Stack>
      </TableCell>
      <TableCell sx={cellSx}>{`${corpus.record_count ?? "—"} / ${corpus.planned_count}`}</TableCell>
      <TableCell sx={cellSx}>
        {models.length === 0 ? "—" : models.map(([m, n]) => `${m} (${n})`).join(", ")}
      </TableCell>
      <TableCell sx={{ ...cellSx, maxWidth: "320px" }}>
        {findings.length === 0 ? (
          "—"
        ) : (
          <Stack gap="4px">
            {findings.map((f) => (
              <Typography
                key={`${f.code}-${f.message}`}
                sx={{
                  fontSize: 12,
                  color:
                    f.severity === "stop" ? palette.status.error.text : palette.status.warning.text,
                }}
              >
                {f.message}
              </Typography>
            ))}
          </Stack>
        )}
      </TableCell>
      <TableCell sx={cellSx}>{generatedAt}</TableCell>
      <TableCell sx={cellSx} align="right">
        {corpus.status === "complete" && (
          <CustomizableButton
            variant="outlined"
            size="small"
            text="Download"
            testId={`aedt-download-corpus-${corpus.id}`}
            startIcon={<Download size={14} strokeWidth={1.5} />}
            onClick={() => onDownload(corpus.id)}
            isDisabled={downloading !== null}
            loading={downloading === corpus.id}
          />
        )}
        {corpus.status === "failed" && !FINAL_FAILURES.has(corpus.failure_code ?? "") && (
          <CustomizableButton
            variant="outlined"
            size="small"
            text="Resume"
            testId={`aedt-resume-corpus-${corpus.id}`}
            startIcon={<RotateCw size={14} strokeWidth={1.5} />}
            onClick={() => onResume(corpus.id)}
            isDisabled={!canResume || resuming != null}
            loading={resuming === corpus.id}
          />
        )}
      </TableCell>
    </TableRow>
  );
};

export default GenerateCorpus;
