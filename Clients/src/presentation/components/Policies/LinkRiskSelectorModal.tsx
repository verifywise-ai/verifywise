/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Checkbox,
    Typography,
    TableFooter,
    TablePagination,
    TableContainer,
    Box,
    useTheme,
} from "@mui/material";

import { ChevronsUpDown, ChevronUp, ChevronDown, ShieldAlert } from "lucide-react";

import StandardModal from "../Modals/StandardModal";

import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import { handleAlert } from "../../../application/tools/alertUtils";
import { singleTheme } from "../../themes";
import { useUserMap } from "../../../presentation/hooks/userMap";
import {
    paginationMenuProps,
    paginationSelectStyle,
    showingTextCellStyleForPolicyLinked,
    tableFooterRowStyle,
    tableRowDeletingStyle,
    tableRowHoverStyle,
} from "../../../presentation/pages/ModelInventory/style";
import { EmptyState } from "../EmptyState";
import TablePaginationActions from "../TablePagination";
import { paginationStyle } from "../Table/styles";
import CustomizableToast from "../../components/Toast";
import { text } from "../../themes/palette";

const SORT_KEY = "vw_link_risk_selector_sort";

type SortDirection = "asc" | "desc" | null;
type SortConfig = { key: string; direction: SortDirection };

const SelectorVertical = (props: any) => (
    <ChevronsUpDown size={16} {...props} />
);

interface LinkRiskSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    linkedRiskIds: number[];
    policyId: number;
    onSubmit: (selectedIds: number[]) => Promise<void>;
    hidePagination?: boolean;
    deletingId?: number | null;
    paginated?: boolean;
}

const TABLE_COLUMNS = [
    { id: "risk_name", label: "RISK NAME", sortable: true },
    { id: "likelihood", label: "LIKELIHOOD", sortable: true },
    { id: "severity", label: "SEVERITY", sortable: true },
    { id: "risk_level_autocalculated", label: "LEVEL", sortable: true },
    { id: "risk_owner", label: "RISK OWNER", sortable: true },
    { id: "actions", label: "", sortable: false },
];

// -----------------------------
// Sortable Header Component
// -----------------------------
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
                        className="risk-selector-table-header-cel"
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

// -----------------------------
// MAIN COMPONENT
// -----------------------------
const LinkRiskSelectorModal: React.FC<LinkRiskSelectorModalProps> = ({
    isOpen,
    onClose,
    linkedRiskIds,
    onSubmit,
    hidePagination = false,
    deletingId,
    paginated = true,
}) => {
    const [risks, setRisks] = useState<any[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [loading, setIsLoading] = useState(false);

    const theme = useTheme();

    // Sorting
    const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
        const saved = localStorage.getItem(SORT_KEY);
        return saved ? JSON.parse(saved) : { key: "", direction: null };
    });

    // Save sorting state to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem(SORT_KEY, JSON.stringify(sortConfig));
    }, [sortConfig]);

    // Pagination
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Toast helper
    const [, setAlert] = useState<any>(null);

    const toast = (variant: any, msg: string) => {
        handleAlert({ variant, body: msg, setAlert });
        setTimeout(() => setAlert(null), 2500);
    };

    // -----------------------------
    // Fetch All Risks
    // -----------------------------
    const fetchRisks = useCallback(async () => {
        try {
            const res = await getAllProjectRisks({ filter: "active" });
            setRisks(res.data || []);
        } catch (e) {
            console.error("error", e);
            toast("error", "Failed to load risks.");
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            setSelected([]);
            fetchRisks();
        }
    }, [isOpen, fetchRisks]);

    // -----------------------------
    // Sorting Logic
    // -----------------------------
    const sortedRisks = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) return risks;

        return [...risks].sort((a, b) => {
            const A = (a[sortConfig.key] || "").toString().toLowerCase();
            const B = (b[sortConfig.key] || "").toString().toLowerCase();

            if (A < B) return sortConfig.direction === "asc" ? -1 : 1;
            if (A > B) return sortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });
    }, [risks, sortConfig]);

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
    const visibleRisks = useMemo(
        () => sortedRisks.filter(risk => !linkedRiskIds.includes(Number(risk.id))),
        [sortedRisks, linkedRiskIds]
    );

    const getRange = useMemo(() => {
        const start = page * rowsPerPage + 1;
        const end = Math.min(
            page * rowsPerPage + rowsPerPage,
            visibleRisks?.length ?? 0
        );
        return `${start} - ${end}`;
    }, [page, rowsPerPage, visibleRisks?.length]);

    // -----------------------------
    // Selection Handlers
    // -----------------------------

    const toggleSelect = useCallback(
        (id: number) => {
            if (linkedRiskIds.includes(id)) return; // already linked → disabled

            setSelected((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            );
        },
        [linkedRiskIds] // correct dependency
    );

    // -----------------------------
    // Submit Handler
    // -----------------------------
    const handleSubmit = async () => {
        try {
            setIsLoading(true);
            await onSubmit(selected);
            toast("success", "Risks linked successfully!");
            onClose();
        } catch {
            toast("error", "Failed to link selected risks.");
        } finally {
            setIsLoading(false);
        }
    };

    const { userMap } = useUserMap();
    

    const tableBody = useMemo(
        () => (
            <TableBody>
                {visibleRisks?.length ? (
                    visibleRisks
                        .slice(
                            hidePagination ? 0 : page * rowsPerPage,
                            hidePagination
                                ? Math.min(visibleRisks.length, 100)
                                : page * rowsPerPage + rowsPerPage
                        )
                        .map((risk) => {
                            const disabled = linkedRiskIds.some(
                                (id) => Number(id) === Number(risk.id)
                            );

                            return (
                                <TableRow
                                    key={risk.id}
                                    sx={{
                                        ...singleTheme.tableStyles.primary.body
                                            .row,
                                        ...tableRowHoverStyle,
                                        ...(deletingId ===
                                            risk.id?.toString() &&
                                            tableRowDeletingStyle),
                                        opacity: disabled ? 0.45 : 1,
                                        cursor: disabled
                                            ? "not-allowed"
                                            : "pointer",
                                    }}
                                    onClick={() =>
                                        !disabled && toggleSelect(risk.id)
                                    }
                                >

                                    {/* RISK NAME */}
                                    <TableCell>{risk.risk_name}</TableCell>

                                    {/* LIKELIHOOD */}
                                    <TableCell>{risk.likelihood}</TableCell>

                                    {/* SEVERITY */}
                                    <TableCell>{risk.severity}</TableCell>

                                    {/* LEVEL */}
                                    <TableCell>
                                        {risk.risk_level_autocalculated}
                                    </TableCell>

                                    {/* RISK OWNER */}
                                    <TableCell>
                                        {risk
                                            ? userMap.get(
                                                  String(risk.risk_owner)
                                              ) || "-"
                                            : "-"}
                                    </TableCell>
                                     {/* Checkbox */}
                                     <TableCell width={50}>
                                        <Checkbox
                                            disabled={disabled}
                                            checked={selected.includes(risk.id)}
                                            onChange={() =>
                                                toggleSelect(risk.id)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })
                ) : (
                    <TableRow>
                        <TableCell
                            colSpan={TABLE_COLUMNS.length}
                            align="center"
                        >
                            <EmptyState message="No risks found." icon={ShieldAlert} />
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        ),
        [
            visibleRisks,
            page,
            rowsPerPage,
            hidePagination,
            deletingId,
            linkedRiskIds,
            selected,
            toggleSelect,
            userMap,
        ]
    );

    if (loading) {
        return <CustomizableToast />;
    }

    return (
        <StandardModal
            isOpen={isOpen}
            onClose={onClose}
            title="Link New Risks"
            description="Select risks to link with this policy."
            onSubmit={selected.length > 0 ? handleSubmit : undefined}
            showCancelButton={false}
        >
            <TableContainer sx={{ maxHeight: 450, overflow: "auto" }}>
            <Table
                    sx={{
                        ...singleTheme.tableStyles.primary.frame
                    }}
                    >
           
                    <SortableTableHead
                        columns={TABLE_COLUMNS}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        theme={theme}
                    />

                    {tableBody}
                    {paginated &&
                        !hidePagination &&
                        visibleRisks &&
                        visibleRisks.length > 0 && (
                            <TableFooter>
                                <TableRow sx={tableFooterRowStyle(theme)}>
                                    <TableCell sx={showingTextCellStyleForPolicyLinked(theme)}>
                                        Showing {getRange} of{" "}
                                        {visibleRisks?.length} risk(s)
                                    </TableCell>
                                    <TablePagination
                                        count={visibleRisks?.length ?? 0}
                                        page={page}
                                        onPageChange={handleChangePage}
                                        rowsPerPage={rowsPerPage}
                                        rowsPerPageOptions={[5, 10, 15, 25]}
                                        onRowsPerPageChange={
                                            handleChangeRowsPerPage
                                        }
                                        ActionsComponent={(props) => (
                                            <TablePaginationActions
                                                {...props}
                                            />
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
                                                MenuProps:
                                                    paginationMenuProps(theme),
                                                inputProps: {
                                                    id: "pagination-dropdown",
                                                },
                                                IconComponent: SelectorVertical,
                                                sx: paginationSelectStyle(
                                                    theme
                                                ),
                                            },
                                        }}
                                        sx={paginationStyle(theme)}
                                    />
                                </TableRow>
                            </TableFooter>
                        )}
                </Table>
            </TableContainer>
        </StandardModal>
    );
};

export default LinkRiskSelectorModal;
