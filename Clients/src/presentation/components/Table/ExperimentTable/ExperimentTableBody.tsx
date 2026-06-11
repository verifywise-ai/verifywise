import { useState } from "react";
import {
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Typography,
  Popover,
  Stack,
  Box,
  keyframes,
} from "@mui/material";
import { MoreVertical, RotateCcw, Download, Copy, Trash2, Loader2 } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { palette } from "../../../themes/palette";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import { CustomizableButton } from "../../button/customizable-button";
import type { IExperimentRow, IExperimentTableBodyProps } from "../../../types/interfaces/i.table";

// Pulse animation for "Running..." text in the experiment name cell.
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

// Spin animation for loader icon next to "Running..." text.
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const RUNNING_STATUSES = new Set<IExperimentRow["status"]>(["Running", "In Progress", "Pending"]);

const ExperimentTableBody: React.FC<IExperimentTableBodyProps> = ({
  rows,
  page,
  rowsPerPage,
  onRowClick,
  onRerun,
  onDownload,
  onCopy,
  onDelete,
  compact = false,
}) => {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<IExperimentRow | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<IExperimentRow | null>(null);

  const showActionsColumn = !compact && Boolean(onRerun || onDelete || onDownload || onCopy);
  const showLinkedModelColumn = !compact;

  const openExperimentMenu = (e: React.MouseEvent<HTMLElement>, row: IExperimentRow) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuRow(row);
  };

  const closeExperimentMenu = () => {
    setMenuAnchorEl(null);
    setMenuRow(null);
  };

  const handleRerunClick = () => {
    if (menuRow && onRerun) onRerun(menuRow);
    closeExperimentMenu();
  };

  const handleDownloadClick = () => {
    if (menuRow && onDownload) onDownload(menuRow);
    closeExperimentMenu();
  };

  const handleCopyClick = () => {
    if (menuRow && onCopy) onCopy(menuRow);
    closeExperimentMenu();
  };

  const deleteExperimentRow = () => {
    if (menuRow) {
      setRowToDelete(menuRow);
      setDeleteModalOpen(true);
    }
    closeExperimentMenu();
  };

  const handleConfirmDelete = () => {
    if (rowToDelete && onDelete) {
      onDelete(String(rowToDelete.id));
      setDeleteModalOpen(false);
      setRowToDelete(null);
    }
  };

  return (
    <TableBody>
      {rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => {
        const isRunning = RUNNING_STATUSES.has(row.status);

        return (
          <TableRow
            key={row.id}
            onClick={() => onRowClick(row)}
            sx={{
              ...singleTheme.tableStyles.primary.body.row,
              "cursor": "pointer",
              "&:hover": {
                backgroundColor: palette.background.accent,
              },
            }}
          >
            {/* EXPERIMENT NAME */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textTransform: "none",
              }}
            >
              {isRunning ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    component={Loader2}
                    size={14}
                    sx={{
                      color: palette.status.warning.text,
                      animation: `${spin} 1s linear infinite`,
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: palette.status.warning.text,
                      fontWeight: 500,
                      animation: `${pulse} 1.5s ease-in-out infinite`,
                    }}
                  >
                    Running...
                  </Typography>
                </Box>
              ) : row.status === "Failed" ? (
                <Typography
                  sx={{ fontSize: 13, color: palette.status.error.text, fontWeight: 500 }}
                >
                  Failed
                </Typography>
              ) : (
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{row.name || row.id}</Typography>
              )}
            </TableCell>

            {/* MODEL */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {row.model}
            </TableCell>

            {/* JUDGE/SCORER */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {row.judge || "-"}
            </TableCell>

            {/* # PROMPTS */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {row.prompts ?? "-"}
            </TableCell>

            {/* DATASET */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {row.dataset}
            </TableCell>

            {/* LINKED MODEL */}
            {showLinkedModelColumn && (
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.body.cell,
                  textAlign: "center",
                  textTransform: "none",
                }}
              >
                {row.linkedModel ? (
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      px: "8px",
                      py: "2px",
                      borderRadius: "4px",
                      backgroundColor: palette.status.success.bg,
                      color: palette.status.success.text,
                      fontSize: "11px",
                      fontWeight: 500,
                    }}
                  >
                    Linked
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: "11px", color: palette.text.secondary }}>
                    Unlinked
                  </Typography>
                )}
              </TableCell>
            )}

            {/* DATE */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
                fontSize: "12px",
              }}
            >
              {row.date ?? "-"}
            </TableCell>

            {/* ACTION */}
            {showActionsColumn && (
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.body.cell,
                  textAlign: "center",
                  minWidth: "60px",
                  maxWidth: "60px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <IconButton
                  size="small"
                  onClick={(e) => openExperimentMenu(e, row)}
                  sx={{
                    "color": palette.text.tertiary,
                    "padding": "6px",
                    "&:hover": {
                      backgroundColor: palette.background.hover,
                    },
                  }}
                >
                  <MoreVertical size={18} />
                </IconButton>
              </TableCell>
            )}
          </TableRow>
        );
      })}

      {/* Action Menu */}
      <Popover
        open={Boolean(menuAnchorEl)}
        anchorEl={menuAnchorEl}
        onClose={closeExperimentMenu}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{
          "& .MuiPopover-paper": {
            minWidth: 140,
            borderRadius: "4px",
            border: `1px solid ${palette.border.dark}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
            mt: 0.5,
            p: 1,
          },
        }}
      >
        <Stack spacing={1}>
          {onRerun && (
            <CustomizableButton
              variant="outlined"
              onClick={handleRerunClick}
              isDisabled={menuRow ? RUNNING_STATUSES.has(menuRow.status) : false}
              startIcon={<RotateCcw size={14} />}
              sx={{
                "height": "34px",
                "fontSize": "13px",
                "fontWeight": 500,
                "color": palette.text.secondary,
                "borderColor": palette.border.dark,
                "backgroundColor": "transparent",
                "justifyContent": "flex-start",
                "&:hover": {
                  backgroundColor: palette.status.success.bg,
                  borderColor: palette.brand.primary,
                  color: palette.brand.primary,
                },
              }}
            >
              Rerun
            </CustomizableButton>
          )}
          {onDownload && menuRow?.status === "Completed" && (
            <CustomizableButton
              variant="outlined"
              onClick={handleDownloadClick}
              startIcon={<Download size={14} />}
              sx={{
                "height": "34px",
                "fontSize": "13px",
                "fontWeight": 500,
                "color": palette.text.secondary,
                "borderColor": palette.border.dark,
                "backgroundColor": "transparent",
                "justifyContent": "flex-start",
                "&:hover": {
                  backgroundColor: palette.status.success.bg,
                  borderColor: palette.brand.primary,
                  color: palette.brand.primary,
                },
              }}
            >
              Download results as JSON
            </CustomizableButton>
          )}
          {onCopy && menuRow?.status === "Completed" && (
            <CustomizableButton
              variant="outlined"
              onClick={handleCopyClick}
              startIcon={<Copy size={14} />}
              sx={{
                "height": "34px",
                "fontSize": "13px",
                "fontWeight": 500,
                "color": palette.text.secondary,
                "borderColor": palette.border.dark,
                "backgroundColor": "transparent",
                "justifyContent": "flex-start",
                "&:hover": {
                  backgroundColor: palette.status.success.bg,
                  borderColor: palette.brand.primary,
                  color: palette.brand.primary,
                },
              }}
            >
              Copy results to clipboard
            </CustomizableButton>
          )}
          {onDelete && (
            <CustomizableButton
              variant="outlined"
              onClick={deleteExperimentRow}
              startIcon={<Trash2 size={14} />}
              sx={{
                "height": "34px",
                "fontSize": "13px",
                "fontWeight": 500,
                "color": palette.status.error.text,
                "borderColor": palette.border.dark,
                "backgroundColor": "transparent",
                "justifyContent": "flex-start",
                "&:hover": {
                  backgroundColor: palette.status.error.bg,
                  borderColor: palette.status.error.text,
                },
              }}
            >
              Delete
            </CustomizableButton>
          )}
        </Stack>
      </Popover>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && rowToDelete && (
        <ConfirmationModal
          title="Delete this experiment?"
          body={
            <Typography fontSize={13}>
              Are you sure you want to delete experiment "{rowToDelete.name || rowToDelete.id}"?
              This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          onCancel={() => {
            setDeleteModalOpen(false);
            setRowToDelete(null);
          }}
          onProceed={handleConfirmDelete}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
        />
      )}
    </TableBody>
  );
};

export default ExperimentTableBody;
