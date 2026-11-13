import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Chip from "../../../components/Chip";
import VWAvatar from "../../../components/Avatar/VWAvatar";
import { palette, radiusPx } from "../../../themes/palette";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import type {
  AiAppAssessmentStatus,
  IAiAppAssessment,
  IAiAppQuestion,
  IAiAppQuestionnaire,
} from "../../../../domain/interfaces/i.aiAppBulk";
import { getRiskLevel, RISK_SCORE_OPTIONS } from "../utils";

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

export function CountSummary({ items }: { items: Array<{ label: string; value: number }> }) {
  return (
    <Stack direction="row" gap="32px" flexWrap="wrap">
      {items.map((item) => (
        <Box key={item.label}>
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>{item.label}</Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{item.value}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

const issueCellSx = { fontSize: 13, padding: "6px 12px", verticalAlign: "top" };

export function RowIssuesTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: [string, string, string];
  rows: Array<{ row: number; field: string; message: string }>;
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600, mb: "8px" }}>{title}</Typography>
      <Box
        sx={{
          maxHeight: "220px",
          overflow: "auto",
          border: `1px solid ${palette.border.dark}`,
          borderRadius: radiusPx.sm,
        }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {headers.map((header) => (
                <TableCell key={header} sx={{ ...issueCellSx, fontWeight: 600 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
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
