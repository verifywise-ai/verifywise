import { useState } from "react";
import {
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Popover,
  Typography,
  Stack,
  Box,
  CircularProgress,
  useTheme,
  keyframes,
} from "@mui/material";
import { MoreVertical, Eye, Trash2, Download, Copy, Loader2 } from "lucide-react";
import Chip from "../../Chip";

// Pulse animation for running text
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

// Spin animation for loader icon
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;
import singleTheme from "../../../themes/v1SingleTheme";
import { ArenaRow } from "./index";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import { CustomizableButton } from "../../button/customizable-button";

interface ArenaTableBodyProps {
  rows: ArenaRow[];
  page: number;
  rowsPerPage: number;
  onRowClick?: (row: ArenaRow) => void;
  onViewResults?: (row: ArenaRow) => void;
  onDownload?: (row: ArenaRow) => void;
  onCopy?: (row: ArenaRow) => void;
  onDelete?: (row: ArenaRow) => void;
  deleting?: string | null;
}

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + ", " + date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Helper to get contestant name from string or object
const getContestantName = (contestant: string | { name?: string }, index: number): string => {
  if (typeof contestant === "string") return contestant;
  return contestant?.name || `Player ${index + 1}`;
};

const ArenaTableBody: React.FC<ArenaTableBodyProps> = ({
  rows,
  page,
  rowsPerPage,
  onRowClick,
  onViewResults,
  onDownload,
  onCopy,
  onDelete,
  deleting,
}) => {
  const theme = useTheme();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<ArenaRow | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<ArenaRow | null>(null);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, row: ArenaRow) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuRow(row);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuRow(null);
  };

  const handleViewResultsClick = () => {
    if (menuRow && onViewResults) {
      onViewResults(menuRow);
    }
    handleMenuClose();
  };

  const handleDownloadClick = () => {
    if (menuRow && onDownload) {
      onDownload(menuRow);
    }
    handleMenuClose();
  };

  const handleCopyClick = () => {
    if (menuRow && onCopy) {
      onCopy(menuRow);
    }
    handleMenuClose();
  };

  const handleDeleteClick = () => {
    if (menuRow) {
      setRowToDelete(menuRow);
      setDeleteConfirmOpen(true);
    }
    handleMenuClose();
  };

  const handleConfirmDelete = () => {
    if (rowToDelete && onDelete) {
      onDelete(rowToDelete);
    }
    setDeleteConfirmOpen(false);
    setRowToDelete(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
    setRowToDelete(null);
  };

  // Contestant chip variants cycling through standard VW Chip variants
  const contestantVariants: Array<"info" | "error" | "success" | "warning" | "default" | "high"> = [
    "info", "error", "success", "warning", "high", "default",
  ];

  return (
    <TableBody>
      {rows
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
        .map((row) => (
          <TableRow
            key={row.id}
            onClick={() => onRowClick?.(row)}
            sx={{
              ...singleTheme.tableStyles.primary.body.row,
              cursor: onRowClick ? "pointer" : "default",
              "&:hover": {
                backgroundColor: "background.accent",
              },
            }}
          >
            {/* BATTLE NAME */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textTransform: "none",
              }}
            >
              <Typography sx={{ fontWeight: 500, fontSize: 13 }}>
                {row.name}
              </Typography>
            </TableCell>

            {/* CONTESTANTS - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              <Stack
                direction="row"
                spacing={0.5}
                justifyContent="center"
                flexWrap="wrap"
                gap={0.5}
              >
                {row.contestants?.slice(0, 4).map((contestant, idx) => {
                  const name = getContestantName(contestant, idx);
                  return (
                    <Chip
                      key={`${name}-${idx}`}
                      label={name}
                      size="small"
                      uppercase={false}
                      variant={contestantVariants[idx % contestantVariants.length]}
                    />
                  );
                })}
                {row.contestants?.length > 4 && (
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    +{row.contestants.length - 4} more
                  </Typography>
                )}
              </Stack>
            </TableCell>

            {/* DATASET - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              <Typography sx={{ fontSize: 12, color: "#475569" }}>
                {row.dataset ? row.dataset.split('/').pop()?.replace('.json', '') || row.dataset : '-'}
              </Typography>
            </TableCell>

            {/* WINNER - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {row.status === "completed" && row.winner ? (
                <Chip
                  label={row.winner}
                  size="small"
                  uppercase={false}
                  variant="success"
                />
              ) : row.status === "running" || row.status === "pending" ? (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75 }}>
                  <Box
                    component={Loader2}
                    size={12}
                    sx={{
                      color: "#ef6c00",
                      animation: `${spin} 1s linear infinite`,
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "#ef6c00",
                      fontWeight: 500,
                      animation: `${pulse} 1.5s ease-in-out infinite`,
                    }}
                  >
                    Running...
                  </Typography>
                </Box>
              ) : row.status === "failed" ? (
                <Typography sx={{ fontSize: 12, color: "#c62828" }}>
                  —
                </Typography>
              ) : (
                <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                  —
                </Typography>
              )}
            </TableCell>

            {/* DATE - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              <Typography sx={{ fontSize: "12px", color: "status.default.text" }}>
                {formatDate(row.createdAt)}
              </Typography>
            </TableCell>

            {/* ACTION - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                minWidth: "80px",
                maxWidth: "80px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {deleting === row.id ? (
                <CircularProgress size={18} sx={{ color: "#6366f1" }} />
              ) : (
                <IconButton
                  disableRipple={theme.components?.MuiIconButton?.defaultProps?.disableRipple}
                  onClick={(e) => handleMenuOpen(e, row)}
                  sx={singleTheme.iconButtons}
                >
                  <MoreVertical size={18} />
                </IconButton>
              )}
            </TableCell>
          </TableRow>
        ))}

      {/* Action Menu */}
      <Popover
        open={Boolean(menuAnchorEl)}
        anchorEl={menuAnchorEl}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{
          "& .MuiPopover-paper": {
            minWidth: 140,
            borderRadius: "4px",
            border: "1px solid #d0d5dd",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
            mt: 0.5,
            p: 1,
          },
        }}
      >
        <Stack spacing={1}>
          {onViewResults && menuRow?.status === "completed" && (
            <CustomizableButton
              variant="outlined"
              onClick={handleViewResultsClick}
              startIcon={<Eye size={14} />}
              sx={{
                height: "34px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#374151",
                borderColor: "border.dark",
                backgroundColor: "transparent",
                justifyContent: "flex-start",
                "&:hover": {
                  backgroundColor: "#F0FDF4",
                  borderColor: "brand.primary",
                  color: "brand.primary",
                },
              }}
            >
              View results
            </CustomizableButton>
          )}
          {onDownload && menuRow?.status === "completed" && (
            <CustomizableButton
              variant="outlined"
              onClick={handleDownloadClick}
              startIcon={<Download size={14} />}
              sx={{
                height: "34px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#374151",
                borderColor: "border.dark",
                backgroundColor: "transparent",
                justifyContent: "flex-start",
                "&:hover": {
                  backgroundColor: "#F0FDF4",
                  borderColor: "brand.primary",
                  color: "brand.primary",
                },
              }}
            >
              Download results as JSON
            </CustomizableButton>
          )}
          {onCopy && menuRow?.status === "completed" && (
            <CustomizableButton
              variant="outlined"
              onClick={handleCopyClick}
              startIcon={<Copy size={14} />}
              sx={{
                height: "34px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#374151",
                borderColor: "border.dark",
                backgroundColor: "transparent",
                justifyContent: "flex-start",
                "&:hover": {
                  backgroundColor: "#F0FDF4",
                  borderColor: "brand.primary",
                  color: "brand.primary",
                },
              }}
            >
              Copy results to clipboard
            </CustomizableButton>
          )}
          {onDelete && (
            <CustomizableButton
              variant="outlined"
              onClick={handleDeleteClick}
              startIcon={<Trash2 size={14} />}
              sx={{
                height: "34px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#DC2626",
                borderColor: "border.dark",
                backgroundColor: "transparent",
                justifyContent: "flex-start",
                "&:hover": {
                  backgroundColor: "#FEF2F2",
                  borderColor: "#DC2626",
                },
              }}
            >
              Delete
            </CustomizableButton>
          )}
        </Stack>
      </Popover>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        title="Delete Arena Battle"
        body={
          <Typography sx={{ fontSize: 14, color: "text.icon" }}>
            Are you sure you want to delete "{rowToDelete?.name}"? This action cannot be undone.
          </Typography>
        }
        cancelText="Cancel"
        proceedText="Delete"
        onCancel={handleCancelDelete}
        onProceed={handleConfirmDelete}
        proceedButtonColor="error"
        proceedButtonVariant="contained"
      />
    </TableBody>
  );
};

export default ArenaTableBody;

