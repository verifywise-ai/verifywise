import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import {
  useAedtRun,
  useConfirmAedtDerivedBasis,
  useGenerateAedtRunStance,
} from "../../../application/hooks/useAedtBiasAudit";
import {
  describeAedtError,
  type AedtAuditResult,
  type AedtCategoryTable,
  type AedtDerivedBasis,
  type AedtGateFinding,
} from "../../../application/repository/aedtBiasAudit.repository";
import { palette } from "../../themes/palette";
import EducationPanel from "./EducationPanel";
import StancePanel from "./StancePanel";
import PersonLabel from "./PersonLabel";
import { categoryLabel, formatRatio } from "./display";
import { cardSx, cellSx, headSx, helperSx, labelSx, titleSx } from "./styles";

interface RunDetailProps {
  runId: number;
  canEdit: boolean;
  canAttest: boolean;
  onBack: () => void;
}

const SEVERITY_STYLE: Record<
  AedtGateFinding["severity"],
  { bg: string; text: string; border: string }
> = {
  stop: palette.status.error,
  warn: palette.status.warning,
  note: palette.status.info,
};

const SEVERITY_LABEL: Record<AedtGateFinding["severity"], string> = {
  stop: "Withholds results",
  warn: "Warning",
  note: "Note",
};

const BASIS_LABEL: Record<string, string> = {
  historical: "Historical applicant data",
  test_volume: "Test data: too few historical records",
  test_attribute: "Test data: the characteristics are not recorded",
  test_availability: "Test data: the records exist but are not ours",
  not_applicable: "Not applicable",
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** The lowest impact ratio among a table's groups that were not excluded. */
function lowestRow(table: AedtCategoryTable) {
  let lowest: AedtCategoryTable["rows"][number] | null = null;
  for (const row of table.rows) {
    if (row.excluded || row.impactRatio === null) continue;
    if (lowest === null || row.impactRatio < (lowest.impactRatio ?? Infinity)) lowest = row;
  }
  return lowest;
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Typography component="h2" sx={titleSx}>
    {children}
  </Typography>
);

/** The figures a reader needs first: the lowest ratio per table and the data checks. */
const Summary = ({
  result,
  findings,
}: {
  result: AedtAuditResult | null;
  findings: AedtGateFinding[];
}) => {
  const scoring = result?.metric === "scoring_rate";
  const flagged = result
    ? result.tables.reduce((n, t) => n + t.rows.filter((r) => r.flagged).length, 0)
    : 0;
  return (
    <Box sx={cardSx} data-testid="aedt-run-summary">
      <SectionTitle>Results</SectionTitle>
      {result ? (
        <>
          <Box sx={{ mt: "12px", overflowX: "auto", maxWidth: "720px" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Category</TableCell>
                  <TableCell sx={headSx} align="right">
                    Lowest impact ratio
                  </TableCell>
                  <TableCell sx={headSx}>Group</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.tables.map((table) => {
                  const row = lowestRow(table);
                  return (
                    <TableRow key={table.categoryKey}>
                      <TableCell sx={cellSx}>{categoryLabel(table.categoryKey)}</TableCell>
                      <TableCell
                        sx={{
                          ...cellSx,
                          fontWeight: 600,
                          color: row?.flagged ? palette.status.warning.text : cellSx.color,
                        }}
                        align="right"
                      >
                        {formatRatio(row?.impactRatio ?? null)}
                      </TableCell>
                      <TableCell sx={cellSx}>{row?.categoryName ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          <Stack gap="4px" sx={{ mt: "12px" }}>
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              <span>{`${result.totalApplicants} candidates assessed`}</span>
              <span>{` · ${result.unknownCount} in an unknown category`}</span>
              {scoring && result.overallMedian !== null && (
                <span>{` · median score ${result.overallMedian}`}</span>
              )}
            </Typography>
            <Typography sx={helperSx}>
              {flagged === 0
                ? "No impact ratio is below 0.80."
                : `${flagged} impact ${flagged === 1 ? "ratio is" : "ratios are"} below 0.80.`}{" "}
              Local Law 144 sets no pass mark. 0.80 is the EEOC four-fifths convention: a lower
              ratio is something to investigate and report, not a failure.
            </Typography>
          </Stack>
        </>
      ) : (
        <Alert severity="warning" sx={{ borderRadius: "4px", mt: "12px" }}>
          No figures were calculated for this run. The data checks below say why.
        </Alert>
      )}
      {findings.length === 0 && (
        <Stack direction="row" alignItems="center" gap="6px" sx={{ mt: "12px" }}>
          <CircleCheck size={14} strokeWidth={1.5} color={palette.status.success.text} />
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            The data checks raised nothing for this run.
          </Typography>
        </Stack>
      )}
    </Box>
  );
};

const Findings = ({ findings }: { findings: AedtGateFinding[] }) => (
  <Box sx={cardSx}>
    <SectionTitle>Data checks</SectionTitle>
    <Box sx={{ mt: "4px" }}>
      <EducationPanel pageKey="results.data_quality" />
    </Box>
    <Stack gap="8px" sx={{ mt: "12px" }}>
      {findings.map((f, i) => {
        const style = SEVERITY_STYLE[f.severity] ?? palette.status.default;
        return (
          <Box
            key={`${f.code}-${i}`}
            data-testid={`finding-${f.code}`}
            sx={{
              border: `1px solid ${style.border}`,
              backgroundColor: style.bg,
              borderRadius: "4px",
              p: "12px",
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: style.text, mb: "4px" }}>
              {SEVERITY_LABEL[f.severity] ?? f.severity}
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              {f.message}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  </Box>
);

const Figures = ({ result }: { result: AedtAuditResult }) => {
  const scoring = result.metric === "scoring_rate";
  return (
    <Box sx={cardSx}>
      <SectionTitle>Impact ratios</SectionTitle>
      <Box sx={{ mt: "4px" }}>
        <EducationPanel pageKey="results.figures" />
      </Box>
      <Stack gap="24px" sx={{ mt: "16px" }}>
        {result.tables.map((table) => (
          <Box key={table.categoryKey} data-testid={`table-${table.categoryKey}`}>
            <Typography
              component="h3"
              sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary, mb: "8px" }}
            >
              {table.title}
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headSx}>Group</TableCell>
                    <TableCell sx={headSx} align="right">
                      Assessed
                    </TableCell>
                    <TableCell sx={headSx} align="right">
                      {scoring ? "Scored above the median" : "Selected"}
                    </TableCell>
                    <TableCell sx={headSx} align="right">
                      {scoring ? "Scoring rate" : "Selection rate"}
                    </TableCell>
                    <TableCell sx={headSx} align="right">
                      Impact ratio
                    </TableCell>
                    <TableCell sx={headSx}>Note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {table.rows.map((row) => (
                    <TableRow key={row.categoryName}>
                      <TableCell sx={cellSx}>{row.categoryName}</TableCell>
                      <TableCell sx={cellSx} align="right">
                        {row.applicantCount}
                      </TableCell>
                      <TableCell sx={cellSx} align="right">
                        {row.selectedCount}
                      </TableCell>
                      <TableCell sx={cellSx} align="right">
                        {pct(row.selectionRate)}
                      </TableCell>
                      <TableCell
                        sx={{
                          ...cellSx,
                          color: row.flagged ? palette.status.warning.text : cellSx.color,
                          fontWeight: row.flagged ? 600 : 400,
                        }}
                        align="right"
                      >
                        {formatRatio(row.impactRatio)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, color: palette.text.tertiary }}>
                        {row.excluded ? (
                          <span>Excluded: under 2% of the data</span>
                        ) : row.flagged ? (
                          <span>Below 0.80</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

interface BasisProps {
  runId: number;
  basis: AedtDerivedBasis | null;
  expiryDate: string | null;
  expiryTrigger: string | null;
  canAttest: boolean;
}

/** Which data the result rests on, and when it stops describing the platform. */
const BasisAndExpiry = ({ runId, basis, expiryDate, expiryTrigger, canAttest }: BasisProps) => {
  const confirm = useConfirmAedtDerivedBasis(runId);
  const formatDate = useFormattedDate();
  return (
    <Box sx={cardSx}>
      <SectionTitle>Data basis and expiry</SectionTitle>
      <Box sx={{ mt: "4px" }}>
        <EducationPanel pageKey="expiry" />
      </Box>

      <Typography sx={{ fontSize: 13, color: palette.text.secondary, mt: "12px" }}>
        <span>Valid until</span> <strong>{formatDate(expiryDate)}</strong>
        <span>, one year after this run, or earlier if one of the conditions below occurs.</span>
      </Typography>

      {basis ? (
        <Box sx={{ mt: "12px", overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>Category</TableCell>
                <TableCell sx={headSx}>Data basis</TableCell>
                <TableCell sx={headSx}>Ends earlier when</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {basis.perCategory.map((c) => (
                <TableRow key={c.category}>
                  <TableCell sx={cellSx}>{categoryLabel(c.category)}</TableCell>
                  <TableCell sx={cellSx}>{BASIS_LABEL[c.basis] ?? c.basis}</TableCell>
                  <TableCell sx={cellSx}>{c.expiryTrigger || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : (
        expiryTrigger && (
          <Typography sx={{ ...helperSx, mt: "8px" }}>
            <span>Ends earlier when:</span> <span>{expiryTrigger}</span>
          </Typography>
        )
      )}

      {basis &&
        (basis.confirmed ? (
          <Stack direction="row" alignItems="center" gap="6px" flexWrap="wrap" sx={{ mt: "12px" }}>
            <Typography sx={{ ...helperSx, color: palette.status.success.text }}>
              Basis confirmed by
            </Typography>
            <PersonLabel userId={basis.confirmedBy ?? null} />
            {basis.confirmedAt && (
              <Typography sx={helperSx}>{formatDate(basis.confirmedAt)}</Typography>
            )}
          </Stack>
        ) : (
          <Stack gap="8px" alignItems="flex-start" sx={{ mt: "12px" }}>
            <Typography sx={helperSx}>
              This basis is our reading of your answers about the data you hold. It stays an open
              item until an Admin confirms it. If it is wrong, change your answers instead.
            </Typography>
            <CustomizableButton
              variant="outlined"
              size="small"
              text="Confirm this basis"
              testId="aedt-confirm-basis"
              onClick={() => confirm.mutate()}
              isDisabled={!canAttest || confirm.isPending}
              loading={confirm.isPending}
            />
            {!canAttest && (
              <Typography sx={helperSx}>Only an Admin can confirm the data basis.</Typography>
            )}
            {confirm.error && (
              <Alert severity="error" sx={{ borderRadius: "4px" }}>
                {describeAedtError(confirm.error).message}
              </Alert>
            )}
          </Stack>
        ))}
    </Box>
  );
};

/** One run: its results, data checks, data basis and expiry, and its stances. */
const RunDetail = ({ runId, canEdit, canAttest, onBack }: RunDetailProps) => {
  const { data, isLoading, error } = useAedtRun(runId);
  const generate = useGenerateAedtRunStance(runId);
  const formatDate = useFormattedDate();

  const back = (
    <Box>
      <CustomizableButton
        variant="text"
        text="All runs"
        testId="aedt-back-to-runs"
        startIcon={<ArrowLeft size={14} strokeWidth={1.5} />}
        onClick={onBack}
      />
    </Box>
  );

  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: "32px" }}>
        <CircularProgress size={24} />
      </Stack>
    );
  }
  if (error || !data) {
    return (
      <Stack gap="12px">
        {back}
        <Alert severity="error" sx={{ borderRadius: "4px" }}>
          {describeAedtError(error).message}
        </Alert>
      </Stack>
    );
  }

  const { run, stances, mayExportPdf } = data;
  const findings = Array.isArray(run.gate_findings_json) ? run.gate_findings_json : [];
  const stanceReason = !canEdit
    ? "Only an Admin or Editor can generate a stance."
    : !mayExportPdf
      ? "The data checks withhold export for this run, so no stance can be generated from it."
      : null;

  return (
    <Stack gap="16px">
      {back}
      <Box sx={cardSx}>
        <SectionTitle>
          <span>Run</span> <span>{run.id}</span>
          {run.job_description_key != null && (
            <>
              <span>{" · "}</span>
              {/* The customer's words: never swapped for a dictionary match. */}
              <span data-vw-no-translate="true">{run.job_description_key}</span>
            </>
          )}
        </SectionTitle>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, auto)" },
            justifyContent: "start",
            columnGap: "32px",
            rowGap: "12px",
            mt: "12px",
          }}
        >
          <Meta label="Recorded" value={formatDate(run.created_at, { includeTime: true })} />
          <Meta label="Recorded by" value={<PersonLabel userId={run.created_by ?? null} />} />
          <Meta
            label="Rate calculated"
            value={run.metric === "scoring_rate" ? "Scoring rate" : "Selection rate"}
          />
          <Meta label="Rows" value={run.row_count == null ? "—" : String(run.row_count)} />
          <Meta label="Profile version" value={String(run.profile_version)} />
        </Box>
        {run.dataset_sha256 && (
          <Typography sx={{ ...labelSx, mt: "12px", wordBreak: "break-all" }}>
            <span>Dataset fingerprint (SHA-256):</span> <span>{run.dataset_sha256}</span>
          </Typography>
        )}
      </Box>

      <Summary result={run.result_json ?? null} findings={findings} />

      {findings.length > 0 && <Findings findings={findings} />}

      {run.result_json && <Figures result={run.result_json} />}

      <StancePanel
        kind="run"
        stances={stances}
        generateBlockedReason={stanceReason}
        onGenerate={() => generate.mutate()}
        isGenerating={generate.isPending}
        generateError={generate.error ? describeAedtError(generate.error).message : null}
      />

      <BasisAndExpiry
        runId={run.id}
        basis={run.data_basis_json ?? null}
        expiryDate={run.expiry_date ?? null}
        expiryTrigger={run.expiry_trigger ?? null}
        canAttest={canAttest}
      />
    </Stack>
  );
};

const Meta = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Box>
    <Typography sx={labelSx}>{label}</Typography>
    <Box sx={{ fontSize: 13, color: palette.text.secondary }}>{value}</Box>
  </Box>
);

export default RunDetail;
