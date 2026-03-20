import {
    TableContainer,
    Table,
    TableHead,
    TableBody,
    TableFooter,
    TablePagination,
    TableRow,
    TableCell,
    Box,
    useTheme,
    Stack,
} from "@mui/material";

import {
    workflowRowHover,
    workflowTableRowDeletingStyle,
    workflowFooterRow,
    workflowShowingText,
    workflowPaginationMenu,
    workflowPaginationSelect,
    workflowPagination,
    headerCellEntityStyle,
    headerCellStepsStyle,
    headerCellDateStyle,
    headerCellActionsStyle,
    sortableHeaderStyle,
    headerContentBoxStyle,
    headerLabelStyle,
    sortIconBoxStyle,
    bodyCellTitleStyle,
    bodyCellEntityStyle,
    bodyCellStepsStyle,
    bodyCellDateStyle,
    bodyCellActionsStyle,
} from "./style";

import CustomIconButton from "../../components/IconButton";
import { singleTheme } from "../../themes";
import { useState, useCallback, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc);
import { ChevronsUpDown, ChevronUp, ChevronDown, ClipboardCheck, Send, UserCheck, MessageSquare } from "lucide-react";
import { ApprovalWorkflowModel } from "../../../domain/models/Common/approvalWorkflow/approvalWorkflow.model";
import TablePaginationActions from "../../components/TablePagination";
import { entities } from "./arrays";
import { TABLE_COLUMNS } from "./arrays";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { ApprovalWorkflowTableProps } from "src/presentation/types/interfaces/i.table";

const cellStyle = singleTheme.tableStyles.primary.body.cell;

const WORKFLOW_TABLE_SORTING_KEY = "verifywise_workflow_table_sorting";
const DEFAULT_ROWS_PER_PAGE = 10;
const STORAGE_KEY = 'workflow-table-rows-per-page';

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
    key: string;
    direction: SortDirection;
};

const ApprovalWorkflowsTable: React.FC<ApprovalWorkflowTableProps> = ({
    data,
    onEdit,
    onArchive,
    archivedId,
    visibleColumns,
}) => {

    const theme = useTheme();
    const isVisible = useCallback(
        (key: string) => {
            if (!visibleColumns) return true;
            return visibleColumns.has(key);
        },
        [visibleColumns]
    );
    const [page, setPage] = useState(0);

    // Initialize rowsPerPage from localStorage or default
    const [rowsPerPage, setRowsPerPage] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? parseInt(stored, 10) : DEFAULT_ROWS_PER_PAGE;
    });

    // Initialize sorting state from localStorage or default to no sorting
    const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
        const saved = localStorage.getItem(WORKFLOW_TABLE_SORTING_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return { key: "", direction: null };
            }
        }
        return { key: "", direction: null };
    });

    // Save sorting state to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem(WORKFLOW_TABLE_SORTING_KEY, JSON.stringify(sortConfig));
    }, [sortConfig]);

    // Pagination handlers
    const handleChangePage = useCallback(
        (_: unknown, newPage: number) => setPage(newPage),
        []
    );

    const handleChangeRowsPerPage = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const newRowsPerPage = parseInt(event.target.value, 10);
            setRowsPerPage(newRowsPerPage);
            localStorage.setItem(STORAGE_KEY, newRowsPerPage.toString());
            setPage(0);
        },
        []
    );

    // Sorting handler
    const handleSort = useCallback((columnId: string) => {
        setSortConfig((prevConfig) => {
            if (prevConfig.key === columnId) {
                // Toggle direction if same column, or clear if already descending
                if (prevConfig.direction === "asc") {
                    return { key: columnId, direction: "desc" };
                } else if (prevConfig.direction === "desc") {
                    return { key: "", direction: null };
                }
            }
            // New column or first sort
            return { key: columnId, direction: "asc" };
        });
    }, []);

    // Sort the workflow data based on current sort configuration
    const sortedData = useMemo(() => {
        if (!data || !sortConfig.key || !sortConfig.direction) {
            return data || [];
        }

        const sortableData = [...data];

        return sortableData.sort((a: ApprovalWorkflowModel, b: ApprovalWorkflowModel) => {
            let aValue: string | number;
            let bValue: string | number;

            const sortKey = sortConfig.key.trim().toLowerCase();

            // Handle different column types for workflows
            if (sortKey.includes("title")) {
                aValue = a.workflow_title?.toLowerCase() || "";
                bValue = b.workflow_title?.toLowerCase() || "";
            } else if (sortKey.includes("entity")) {
                const aEntity = entities.find(e => e._id === a.entity)?.name || "";
                const bEntity = entities.find(e => e._id === b.entity)?.name || "";
                aValue = aEntity.toLowerCase();
                bValue = bEntity.toLowerCase();
            } else if (sortKey.includes("steps")) {
                aValue = a.steps?.length || 0;
                bValue = b.steps?.length || 0;
            } else if (sortKey.includes("date") && sortKey.includes("updated")) {
                aValue = a.date_updated ? new Date(a.date_updated).getTime() : 0;
                bValue = b.date_updated ? new Date(b.date_updated).getTime() : 0;
            } else {
                return 0;
            }

            // Handle string comparisons
            if (typeof aValue === "string" && typeof bValue === "string") {
                const comparison = aValue.localeCompare(bValue);
                return sortConfig.direction === "asc" ? comparison : -comparison;
            }

            // Handle number comparisons
            if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });
    }, [data, sortConfig]);

    // Paginate the sorted data
    const startIndex = page * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedData = sortedData.slice(startIndex, endIndex);

    // Calculate display range for "Showing X-Y of Z"
    const getRange = () => {
        if (!sortedData || sortedData.length === 0) return "0-0";
        const start = page * rowsPerPage + 1;
        const end = Math.min((page + 1) * rowsPerPage, sortedData.length);
        return `${start}-${end}`;
    };

    // Return early with just EmptyState if no data (consistent with other tables)
    if (!sortedData || sortedData.length === 0) {
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
                <TableHead
                    sx={{
                        backgroundColor:
                            singleTheme.tableStyles.primary.header.backgroundColors,
                    }}
                >
                    <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                        {TABLE_COLUMNS.filter((column) => isVisible(column.id)).map((column) => {
                            const isLastColumn = column.id === "actions";
                            const sortable = !["actions"].includes(column.id);

                            return (
                                <TableCell
                                    component="td"
                                    key={column.id}
                                    sx={{
                                        ...singleTheme.tableStyles.primary.header.cell,
                                        ...(column.id === "entity_name" && headerCellEntityStyle),
                                        ...(column.id === "steps" && headerCellStepsStyle),
                                        ...(column.id === "date_updated" && headerCellDateStyle),
                                        ...(column.id === "actions" && headerCellActionsStyle(singleTheme.tableStyles.primary.header.backgroundColors)),
                                        ...(!isLastColumn && sortable && sortableHeaderStyle),
                                    }}
                                    onClick={() => sortable && handleSort(column.label)}
                                >
                                    <Box sx={headerContentBoxStyle(theme)}>
                                        <Box sx={headerLabelStyle(sortConfig.key === column.label)}>
                                            {column.label}
                                        </Box>
                                        {sortable && (
                                            <Box sx={sortIconBoxStyle(sortConfig.key === column.label)}>
                                                {sortConfig.key === column.label && sortConfig.direction === "asc" && (
                                                    <ChevronUp size={16} />
                                                )}
                                                {sortConfig.key === column.label && sortConfig.direction === "desc" && (
                                                    <ChevronDown size={16} />
                                                )}
                                                {sortConfig.key !== column.label && (
                                                    <ChevronsUpDown size={16} />
                                                )}
                                            </Box>
                                        )}
                                    </Box>
                                </TableCell>
                            );
                        })}
                    </TableRow>
                </TableHead>

                <TableBody>
                    {paginatedData.map((workflow) => (
                        <TableRow
                            key={workflow.id}
                            onClick={() => onEdit?.(workflow.id.toString())}
                            sx={{
                                ...singleTheme.tableStyles.primary.body.row,
                                ...workflowRowHover,
                                ...(archivedId ===
                                    workflow.id?.toString() &&
                                    workflowTableRowDeletingStyle),
                                cursor: "pointer",
                            }}
                        >
                            {isVisible("workflow_title") && (
                                <TableCell
                                    sx={bodyCellTitleStyle(cellStyle, !!(sortConfig.key && sortConfig.key.toLowerCase().includes("title")))}
                                >
                                    {workflow.workflow_title}
                                </TableCell>
                            )}
                            {isVisible("entity_name") && (
                                <TableCell
                                    sx={bodyCellEntityStyle(cellStyle, !!(sortConfig.key && sortConfig.key.toLowerCase().includes("entity")))}
                                >
                                    {entities.find(e => e._id === workflow.entity)?.name}
                                </TableCell>
                            )}
                            {isVisible("steps") && (
                                <TableCell
                                    sx={bodyCellStepsStyle(cellStyle, !!(sortConfig.key && sortConfig.key.toLowerCase().includes("steps")))}
                                >
                                    {workflow.steps?.length}
                                </TableCell>
                            )}
                            {isVisible("date_updated") && (
                                <TableCell
                                    sx={bodyCellDateStyle(cellStyle, !!(sortConfig.key && sortConfig.key.toLowerCase().includes("date") && sortConfig.key.toLowerCase().includes("updated")))}
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
                                                onEdit?.(
                                                    workflow.id.toString()
                                                )
                                            }
                                            onDelete={() =>
                                                onArchive?.(
                                                    workflow.id.toString()
                                                )
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

                <TableFooter>
                    <TableRow sx={workflowFooterRow(theme)}>
                        <TableCell sx={workflowShowingText(theme)}>
                            Showing {getRange()} of {sortedData?.length} workflow(s)
                        </TableCell>
                        <TablePagination
                            count={sortedData?.length ?? 0}
                            page={page}
                            onPageChange={handleChangePage}
                            rowsPerPage={rowsPerPage}
                            rowsPerPageOptions={[5, 10, 15, 25]}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                            ActionsComponent={(props) => (
                                <TablePaginationActions {...props} />
                            )}
                            labelRowsPerPage="Rows per page"
                            labelDisplayedRows={({ page, count }) =>
                                `Page ${page + 1} of ${Math.max(
                                    0,
                                    Math.ceil(count / rowsPerPage)
                                )}`
                            }
                            slotProps={{
                                select: {
                                    MenuProps: workflowPaginationMenu(theme),
                                    sx: workflowPaginationSelect(theme),
                                },
                            }}
                            sx={workflowPagination(theme)}
                            colSpan={4}
                        />
                    </TableRow>
                </TableFooter>
            </Table>
        </TableContainer>
    )
}

export default ApprovalWorkflowsTable;