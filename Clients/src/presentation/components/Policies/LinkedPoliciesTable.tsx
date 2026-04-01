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
    Tooltip,
    TableFooter,
    useTheme,
    Typography,
} from "@mui/material";

import {
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    Link2,
} from "lucide-react";
import CustomIconButton from "../../components/IconButton";
import { FileIcon } from "../../components/FileIcon";
import { EmptyState } from "../../components/EmptyState";
import TablePaginationActions from "../../components/TablePagination";

import {
    tableRowHoverStyle,
    tableRowDeletingStyle,
    paginationStyle,
    paginationMenuProps,
    paginationSelectStyle,
    tableFooterRowStyle,
    showingTextCellStyle,
} from "../../pages/ModelInventory/style";

import { singleTheme } from "../../themes";
import { useUserMap } from "../../../presentation/hooks/userMap";
import { text } from "../../themes/palette";

interface LinkedObjectsTableProps {
    items: any[];
    projectRisk: any[];
    evidenceData: any[];
    onRemove: (type: string, id: number) => void;
    deletingId?: number | null;
    hidePagination?: boolean;
    paginated?: boolean;
    type?: string;
}


const SORT_KEY = "vw_link_risk_policies_sort";

type SortDirection = "asc" | "desc" | null;
type SortConfig = { key: string; direction: SortDirection };

const TABLE_COLUMNS = [
    { id: "name", label: "NAME", sortable: true },
    { id: "type", label: "TYPE", sortable: true },
    { id: "created_by", label: "CREATED BY", sortable: true },
    { id: "due_date", label: "DUE DATE", sortable: true },
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

const LinkedObjectsTable: React.FC<LinkedObjectsTableProps> = ({
    items,
    projectRisk,
    evidenceData,
    onRemove,
    deletingId,
    hidePagination = false,
    paginated = true,
    type
}) => {
    const theme = useTheme();
    const { userMap } = useUserMap();


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

    const mergedItems = useMemo(() => {

        return items.map((linked) => {
    
            let source: any = null;
    
            // Match based on type
            if (type === "risk") {
                source = projectRisk.find(
                    (r) => Number(r.id) === Number(linked.object_id)
                );
            }
    
            if (type === "evidence") {
                source = evidenceData.find(
                    (e) => Number(e.id) === Number(linked.object_id)
                );
            }
    
            // COMMON STRUCTURE for TABLE
            return {
                id: linked.id, // policy_linked_objects row id
                object_id: linked.object_id,
                type: type,

                // ---- NAME ----
                name:
                    type === "risk"
                        ? source?.risk_name || "-"
                        : type === "evidence"
                        ? source?.fileName || "-"
                        : "-",

                // ---- FILE NAME (for FileIcon) ----
                fileName: type === "evidence" ? source?.fileName || "" : "",
    
                // ---- CREATED BY ----
                created_by:
                    type === "risk"
                        ? userMap.get(String(source?.risk_owner)) || "-"
                        : type === "evidence"
                        ? userMap.get(String(source?.uploader)) || "-"
                        : "-",
    
                // ---- DUE DATE ----
                due_date:
                    type === "risk"
                        ? source?.deadline || "-"
                        : type === "evidence"
                        ?  "-"
                        : "-",
            };
        });
    }, [items, type, userMap, projectRisk, evidenceData]);

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
      fileName: string;
      created_by: string;
      due_date: any;
    };
    
    const sortedData = useMemo(() => {
      if (!sortConfig.key || !sortConfig.direction) return mergedItems;
    
      const key = sortConfig.key as keyof Item;
    
      return [...mergedItems].sort((a, b) => {
        const A = (a[key] || "").toString().toLowerCase();
        const B = (b[key] || "").toString().toLowerCase();
    
        if (A < B) return sortConfig.direction === "asc" ? -1 : 1;
        if (A > B) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }, [mergedItems, sortConfig]);


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

    const TooltipCell: React.FC<{ value?: string | null }> = ({ value }) => {
        const displayValue = value || "-";
        const shouldTruncate = displayValue.length > 20;
        const truncatedValue = shouldTruncate
            ? `${displayValue.substring(0, 30)}...`
            : displayValue;
    
        return shouldTruncate ? (
            <Tooltip title={displayValue} arrow>
                <span style={{ cursor: 'help' }}>{truncatedValue}</span>
            </Tooltip>
        ) : (
            <span>{displayValue}</span>
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
                                    ...(deletingId === row.id &&
                                        tableRowDeletingStyle),
                                }}
                            >
                                
                                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        {row.fileName && <FileIcon fileName={row.fileName} />}
                                        <TooltipCell value={row.name} />
                                    </Box>
                                </TableCell>

                                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{row.type}</TableCell>
                                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{row.created_by}</TableCell>
                                {type === "risk" && (
                                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                                            {row.due_date !== "-"
                                                ? new Date(row.due_date).toLocaleDateString("en-GB")
                                                : "-"}
                                        </TableCell>
                                    )}

                                <TableCell
                                    sx={{
                                        ...singleTheme.tableStyles.primary.body.cell,
                                        position: "sticky",
                                        right: 0,
                                        background:
                                            singleTheme.tableStyles.primary.header
                                                .backgroundColors,
                                        zIndex: 10,
                                    }}
                                >
                                        {/* Delete objects */}
                                        <CustomIconButton
                                                id={Number(row.id)}
                                                onDelete={() => onRemove(type!, row.id)}
                                                onEdit={() => {
                                                    // edit
                                                }}
                                                onMouseEvent={() => {}}
                                                warningTitle={`Delete this ${type}?`}
                                                warningMessage={`When you delete this ${type}, all data related to it will be removed. This action is non-recoverable.`}
                                                type="LinkedObjectsType"
                                            />
                                </TableCell>
                            </TableRow>
                        ))
                ) : (
                    <TableRow>
                       <TableCell 
                            colSpan={TABLE_COLUMNS.filter(c => !(c.id === "due_date" && type !== "risk")).length}
                            align="center"
                            >
                            <EmptyState message="No linked items found." icon={Link2} />
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        ),
        [sortedData, hidePagination, page, rowsPerPage, deletingId, onRemove, type]
    );

    return (
        <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={singleTheme.tableStyles.primary.frame}>
                {/* HEADER */}
                <SortableTableHead
                       columns={TABLE_COLUMNS.filter(c => !(c.id === "due_date" && type !== "risk"))}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        theme={theme}
                    />

                {tableBody}

                {/* PAGINATION */}
                {paginated && !hidePagination && sortedData.length > 0 && (
                    <TableFooter>
                        <TableRow sx={tableFooterRowStyle(theme)}>
                            <TableCell sx={showingTextCellStyle(theme)}>
                                Showing {getRange} of {sortedData.length}
                            </TableCell>
                            <TablePagination
                                count={sortedData.length}
                                page={page}
                                rowsPerPage={rowsPerPage}
                                onPageChange={handleChangePage}
                                onRowsPerPageChange={handleChangeRowsPerPage}
                                rowsPerPageOptions={[5, 10, 15, 25]}
                                ActionsComponent={TablePaginationActions}
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

export default LinkedObjectsTable;
