import { Box, Stack, Table, TableBody, TableCell, TableRow, Typography } from "@mui/material";
import { AlertCircle } from "lucide-react";
import Chip from "../../../components/Chip";
import StandardTableHead from "../../../components/Table/StandardTableHead";
import VWAvatar from "../../../components/Avatar/VWAvatar";
import { border, palette } from "../../../themes/palette";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type {
  AiAppAssessmentStatus,
  IAiAppAssessment,
  IAiAppQuestion,
  IAiAppQuestionnaire,
} from "../../../../domain/interfaces/i.aiAppBulk";
import type { StandardColumn } from "../../../../domain/types/standardTable";
import { getRiskLevel, RISK_SCORE_OPTIONS } from "../utils";
import { red } from "@design-tokens/primitives";

const LEVEL_BACKGROUNDS: Record<string, string> = {
  Low: palette.status.success.bg,
  Medium: palette.status.warning.bg,
  High: palette.accent.orange.bg,
  Critical: palette.status.error.bg,
};

export function RiskScoreChip({ score }: { score?: number | null }) {
  const { t } = useTranslation();
  if (score === null || score === undefined) {
    return <Typography sx={{ fontSize: 13 }}>—</Typography>;
  }
  const level = getRiskLevel(score);
  return (
    <Chip
      label={`${score} · ${t(level.label)}`}
      size="small"
      uppercase={false}
      textColor={level.color}
      backgroundColor={LEVEL_BACKGROUNDS[level.label]}
    />
  );
}

export function AssessmentStatusChip({ status }: { status: AiAppAssessmentStatus }) {
  return (
    <Chip
      label={status === "completed" ? "Completed" : "Pending"}
      variant={status === "completed" ? "success" : "warning"}
      size="small"
      uppercase={false}
    />
  );
}

export function AssessorName({ name }: { name?: string | null }) {
  if (!name) return <Typography sx={{ fontSize: 13 }}>—</Typography>;
  const [firstname, ...rest] = name.trim().split(/\s+/);
  return (
    <Stack direction="row" alignItems="center" gap="8px">
      <VWAvatar user={{ firstname, lastname: rest.join(" ") }} size="small" />
      <Typography sx={{ fontSize: 13 }}>{name}</Typography>
    </Stack>
  );
}

/** The questions to show: the copy on a completed assessment, otherwise the current list. */
export function questionsFor(
  assessment: IAiAppAssessment,
  questionnaires: IAiAppQuestionnaire[],
): IAiAppQuestion[] {
  if (assessment.questions?.length) return assessment.questions;
  return questionnaires.find((q) => q.id === assessment.questionnaire_id)?.questions ?? [];
}

export function questionnaireNameFor(
  assessment: IAiAppAssessment,
  questionnaires: IAiAppQuestionnaire[],
): string {
  return (
    assessment.questionnaire_name ??
    questionnaires.find((q) => q.id === assessment.questionnaire_id)?.name ??
    "—"
  );
}

export function AssessmentAnswers({
  questions,
  answers,
}: {
  questions: IAiAppQuestion[];
  answers?: Record<string, number> | null;
}) {
  return (
    <Stack gap="12px">
      {questions.map((question) => {
        const rating = RISK_SCORE_OPTIONS.find((o) => o._id === answers?.[question.key]);
        return (
          <Box key={question.key}>
            <Stack direction="row" justifyContent="space-between" gap="16px">
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{question.label}</Typography>
              <Typography sx={{ fontSize: 13, whiteSpace: "nowrap" }}>
                {rating?.name ?? "—"}
              </Typography>
            </Stack>
            {question.description && (
              <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                {question.description}
              </Typography>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

/** Every tile is the same width, so the counts line up column to column. */
const SUMMARY_TILE_WIDTH = "200px";

export function CountSummary({
  items,
}: {
  items: Array<{
    label: string;
    value: number;
    bordered?: boolean;
    /** Turns the box red, for a count that needs attention. */
    tone?: "default" | "error";
  }>;
}) {
  return (
    <Stack direction="row" gap={8} flexWrap="wrap">
      {items.map((item) => {
        const isError = item.tone === "error";
        return (
          <Box
            key={item.label}
            sx={
              item.bordered
                ? {
                    width: SUMMARY_TILE_WIDTH,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    py: 4,
                    px: 6,
                    border: `1px solid ${isError ? palette.status.error.border : border.light}`,
                    borderRadius: "4px",
                    backgroundColor: isError ? red[50] : "transparent",
                  }
                : undefined
            }
          >
            <Typography
              sx={{
                fontSize: 13,
                color: isError ? palette.status.error.text : palette.text.secondary,
              }}
            >
              {item.label}
            </Typography>
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 600,
                textAlign: "left",
                color: isError ? palette.status.error.text : undefined,
              }}
            >
              {item.value}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

// The header's padding comes from components/Table/index.css (12px 10px), which
// outranks a cell's own sx, so body cells use the same values to line up with it.
const issueCellSx = {
  fontSize: 13,
  padding: "12px 10px",
  verticalAlign: "middle",
};

const NO_SORT = { key: "", direction: null } as const;
const noop = () => undefined;

export function RowIssuesTable({
  title,
  headers,
  rows,
  tone = "error",
}: {
  title: string;
  headers: [string, string, string];
  rows: Array<{ row: number; field: string; message: string }>;
  tone?: "error" | "neutral";
}) {
  const isError = tone === "error";
  const columns: StandardColumn[] = headers.map((header) => ({
    id: header,
    label: header,
    sortable: false,
  }));

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: "8px" }}>
        <AlertCircle
          size={14}
          strokeWidth={2}
          color={isError ? palette.status.error.text : palette.text.tertiary}
        />
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: isError ? palette.status.error.text : palette.text.secondary,
          }}
        >
          {title}
        </Typography>
      </Stack>
      <Box
        sx={{
          maxHeight: "300px",
          overflow: "auto",
          border: `1px solid ${isError ? palette.status.error.border : border.light}`,
          borderRadius: "4px",
          ...(isError
            ? {
                "& .MuiTableCell-head": { backgroundColor: red[50] },
                "& .MuiTableCell-head .MuiTypography-root": {
                  color: palette.status.error.text,
                },
              }
            : {}),
        }}
      >
        <Table size="small">
          <StandardTableHead columns={columns} sortConfig={NO_SORT} onSort={noop} />
          <TableBody>
            {rows.map((issue, index) => (
              <TableRow key={`${issue.row}-${issue.field}-${index}`}>
                <TableCell sx={issueCellSx}>{issue.row}</TableCell>
                <TableCell sx={issueCellSx}>{issue.field}</TableCell>
                <TableCell sx={issueCellSx}>{issue.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
