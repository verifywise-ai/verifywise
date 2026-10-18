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
import { ArrowLeft } from "lucide-react";
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
  type AedtDerivedBasis,
  type AedtGateFinding,
} from "../../../application/repository/aedtBiasAudit.repository";
import { palette } from "../../themes/palette";
import EducationPanel from "./EducationPanel";
import StancePanel from "./StancePanel";
import PersonLabel from "./PersonLabel";
import { cardSx, cellSx, headSx, titleSx, twoColumnSx } from "./styles";

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

const CATEGORY_LABEL: Record<string, string> = {
  sex: "Sex",
  race_ethnicity: "Race or ethnicity",
  intersectional: "Sex by race or ethnicity",
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const Findings = ({ findings }: { findings: AedtGateFinding[] }) => (
  <Box sx={twoColumnSx}>
    <Box sx={cardSx}>
      <Typography sx={{ ...titleSx, mb: "12px" }}>Data checks</Typography>
      {findings.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
          The data checks raised nothing for this run.
        </Typography>
      ) : (
        <Stack gap="8px">
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
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: style.text, mb: "4px" }}>
                  {SEVERITY_LABEL[f.severity] ?? f.severity}
                </Typography>
                <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                  {f.message}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
    <EducationPanel pageKey="results.data_quality" />
  </Box>
);

const Figures = ({ result }: { result: AedtAuditResult }) => {
  const scoring = result.metric === "scoring_rate";
  return (
    <Box sx={twoColumnSx}>
      <Stack gap="16px">
        <Box sx={cardSx}>
          <Typography sx={{ ...titleSx, mb: "8px" }}>Figures</Typography>
          <Stack gap="4px">
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              <span>Individuals assessed: </span>
              <span>{result.totalApplicants}</span>
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              <span>In an unknown category: </span>
              <span>{result.unknownCount}</span>
            </Typography>
            {scoring && result.overallMedian !== null && (
              <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                <span>Median score of the full sample: </span>
                <span>{result.overallMedian}</span>
              </Typography>
            )}
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "4px" }}>
              Impact ratios below 0.80 are marked. 0.80 is the EEOC four-fifths convention, which
              Local Law 144 does not adopt; a marked ratio is a number to report and investigate.
            </Typography>
          </Stack>
        </Box>

        {result.tables.map((table) => (
          <Box key={table.categoryKey} sx={cardSx} data-testid={`table-${table.categoryKey}`}>
            <Typography sx={{ ...titleSx, mb: "8px" }}>{table.title}</Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headSx}>Category</TableCell>
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
                    <TableCell sx={headSx}>Notes</TableCell>
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
                        {row.impactRatio === null ? "—" : row.impactRatio.toFixed(3)}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {row.excluded ? (
                          <span>Excluded: under 2% of the data (5-301(d))</span>
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
      <EducationPanel pageKey="results.figures" />
    </Box>
  );
};

interface BasisProps {
  runId: number;
  basis: AedtDerivedBasis;
  canAttest: boolean;
}

const DerivedBasis = ({ runId, basis, canAttest }: BasisProps) => {
  const confirm = useConfirmAedtDerivedBasis(runId);
  const formatDate = useFormattedDate();
  return (
    <Box sx={cardSx}>
      <Typography sx={{ ...titleSx, mb: "8px" }}>Data basis by category</Typography>
      <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: "12px" }}>
        {basis.summary}
      </Typography>
      <Stack gap="8px" sx={{ mb: "12px" }}>
        {basis.perCategory.map((c) => (
          <Box key={c.category}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
              {CATEGORY_LABEL[c.category] ?? c.category}
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              {BASIS_LABEL[c.basis] ?? c.basis}
            </Typography>
            {c.expiryTrigger && (
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {c.expiryTrigger}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
      {basis.confirmed ? (
        <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
          <Typography sx={{ fontSize: 12, color: palette.status.success.text }}>
            Confirmed by
          </Typography>
          <PersonLabel userId={basis.confirmedBy ?? null} />
          {basis.confirmedAt && (
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              {formatDate(basis.confirmedAt)}
            </Typography>
          )}
        </Stack>
      ) : (
        <Stack gap="8px" alignItems="flex-start">
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
            This reading was derived from your answers and is listed as an open item until you
            confirm it. If it is wrong, change your answers instead.
          </Typography>
          <CustomizableButton
            variant="outlined"
            text="Confirm this reading"
            testId="aedt-confirm-basis"
            onClick={() => confirm.mutate()}
            isDisabled={!canAttest || confirm.isPending}
            loading={confirm.isPending}
          />
          {!canAttest && (
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              Only an Admin can confirm the data basis.
            </Typography>
          )}
          {confirm.error && (
            <Alert severity="error" sx={{ borderRadius: "4px" }}>
              {describeAedtError(confirm.error).message}
            </Alert>
          )}
        </Stack>
      )}
    </Box>
  );
};

/** One run: its data checks, its figures, its data basis and expiry, and its stances. */
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
        <Typography sx={titleSx}>
          <span>Run</span> <span>{run.id}</span>
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
            gap: "12px",
            mt: "12px",
          }}
        >
          <Meta label="Recorded" value={formatDate(run.created_at, { includeTime: true })} />
          <Meta label="Recorded by" value={<PersonLabel userId={run.created_by ?? null} />} />
          <Meta
            label="Rate computed"
            value={run.metric === "scoring_rate" ? "Scoring rate" : "Selection rate"}
          />
          <Meta label="Profile version" value={String(run.profile_version)} />
          <Meta label="Rows" value={run.row_count == null ? "—" : String(run.row_count)} />
          <Meta label="Dataset SHA-256" value={run.dataset_sha256 ?? "—"} breakAll />
        </Box>
      </Box>

      <Findings findings={findings} />

      {run.result_json ? (
        <Figures result={run.result_json} />
      ) : (
        <Alert severity="warning" sx={{ borderRadius: "4px" }}>
          No figures were computed for this run. The data checks above say why.
        </Alert>
      )}

      <Box sx={twoColumnSx}>
        <Stack gap="16px">
          {run.data_basis_json && (
            <DerivedBasis runId={run.id} basis={run.data_basis_json} canAttest={canAttest} />
          )}
          <Box sx={cardSx}>
            <Typography sx={{ ...titleSx, mb: "8px" }}>When this result stops applying</Typography>
            <Meta label="One year after this run" value={formatDate(run.expiry_date ?? null)} />
            {run.expiry_trigger && (
              <Box sx={{ mt: "8px" }}>
                <Meta label="Or earlier, when" value={run.expiry_trigger} />
              </Box>
            )}
          </Box>
        </Stack>
        <EducationPanel pageKey="expiry" />
      </Box>

      <StancePanel
        kind="run"
        stances={stances}
        generateBlockedReason={stanceReason}
        onGenerate={() => generate.mutate()}
        isGenerating={generate.isPending}
        generateError={generate.error ? describeAedtError(generate.error).message : null}
      />
    </Stack>
  );
};

const Meta = ({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: React.ReactNode;
  breakAll?: boolean;
}) => (
  <Box>
    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>{label}</Typography>
    <Box
      sx={{
        fontSize: 13,
        color: palette.text.secondary,
        wordBreak: breakAll ? "break-all" : "normal",
      }}
    >
      {value}
    </Box>
  </Box>
);

export default RunDetail;
