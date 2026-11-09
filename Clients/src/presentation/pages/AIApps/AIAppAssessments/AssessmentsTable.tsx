import {
  Box,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { ClipboardCheck, Eye, SquarePen } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { palette } from "../../../themes/palette";
import StandardTableHead from "../../../components/Table/StandardTableHead";
import StandardTablePagination from "../../../components/Table/StandardTablePagination";
import { TableEmptyStateLayout } from "../../../components/Table/TableEmptyStateLayout";
import { EmptyState } from "../../../components/EmptyState";
import Checkbox from "../../../components/Inputs/Checkbox";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import type { SortConfig, StandardColumn } from "../../../../domain/types/standardTable";
import type {
  IAiAppAssessment,
  IAiAppQuestionnaire,
} from "../../../../domain/interfaces/i.aiAppBulk";
import {
  AssessmentStatusChip,
  AssessorName,
  questionnaireNameFor,
  RiskScoreChip,
} from "./AssessmentDisplay";

export interface AssessmentsTableSelection {
  isSelected: (id: number) => boolean;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
}

interface AssessmentsTableProps {
  assessments: IAiAppAssessment[];
  questionnaires: IAiAppQuestionnaire[];
  total: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  onOpen: (assessment: IAiAppAssessment) => void;
  selection?: AssessmentsTableSelection;
  emptyMessage: string;
}

const COLUMNS: StandardColumn[] = [
  { id: "app", label: "AI app", sortable: false },
  { id: "owner", label: "Owner", sortable: false },
  { id: "questionnaire", label: "Questionnaire", sortable: false },
  { id: "status", label: "Status", sortable: false },
  { id: "score", label: "Score", sortable: false },
  { id: "assessed_by", label: "Assessed by", sortable: false },
  { id: "assessed_on", label: "Assessed on", sortable: false },
  { id: "actions", label: "Actions", sortable: false, align: "right" },
];

/** The API has no sort parameter for this list. */
const NO_SORT: SortConfig = { key: "", direction: null };
const noop = () => undefined;

const cellSx = singleTheme.tableStyles.primary.body.cell;

const canOpen = (assessment: IAiAppAssessment) =>
  assessment.status === "completed" || !!assessment.can_answer;

export default function AssessmentsTable({
  assessments,
  questionnaires,
  total,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  onOpen,
  selection,
  emptyMessage,
}: AssessmentsTableProps) {
  const { t } = useTranslation();
  const formatDate = useFormattedDate();

  const header = (
    <StandardTableHead
      columns={COLUMNS}
      sortConfig={NO_SORT}
      onSort={noop}
      selection={
        selection && assessments.length > 0
          ? {
              allSelected: selection.allSelected,
              someSelected: selection.someSelected,
              onToggleAll: selection.onToggleAll,
              ariaLabel: t("Select all pending assessments on this page"),
            }
          : undefined
      }
    />
  );

  if (assessments.length === 0) {
    return (
      <TableEmptyStateLayout header={header}>
        <EmptyState icon={ClipboardCheck} message={emptyMessage} />
      </TableEmptyStateLayout>
    );
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={singleTheme.tableStyles.primary.frame}>
        {header}
        <TableBody>
          {assessments.map((assessment) => {
            const appName = assessment.ai_app_name ?? "—";
            const openable = canOpen(assessment);
            return (
              <TableRow
                key={assessment.id}
                hover
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  cursor: openable ? "pointer" : "default",
                }}
                onClick={openable ? () => onOpen(assessment) : undefined}
              >
                {selection && (
                  <TableCell
                    sx={{ width: 40, minWidth: 40, maxWidth: 40, padding: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                      <Checkbox
                        id={`ai-app-assessment-checkbox-${assessment.id}`}
                        value={String(assessment.id)}
                        isChecked={selection.isSelected(assessment.id)}
                        onChange={() => selection.onToggle(assessment.id)}
                        onClick={(e) => e.stopPropagation()}
                        isDisabled={assessment.status !== "pending"}
                        ariaLabel={fill(t("Select the assessment for {name}"), { name: appName })}
                        size="small"
                        sx={{ p: 0 }}
                      />
                    </Box>
                  </TableCell>
                )}
                <TableCell sx={cellSx}>{appName}</TableCell>
                <TableCell sx={cellSx}>
                  {assessment.owner_name || (
                    <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                      No owner
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={cellSx}>
                  {questionnaireNameFor(assessment, questionnaires)}
                </TableCell>
                <TableCell sx={cellSx}>
                  <AssessmentStatusChip status={assessment.status} />
                </TableCell>
                <TableCell sx={cellSx}>
                  <RiskScoreChip score={assessment.risk_score} />
                </TableCell>
                <TableCell sx={cellSx}>
                  <AssessorName name={assessment.assessed_by_name} />
                </TableCell>
                <TableCell sx={cellSx}>{formatDate(assessment.assessed_at)}</TableCell>
                <TableCell sx={cellSx} align="right">
                  <Stack
                    direction="row"
                    justifyContent="flex-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {assessment.status === "completed" ? (
                      <Tooltip title="View answers">
                        <IconButton
                          size="small"
                          onClick={() => onOpen(assessment)}
                          aria-label={fill(t("View answers for {name}"), { name: appName })}
                          data-testid={`ai-app-assessment-view-${assessment.id}`}
                        >
                          <Eye size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Tooltip>
                    ) : assessment.can_answer ? (
                      <Tooltip title="Answer">
                        <IconButton
                          size="small"
                          onClick={() => onOpen(assessment)}
                          aria-label={fill(t("Answer the assessment for {name}"), {
                            name: appName,
                          })}
                          data-testid={`ai-app-assessment-answer-${assessment.id}`}
                        >
                          <SquarePen size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      "—"
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {total > 0 && (
          <StandardTablePagination
            totalCount={total}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, next) => onPageChange(next)}
            onRowsPerPageChange={(event) => onRowsPerPageChange(parseInt(event.target.value, 10))}
            getRange={`${page * rowsPerPage + 1} - ${Math.min((page + 1) * rowsPerPage, total)}`}
            entityLabel="assessment"
            entityLabelPlural="assessments"
            colSpan={COLUMNS.length + (selection ? 1 : 0)}
          />
        )}
      </Table>
    </TableContainer>
  );
}
