/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    Box,
    TableFooter,
    useTheme,
    Typography,
    Tooltip,
    Chip,
} from "@mui/material";

import { ChevronUp, ChevronDown, ChevronsUpDown, Link2 } from "lucide-react";
import { singleTheme } from "../../../../../src/presentation/themes";
import {
    paginationMenuProps,
    paginationSelectStyle,
    showingTextCellStyleForPolicyLinked,
    tableFooterRowStyle,
    tableRowDeletingStyle,
    tableRowHoverStyle,
} from "../../../../../src/presentation/pages/ModelInventory/style";
import CustomIconButton from "../../../components/IconButton";
import { EmptyState } from "../../EmptyState";
import TablePaginationActions from "../../TablePagination";
import { paginationStyle } from "../styles";
import { useUserMap } from "../../../../../src/presentation/hooks/userMap";
import { text } from "../../../themes/palette";

interface LinkedPolicyObjectsTableProps {
    policies: any[];
    onRemove: (type: string, id: number) => void;
    deletingId?: number | null;
    hidePagination?: boolean;
    paginated?: boolean;
    type?: string;
}

const SORT_KEY = "vw_link_policies_object_for_risk_and_evidence_sort";

type SortDirection = "asc" | "desc" | null;
type SortConfig = { key: string; direction: SortDirection };

const TABLE_COLUMNS = [
    { id: "title", label: "Title", sortable: true },
    { id: "status", label: "TYPE", sortable: true },
    { id: "tags", label: "Tags", sortable: true },
    { id: "author", label: "Author", sortable: true },
    { id: "last_updated", label: "Last updated", sortable: true },
    { id: "updated_by", label: "Updated by", sortable: true },
    { id: "actions", label: "", sortable: false },
];

const SortableTableHead = ({
    columns,
    sortConfig,
    onSort,
    theme,
}: {
    columns: typeof TABLE_COLUMNS;
    sortConfig: SortConfig;
    onSort: (columnId: string) => void;
    theme: any;
}) => {
    return (
        <TableHead
            sx={{
                backgroundColor:
                    singleTheme.tableStyles.primary.header.backgroundColors,
            }}
        >
            <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                {/* <TableCell width={50}></TableCell> */}

                {columns.map((column) => (
                    <TableCell
                        key={column.id}
                        component={"td"}
                        className="risk-link-table-header-cel"
                        sx={{
                            ...singleTheme.tableStyles.primary.header.cell,
                            ...(column.id === "actions" && {
                                position: "sticky",
                                right: 0,
                                zIndex: 10,
                                backgroundColor:
                                    singleTheme.tableStyles.primary.header
                                        .backgroundColors,
                            }),
                            ...(column.sortable
                                ? {
                                      cursor: "pointer",
                                      userSelect: "none",
                                      "&:hover": {
                                          backgroundColor:
                                              "rgba(0, 0, 0, 0.04)",
                                      },
                                  }
                                : {}),
                        }}
                        onClick={() => column.sortable && onSort(column.id)}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: theme.spacing(2),
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    fontWeight: 500,
                                    color:
                                        sortConfig.key === column.id
                                            ? "primary.main"
                                            : "inherit",
                                }}
                            >
                                {column.label}
                            </Typography>
                            {column.sortable && (
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        color:
                                            sortConfig.key === column.id
                                                ? "primary.main"
                                                : `${text.disabled}`,
                                    }}
                                >
                                    {sortConfig.key === column.id &&
                                        sortConfig.direction === "asc" && (
                                            <ChevronUp size={16} />
                                        )}
                                    {sortConfig.key === column.id &&
                                        sortConfig.direction === "desc" && (
                                            <ChevronDown size={16} />
                                        )}
                                    {sortConfig.key !== column.id && (
                                        <ChevronsUpDown size={16} />
                                    )}
                                </Box>
                            )}
                        </Box>
                    </TableCell>
                ))}
            </TableRow>
        </TableHead>
    );
};

const SelectorVertical = (props: any) => (
    <ChevronsUpDown size={16} {...props} />
);

const LinkedPolicyObjectsTable: React.FC<LinkedPolicyObjectsTableProps> = ({
    policies,
    onRemove,
    deletingId,
    hidePagination = false,
    paginated = true,
    type,
}) => {
    const theme = useTheme();
    const { userMap } = useUserMap();

    const cellStyle = singleTheme.tableStyles.primary.body.cell;

    // Sorting
    const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
        const saved = localStorage.getItem(SORT_KEY);
        return saved ? JSON.parse(saved) : { key: "", direction: null };
    });

    // Save sorting state to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem(SORT_KEY, JSON.stringify(sortConfig));
    }, [sortConfig]);

    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // -----------------------------
    // Handle Sorting
    // -----------------------------
    const handleSort = (columnId: string) => {
        setSortConfig((prev) => {
            if (prev.key === columnId) {
                if (prev.direction === "asc")
                    return { key: columnId, direction: "desc" };
                if (prev.direction === "desc")
                    return { key: "", direction: null };
            }
            return { key: columnId, direction: "asc" };
        });

        localStorage.setItem(
            SORT_KEY,
            JSON.stringify({ key: columnId, direction: "asc" })
        );
    };

    // -----------------------------
    // SORTED DATA
    // -----------------------------

    type Item = {
        id: any;
        type: any;
        name: any;
        created_by: string;
        due_date: any;
    };

    const sortedData = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) return policies;

        const key = sortConfig.key as keyof Item;

        return [...policies].sort((a, b) => {
            const A = (a[key] || "").toString().toLowerCase();
            const B = (b[key] || "").toString().toLowerCase();

            if (A < B) return sortConfig.direction === "asc" ? -1 : 1;
            if (A > B) return sortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });
    }, [policies, sortConfig]);

    const getRange = `${page * rowsPerPage + 1} - ${Math.min(
        page * rowsPerPage + rowsPerPage,
        sortedData.length
    )}`;

    // -----------------------------
    // PAGINATION HANDLERS
    // -----------------------------
    const handleChangePage = useCallback((_: unknown, newPage: number) => {
        setPage(newPage);
    }, []);

    const handleChangeRowsPerPage = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
        },
        []
    );

    const MAX_VISIBLE_CHARS = 15;

    const TruncatedCell: React.FC<{ value?: string | null }> = ({ value }) => {
        const text = value ?? "-";
        const shouldTruncate = text.length > MAX_VISIBLE_CHARS;
        const displayText = shouldTruncate ? `${text.slice(0, MAX_VISIBLE_CHARS)}...` : text;
      
        return shouldTruncate ? (
          <Tooltip title={text} arrow>
            <span style={{ cursor: "help" }}>{displayText}</span>
          </Tooltip>
        ) : (
          <span>{displayText}</span>
        );
      };

    // -----------------------------
    // TABLE BODY (LIKE EVIDENCE HUB)
    // -----------------------------

    const tableBody = useMemo(
        () => (
          <TableBody>
            {sortedData.length ? (
              sortedData
                .slice(
                  hidePagination ? 0 : page * rowsPerPage,
                  hidePagination
                    ? Math.min(sortedData.length, 100)
                    : page * rowsPerPage + rowsPerPage
                )
                .map((row) => (
                  <TableRow
                    key={row.id}
                    sx={{
                      ...singleTheme.tableStyles.primary.body.row,
                      ...tableRowHoverStyle,
                      ...(deletingId === row.id && tableRowDeletingStyle),
                    }}
                  >
                    {/* TITLE */}
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor:
                          sortConfig?.key?.toLowerCase().includes("title")
                            ? "#e8e8e8"
                            : "#fafafa",
                      }}
                    >
                      <TruncatedCell value={row.title} />
                    </TableCell>
      
                    {/* STATUS */}
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor:
                          sortConfig?.key?.toLowerCase().includes("status")
                            ? "background.surface"
                            : "inherit",
                      }}
                    >
                      <Chip label={row.status} />
                    </TableCell>
      
                    {/* TAGS */}
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor:
                          sortConfig?.key?.toLowerCase().includes("tags")
                            ? "background.surface"
                            : "inherit",
                      }}
                    >
                      <TruncatedCell value={row.tags?.join(", ")} />
                    </TableCell>
      
                    {/* AUTHOR */}
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor:
                          sortConfig?.key?.toLowerCase().includes("author")
                            ? "background.surface"
                            : "inherit",
                      }}
                    >
                      <TruncatedCell
                        value={userMap.get(String(row.author_id))}
                      />
                    </TableCell>
      
                    {/* LAST UPDATED AT */}
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor:
                          sortConfig?.key &&
                          (sortConfig.key.toLowerCase().includes("last") ||
                            sortConfig.key.toLowerCase().includes("updated")) &&
                          !sortConfig.key.toLowerCase().includes("by")
                            ? "background.surface"
                            : "inherit",
                      }}
                    >
                      {row.last_updated_at
                        ? new Date(row.last_updated_at).toLocaleString()
                        : "-"}
                    </TableCell>
      
                    {/* LAST UPDATED BY */}
                    <TableCell
                      sx={{
                        ...cellStyle,
                        backgroundColor:
                          sortConfig?.key
                            ?.toLowerCase()
                            .includes("updated by")
                            ? "background.surface"
                            : "inherit",
                      }}
                    >
                      <TruncatedCell
                        value={userMap.get(String(row.last_updated_by))}
                      />
                    </TableCell>
      
                    {/* ACTIONS */}
                    <TableCell
                      sx={{
                        position: "sticky",
                        right: 0,
                        background:
                          singleTheme.tableStyles.primary.header.backgroundColors,
                        zIndex: 10,
                      }}
                    >
                      <CustomIconButton
                        id={Number(row.id)}
                        // onDelete={() => onRemove(type!, row.id)}
                        onDelete={() => {
                          if (!type || row.id == null) return;
                          onRemove(type, Number(row.id));
                        }}
                        
                        onEdit={() => {}}
                        onMouseEvent={() => {}}
                        warningTitle={`Delete this policy?`}
                        warningMessage={`When you delete this policy, all data related to it will be removed. This action is non-recoverable.`}
                        type="LinkedObjectsType"
                      />
                    </TableCell>
                  </TableRow>
                ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMNS.length}
                  align="center"
                >
                  <EmptyState icon={Link2} message="No linked items found." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        ),
        [
          sortedData,
          hidePagination,
          page,
          rowsPerPage,
          deletingId,
          cellStyle,
          sortConfig,
          userMap,
          type,
          onRemove,
        ]
      );
      

    return (
        <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={singleTheme.tableStyles.primary.frame}>
                {/* HEADER */}
                <SortableTableHead
                    columns={TABLE_COLUMNS.filter(
                        (c) => !(c.id === "due_date" && type !== "risk")
                    )}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    theme={theme}
                />

                {tableBody}

                {/* PAGINATION */}
                {paginated && !hidePagination && sortedData.length > 0 && (
                    <TableFooter>
                        <TableRow sx={tableFooterRowStyle(theme)}>
                            <TableCell sx={showingTextCellStyleForPolicyLinked(theme)}>
                                Showing {getRange} of {sortedData.length}
                            </TableCell>
                            <TablePagination
                                count={sortedData.length}
                                page={page}
                                rowsPerPage={rowsPerPage}
                                onPageChange={handleChangePage}
                                onRowsPerPageChange={handleChangeRowsPerPage}
                                rowsPerPageOptions={[5, 10, 15, 25]}
                                ActionsComponent={(props) => (
                                  <TablePaginationActions {...props} />
                              )}
                                sx={paginationStyle(theme)}
                                slotProps={{
                                    select: {
                                        MenuProps: paginationMenuProps(theme),
                                        IconComponent: SelectorVertical,
                                        sx: paginationSelectStyle(theme),
                                    },
                                }}
                            />
                        </TableRow>
                    </TableFooter>
                )}
            </Table>
        </TableContainer>
    );
};

export default LinkedPolicyObjectsTable;
