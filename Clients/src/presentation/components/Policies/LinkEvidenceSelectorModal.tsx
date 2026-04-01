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
    Tooltip,
} from "@mui/material";

import { ChevronsUpDown, ChevronUp, ChevronDown, FileCheck } from "lucide-react";

import StandardModal from "../Modals/StandardModal";

import { handleAlert } from "../../../application/tools/alertUtils";
import { singleTheme } from "../../themes";
import {
    paginationMenuProps,
    paginationSelectStyle,
    showingTextCellStyleForPolicyLinked,
    tableFooterRowStyle,
    tableRowHoverStyle,
} from "../../../presentation/pages/ModelInventory/style";
import { EmptyState } from "../EmptyState";
import TablePaginationActions from "../TablePagination";
import { paginationStyle } from "../Table/styles";
import { FileIcon } from "../FileIcon";
import { getUserFilesMetaData } from "../../../application/repository/file.repository";
import CustomizableToast from "../../components/Toast";

const SORT_KEY = "vw_link_evidence_selector_sort";

type SortDirection = "asc" | "desc" | null;
type SortConfig = { key: string; direction: SortDirection };

const SelectorVertical = (props: any) => (
    <ChevronsUpDown size={16} {...props} />
);

interface LinkEvidenceSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    linkedEvidenceIds: number[];
    onSubmit: (selectedIds: number[]) => Promise<void>;
    hidePagination?: boolean;
    // deletingId?: number | null;
    paginated?: boolean;
}

const TABLE_COLUMNS = [
    { id: "evidence_name", label: "EVIDENCE NAME", sortable: true },
    { id: "evidence_type", label: "TYPE", sortable: true },
    { id: "uploaded_by", label: "UPLOADED BY", sortable: true },
    { id: "uploaded_on", label: "UPLOADED ON", sortable: true },
    { id: "", label: "", sortable: false },
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
                {columns.map((column) => (
                    <TableCell
                        key={column.id}
                        component={"td"}
                        sx={{
                            ...singleTheme.tableStyles.primary.header.cell,
                            ...(column.sortable
                                ? {
                                      cursor: "pointer",
                                      userSelect: "none",
                                      "&:hover": {
                                          backgroundColor: "rgba(0,0,0,0.04)",
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
                                <>
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
                                </>
                            )}
                        </Box>
                    </TableCell>
                ))}
            </TableRow>
        </TableHead>
    );
};

// ------------------------------------
// MAIN COMPONENT
// ------------------------------------
const LinkEvidenceSelectorModal: React.FC<LinkEvidenceSelectorModalProps> = ({
    isOpen,
    onClose,
    linkedEvidenceIds,
    onSubmit,
    hidePagination = false,
    paginated = true,
}) => {
    const [evidences, setEvidences] = useState<any[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);

    const theme = useTheme();

    // Sorting
    const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
        const saved = localStorage.getItem(SORT_KEY);
        return saved ? JSON.parse(saved) : { key: "", direction: null };
    });

    useEffect(() => {
        localStorage.setItem(SORT_KEY, JSON.stringify(sortConfig));
    }, [sortConfig]);

    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const [, setAlert] = useState<any>(null);

    const toast = (variant: any, msg: string) => {
        handleAlert({ variant, body: msg, setAlert });
        setTimeout(() => setAlert(null), 2500);
    };

    // Fetch Evidence
    const fetchEvidence = useCallback(async () => {
        try {
            const response = await getUserFilesMetaData();
            setEvidences(response ?? []);
            
        } catch (err) {
            console.error(err);
            toast("Failed to load evidence.", "Failed to load evidence.");
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            setSelected([]);
            fetchEvidence();
        }
    }, [isOpen, fetchEvidence]);

    const sortedEvidences = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) return evidences;

        return [...evidences].sort((a, b) => {
            const getValue = (item: any) => {
                switch (sortConfig.key) {
                    case "evidence_name":
                        return item.filename?.toLowerCase() || "";
                    case "evidence_type":
                        return "evidence";
                    case "uploaded_by":
                        return item.uploader_name?.toLowerCase() || "";
                    case "uploaded_on":
                        return item.upload_date || "";
                    default:
                        return "";
                }
            };

            const A = getValue(a);
            const B = getValue(b);

            if (A < B) return sortConfig.direction === "asc" ? -1 : 1;
            if (A > B) return sortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });
    }, [evidences, sortConfig]);

    const visibleEvidence = useMemo(
        () => sortedEvidences.filter(evi => !linkedEvidenceIds.includes(Number(evi.id))),
        [sortedEvidences, linkedEvidenceIds]
    );


    const toggleSelect = useCallback(
        (id: number) => {
            if (linkedEvidenceIds.includes(id)) return;

            setSelected((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            );
        },
        [linkedEvidenceIds]
    );

    const handleSubmit = async () => {
        try {
            setLoading(true);
            await onSubmit(selected);
            toast("success", "Evidence linked successfully!");
            onClose();
        } catch {
            toast("error", "Failed to link evidence.");
        } finally {
            setLoading(false);
        }
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

    const truncate = (text: string, max: number = 25) => {
        if (!text) return "";
        return text.length > max ? text.substring(0, max) + "..." : text;
    };

    const getRange = useMemo(() => {
        const start = page * rowsPerPage + 1;
        const end = Math.min(
            page * rowsPerPage + rowsPerPage,
            visibleEvidence.length
        );
        return `${start} - ${end}`;
    }, [page, rowsPerPage, visibleEvidence.length]);
    

    const tableBody = useMemo(
        () => (
            <TableBody>
                {visibleEvidence.length > 0 ? (
                    visibleEvidence
                        .slice(
                            hidePagination ? 0 : page * rowsPerPage,
                            hidePagination
                                ? Math.min(visibleEvidence.length, 100)
                                : page * rowsPerPage + rowsPerPage
                        )
                        .map((ev) => {

                             const disabled = linkedEvidenceIds.some(
                                (id) => Number(id) === Number(ev.id)
                            );
                            

                            return (
                                <TableRow
                                    key={ev.id}
                                    sx={{
                                        ...singleTheme.tableStyles.primary.body
                                            .row,
                                        ...tableRowHoverStyle,
                                        opacity: disabled ? 0.45 : 1,
                                        cursor: disabled
                                            ? "not-allowed"
                                            : "pointer",
                                    }}
                                    onClick={() =>
                                        !disabled && toggleSelect(ev.id)
                                    }
                                >
                                    <TableCell>
                                        <Box
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                            }}
                                        >
                                            <FileIcon
                                                fileName={ev.filename || ""}
                                            />

                                            <Tooltip title={ev.filename || ""}>
                                                <span>
                                                    {truncate(ev.filename, 25)}
                                                </span>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>

                                    <TableCell>{"evidence"}</TableCell>

                                    <TableCell>{ev.uploader_name}</TableCell>

                                    <TableCell>
                                        {ev.upload_date !== "-"
                                            ? new Date(
                                                  ev.upload_date
                                              ).toLocaleDateString("en-GB")
                                            : "-"}
                                    </TableCell>

                                    <TableCell width={50}>
                                        <Checkbox
                                            disabled={disabled}
                                            checked={selected.includes(ev.id)}
                                            onChange={() => toggleSelect(ev.id)}
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
                            <EmptyState message="No evidence found." icon={FileCheck} />
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        ),
        [
            visibleEvidence,
            page,
            rowsPerPage,
            hidePagination,
            linkedEvidenceIds,
            selected,
            toggleSelect,
        ]
    );

    if (loading) {
        return <CustomizableToast />;
    }

    return (
        <StandardModal
            isOpen={isOpen}
            onClose={onClose}
            title="Link Evidence"
            description="Select evidence items to link with this policy."
            onSubmit={selected.length > 0 ? handleSubmit : undefined}
            showCancelButton={false}
        >
            <TableContainer sx={{ maxHeight: 450, overflow: "auto" }}>
                <Table sx={singleTheme.tableStyles.primary.frame}>
                    <SortableTableHead
                        columns={TABLE_COLUMNS}
                        sortConfig={sortConfig}
                        onSort={(col) =>
                            setSortConfig((prev) => {
                                if (prev.key === col) {
                                    if (prev.direction === "asc")
                                        return { key: col, direction: "desc" };
                                    if (prev.direction === "desc")
                                        return { key: "", direction: null };
                                }
                                return { key: col, direction: "asc" };
                            })
                        }
                        theme={theme}
                    />

                    {tableBody}

                    {paginated && visibleEvidence.length > 0 && (
                        <TableFooter>
                            <TableRow sx={tableFooterRowStyle(theme)}>
                                <TableCell sx={showingTextCellStyleForPolicyLinked(theme)}>
                                    Showing {getRange} of{" "}
                                    {visibleEvidence.length} evidence(s)
                                </TableCell>

                                <TablePagination
                                    count={visibleEvidence.length}
                                    page={page}
                                    onPageChange={handleChangePage}
                                    rowsPerPage={rowsPerPage}
                                    rowsPerPageOptions={[5, 10, 15, 25]}
                                    onRowsPerPageChange={
                                        handleChangeRowsPerPage
                                    }
                                    ActionsComponent={(props) => (
                                        <TablePaginationActions {...props} />
                                    )}
                                    slotProps={{
                                        select: {
                                            MenuProps:
                                                paginationMenuProps(theme),
                                            IconComponent: SelectorVertical,
                                            sx: paginationSelectStyle(theme),
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

export default LinkEvidenceSelectorModal;
