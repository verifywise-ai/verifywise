import { useState } from "react";
import {
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Typography,
  Popover,
  Stack,
  CircularProgress,
} from "@mui/material";
import { MoreVertical, Eye, Edit3, Download, Trash2 } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";
import palette from "../../../themes/palette";
import Chip from "../../Chip";
import singleTheme from "../../../themes/v1SingleTheme";
import { DatasetRow } from "./index";
import { text, background, status } from "../../../themes/palette";

interface DatasetsTableBodyProps {
  rows: DatasetRow[];
  page: number;
  rowsPerPage: number;
  onRowClick?: (dataset: DatasetRow) => void;
  onView?: (dataset: DatasetRow) => void;
  onEdit?: (dataset: DatasetRow) => void;
  onDelete?: (dataset: DatasetRow) => void;
  onDownload?: (dataset: DatasetRow) => void;
}

const DatasetsTableBody: React.FC<DatasetsTableBodyProps> = ({
  rows,
  page,
  rowsPerPage,
  onRowClick,
  onView,
  onEdit,
  onDelete,
  onDownload,
}) => {
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<DatasetRow | null>(null);

  const openDatasetMenu = (e: React.MouseEvent<HTMLElement>, row: DatasetRow) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuRow(row);
  };

  const closeDatasetMenu = () => {
    setMenuAnchorEl(null);
    setMenuRow(null);
  };

  const handleViewClick = () => {
    if (menuRow && onView) {
      onView(menuRow);
    }
    closeDatasetMenu();
  };

  const handleEditClick = () => {
    if (menuRow && onEdit) {
      onEdit(menuRow);
    }
    closeDatasetMenu();
  };

  const deleteDatasetRow = () => {
    if (menuRow && onDelete) {
      onDelete(menuRow);
    }
    closeDatasetMenu();
  };

  const handleDownloadClick = () => {
    if (menuRow && onDownload) {
      onDownload(menuRow);
    }
    closeDatasetMenu();
  };

  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      ", " +
      date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  return (
    <TableBody>
      {rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((dataset) => {
        const metadata = dataset.metadata;

        return (
          <TableRow
            key={dataset.key}
            onClick={() => onRowClick?.(dataset)}
            sx={{
              ...singleTheme.tableStyles.primary.body.row,
              "cursor": onRowClick ? "pointer" : "default",
              "&:hover": {
                backgroundColor: `${background.accent}`,
              },
            }}
          >
            {/* NAME */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textTransform: "none",
              }}
            >
              <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>{dataset.name}</Typography>
            </TableCell>

            {/* TYPE - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {dataset.type ? (
                <Chip
                  label={
                    dataset.type === "single-turn"
                      ? "Single-Turn"
                      : dataset.type === "multi-turn"
                        ? "Multi-Turn"
                        : "Simulated"
                  }
                  size="small"
                  uppercase={false}
                  backgroundColor={
                    dataset.type === "single-turn"
                      ? "#FEF3C7"
                      : dataset.type === "multi-turn"
                        ? "#E3F2FD"
                        : "#F3E8FF"
                  }
                  textColor={
                    dataset.type === "single-turn"
                      ? "#92400E"
                      : dataset.type === "multi-turn"
                        ? "#1565C0"
                        : "#7C3AED"
                  }
                />
              ) : (
                <Typography sx={{ fontSize: "13px", color: `${text.disabled}` }}>-</Typography>
              )}
            </TableCell>

            {/* USE CASE - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {dataset.useCase ? (
                <Chip
                  label={
                    dataset.useCase === "rag"
                      ? "RAG"
                      : dataset.useCase.charAt(0).toUpperCase() + dataset.useCase.slice(1)
                  }
                  size="small"
                  uppercase={false}
                  backgroundColor={
                    dataset.useCase === "chatbot"
                      ? "#CCFBF1"
                      : dataset.useCase === "rag"
                        ? "#f3e5f5"
                        : dataset.useCase === "agent"
                          ? "#FEE2E2"
                          : "#e0e0e0"
                  }
                  textColor={
                    dataset.useCase === "chatbot"
                      ? "#0D9488"
                      : dataset.useCase === "rag"
                        ? "#7b1fa2"
                        : dataset.useCase === "agent"
                          ? "#DC2626"
                          : "#616161"
                  }
                />
              ) : (
                <Typography sx={{ fontSize: "13px", color: `${text.disabled}` }}>-</Typography>
              )}
            </TableCell>

            {/* # PROMPTS - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {metadata?.loading ? (
                <CircularProgress size={14} sx={{ color: `${text.disabled}` }} />
              ) : metadata?.promptCount === 0 ? (
                <Chip label="Empty" size="small" variant="error" />
              ) : (
                <Typography sx={{ fontSize: "13px", color: "#374151" }}>
                  {metadata?.promptCount ?? "-"}
                </Typography>
              )}
            </TableCell>

            {/* DIFFICULTY - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {metadata?.loading ? (
                <CircularProgress size={14} sx={{ color: `${text.disabled}` }} />
              ) : (
                <Chip
                  label={metadata?.avgDifficulty ?? "Medium"}
                  size="small"
                  uppercase={false}
                  backgroundColor={
                    metadata?.avgDifficulty === "Easy"
                      ? "#c8e6c9"
                      : metadata?.avgDifficulty === "Medium"
                        ? "#fff3e0"
                        : metadata?.avgDifficulty === "Hard"
                          ? "#ffebee"
                          : "#e0e0e0"
                  }
                  textColor={
                    metadata?.avgDifficulty === "Easy"
                      ? "#388e3c"
                      : metadata?.avgDifficulty === "Medium"
                        ? "#ef6c00"
                        : metadata?.avgDifficulty === "Hard"
                          ? "#c62828"
                          : "#616161"
                  }
                />
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
              <Typography sx={{ fontSize: "12px", color: `${status.default.text}` }}>
                {formatDate(dataset.createdAt)}
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
              <IconButton
                size="small"
                onClick={(e) => openDatasetMenu(e, dataset)}
                sx={{
                  "color": `${text.icon}`,
                  "padding": "6px",
                  "&:hover": {
                    backgroundColor: `${background.hover}`,
                  },
                }}
              >
                <MoreVertical size={18} />
              </IconButton>
            </TableCell>
          </TableRow>
        );
      })}

      {/* Action Menu */}
      <Popover
        open={Boolean(menuAnchorEl)}
        anchorEl={menuAnchorEl}
        onClose={closeDatasetMenu}
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
          {onView && (
            <CustomizableButton
              variant="outlined"
              onClick={handleViewClick}
              startIcon={<Eye size={14} />}
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
              View prompts
            </CustomizableButton>
          )}
          {onEdit && (
            <CustomizableButton
              variant="outlined"
              onClick={handleEditClick}
              startIcon={<Edit3 size={14} />}
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
              Open in editor
            </CustomizableButton>
          )}
          {onDownload && (
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
              Download
            </CustomizableButton>
          )}
          {onDelete && (
            <CustomizableButton
              variant="outlined"
              onClick={deleteDatasetRow}
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
    </TableBody>
  );
};

export default DatasetsTableBody;
