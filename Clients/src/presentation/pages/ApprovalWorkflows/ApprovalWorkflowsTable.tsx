import React, { useCallback, useMemo } from "react";
import {
    TableContainer,
    Table,
    TableBody,
    TableRow,
    TableCell,
    Stack,
} from "@mui/material";

import {
    workflowRowHover,
    workflowTableRowDeletingStyle,
    bodyCellTitleStyle,
    bodyCellEntityStyle,
    bodyCellStepsStyle,
    bodyCellDateStyle,
    bodyCellActionsStyle,
} from "./style";

import CustomIconButton from "../../components/IconButton";
import { singleTheme } from "../../themes";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc);
import { ClipboardCheck, Send, UserCheck, MessageSquare } from "lucide-react";
import { ApprovalWorkflowModel } from "../../../domain/models/Common/approvalWorkflow/approvalWorkflow.model";
import { entities, TABLE_COLUMNS } from "./arrays";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { ApprovalWorkflowTableProps } from "src/presentation/types/interfaces/i.table";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";

const cellStyle = singleTheme.tableStyles.primary.body.cell;

function workflowSortComparator(
    a: ApprovalWorkflowModel,
    b: ApprovalWorkflowModel,
    key: string
): number {
    switch (key) {
        case "workflow_title": {
            const aVal = a.workflow_title?.toLowerCase() || "";
            const bVal = b.workflow_title?.toLowerCase() || "";
            return aVal.localeCompare(bVal);
        }
        case "entity_name": {
            const aEntity = entities.find(e => e._id === a.entity)?.name?.toLowerCase() || "";
            const bEntity = entities.find(e => e._id === b.entity)?.name?.toLowerCase() || "";
            return aEntity.localeCompare(bEntity);
        }
        case "steps": {
            const aVal = a.steps?.length || 0;
            const bVal = b.steps?.length || 0;
            return aVal - bVal;
        }
        case "date_updated": {
            const aVal = a.date_updated ? new Date(a.date_updated).getTime() : 0;
            const bVal = b.date_updated ? new Date(b.date_updated).getTime() : 0;
            return aVal - bVal;
        }
        default:
            return 0;
    }
}

const ApprovalWorkflowsTable: React.FC<ApprovalWorkflowTableProps> = ({
    data,
    onEdit,
    onArchive,
    archivedId,
    visibleColumns,
}) => {
    const isVisible = useCallback(
        (key: string) => {
            if (!visibleColumns) return true;
            return visibleColumns.has(key);
        },
        [visibleColumns]
    );

    const visibleTableColumns = useMemo(
        () => TABLE_COLUMNS.filter((col) => isVisible(col.id)),
        [isVisible]
    );

    const {
        sortConfig,
        handleSort,
        sortedRows,
        validPage,
        rowsPerPage,
        handleChangePage,
        handleChangeRowsPerPage,
        getRange,
        totalCount,
    } = useStandardTable<ApprovalWorkflowModel>({
        rows: data || [],
        storageKey: "workflow_table",
        defaultSortColumn: "",
        defaultSortDirection: null,
        sortComparator: workflowSortComparator,
    });

    if (!sortedRows || sortedRows.length === 0) {
        return (
            <EmptyState icon={ClipboardCheck} message="No approval workflows yet. Define review and sign-off chains for your governance process.">
                <EmptyStateTip
                    icon={Send}
                    title="Create approval workflows"
                    description="Define multi-step review chains that run automatically when controls, evidence, or policies need sign-off."
                />
                <EmptyStateTip
                    icon={UserCheck}
                    title="Assign reviewers"
                    description="Add team members as reviewers at each step. They'll be notified when items reach their review stage."
                />
                <EmptyStateTip
                    icon={MessageSquare}
                    title="Track feedback and comments"
                    description="Reviewers can approve, reject, or request changes with detailed comments. The full audit trail is preserved."
                />
            </EmptyState>
        );
    }

    return (
        <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={singleTheme.tableStyles.primary.frame}>
                <StandardTableHead
                    columns={visibleTableColumns}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
                <TableBody>
                    {sortedRows
                        .slice(
                            validPage * rowsPerPage,
                            validPage * rowsPerPage + rowsPerPage
                        )
                        .map((workflow) => (
                            <TableRow
                                key={workflow.id}
                                onClick={() => onEdit?.(workflow.id.toString())}
                                sx={{
                                    ...singleTheme.tableStyles.primary.body.row,
                                    ...workflowRowHover,
                                    ...(archivedId === workflow.id?.toString() &&
                                        workflowTableRowDeletingStyle),
                                    cursor: "pointer",
                                }}
                            >
                                {isVisible("workflow_title") && (
                                    <TableCell
                                        sx={bodyCellTitleStyle(cellStyle, sortConfig.key === "workflow_title")}
                                    >
                                        {workflow.workflow_title}
                                    </TableCell>
                                )}
                                {isVisible("entity_name") && (
                                    <TableCell
                                        sx={bodyCellEntityStyle(cellStyle, sortConfig.key === "entity_name")}
                                    >
                                        {entities.find(e => e._id === workflow.entity)?.name}
                                    </TableCell>
                                )}
                                {isVisible("steps") && (
                                    <TableCell
                                        sx={bodyCellStepsStyle(cellStyle, sortConfig.key === "steps")}
                                    >
                                        {workflow.steps?.length}
                                    </TableCell>
                                )}
                                {isVisible("date_updated") && (
                                    <TableCell
                                        sx={bodyCellDateStyle(cellStyle, sortConfig.key === "date_updated")}
                                    >
                                        {workflow.date_updated
                                            ? dayjs
                                                .utc(workflow.date_updated)
                                                .format("YYYY-MM-DD HH:mm")
                                            : "-"}
                                    </TableCell>
                                )}
                                {isVisible("actions") && (
                                    <TableCell
                                        sx={bodyCellActionsStyle(cellStyle)}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Stack direction="row" spacing={1}>
                                            <CustomIconButton
                                                id={workflow.id}
                                                type="workflow"
                                                onEdit={() =>
                                                    onEdit?.(workflow.id.toString())
                                                }
                                                onDelete={() =>
                                                    onArchive?.(workflow.id.toString())
                                                }
                                                onMouseEvent={() => { }}
                                                warningTitle="Are you sure?"
                                                warningMessage="You are about to archive this workflow. This action cannot be undone. You can also choose to edit or view the workflow instead."
                                            />
                                        </Stack>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                </TableBody>
                <StandardTablePagination
                    totalCount={totalCount}
                    page={validPage}
                    rowsPerPage={rowsPerPage}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    getRange={getRange}
                    entityLabel="workflow"
                    colSpan={visibleTableColumns.length}
                />
            </Table>
        </TableContainer>
    );
};

export default ApprovalWorkflowsTable;
