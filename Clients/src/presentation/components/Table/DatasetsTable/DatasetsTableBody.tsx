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
import StatusBadge from "../../StatusBadge";
import singleTheme from "../../../themes/v1SingleTheme";
import { DatasetRow } from "./index";
import { getCategoryStyles, getDifficultyVariant } from "../TemplatesTable/TemplatesList";
import { text, background, status, radiusPx } from "../../../themes/palette";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";

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
  const formatUserDate = useFormattedDate();
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
    return formatUserDate(dateStr, { includeTime: true });
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
                <StatusBadge
                  label={
                    dataset.type === "single-turn"
                      ? "Single-turn"
                      : dataset.type === "multi-turn"
                        ? "Multi-turn"
                        : "Simulated"
                  }
                  size="small"
                  uppercase={false}
                  variant="default"
                  textColor={`${text.secondary}`}
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
                <StatusBadge
                  label={
                    dataset.useCase === "rag"
                      ? "RAG"
                      : dataset.useCase.charAt(0).toUpperCase() + dataset.useCase.slice(1)
                  }
                  size="small"
                  uppercase={false}
                  backgroundColor={getCategoryStyles(dataset.useCase).backgroundColor}
                  textColor={getCategoryStyles(dataset.useCase).color}
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
                <StatusBadge label="Empty" size="small" variant="error" />
              ) : (
                <Typography sx={{ fontSize: "13px", color: `${text.secondary}` }}>
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
                <StatusBadge
                  label={metadata?.avgDifficulty ?? "Medium"}
                  size="small"
                  uppercase={false}
                  variant={getDifficultyVariant(metadata?.avgDifficulty ?? "Medium")}
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
            borderRadius: radiusPx.sm,
            border: `1px solid ${palette.border.dark}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
            mt: "1px",
            p: "2px",
          },
        }}
      >
        <Stack spacing="2px">
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
