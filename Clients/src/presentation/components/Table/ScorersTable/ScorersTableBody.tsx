import { useState } from "react";
import {
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import { Pencil, Trash2, MoreVertical } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { ScorerRow } from "./index";
import { CustomizableButton } from "../../button/customizable-button";
import { brand, text, background, border as borderPalette, status } from "../../../themes/palette";

interface ScorersTableBodyProps {
  rows: ScorerRow[];
  page: number;
  rowsPerPage: number;
  onRowClick?: (scorer: ScorerRow) => void;
  onEdit?: (scorer: ScorerRow) => void;
  onDelete?: (scorer: ScorerRow) => void;
}

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + ", " + date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const ScorersTableBody: React.FC<ScorersTableBodyProps> = ({
  rows,
  page,
  rowsPerPage,
  onRowClick,
  onEdit,
  onDelete,
}) => {
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<ScorerRow | null>(null);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, row: ScorerRow) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuRow(row);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuRow(null);
  };

  const handleEditClick = () => {
    if (menuRow && onEdit) {
      onEdit(menuRow);
    }
    handleMenuClose();
  };

  const handleDeleteClick = () => {
    if (menuRow && onDelete) {
      onDelete(menuRow);
    }
    handleMenuClose();
  };

  // Helper to get model name from scorer
  const getModelName = (scorer: ScorerRow): string => {
    if (typeof scorer.config?.judgeModel === "string") {
      return scorer.config.judgeModel;
    }
    if (typeof scorer.config?.judgeModel === "object" && scorer.config.judgeModel?.name) {
      return scorer.config.judgeModel.name;
    }
    if (typeof scorer.config?.model === "string") {
      return scorer.config.model;
    }
    if (typeof scorer.config?.model === "object" && scorer.config.model?.name) {
      return scorer.config.model.name;
    }
    return scorer.metricKey || "Scorer";
  };

  return (
    <TableBody>
      {rows
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
        .map((scorer) => (
          <TableRow
            key={scorer.id}
            onClick={() => onRowClick?.(scorer)}
            sx={{
              ...singleTheme.tableStyles.primary.body.row,
              cursor: onRowClick ? "pointer" : "default",
              "&:hover": {
                backgroundColor: `${background.accent}`,
              },
            }}
          >
            {/* SCORER NAME */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textTransform: "none",
              }}
            >
              {scorer.name}
            </TableCell>

            {/* MODEL - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {getModelName(scorer)}
            </TableCell>

            {/* THRESHOLD - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {scorer.defaultThreshold ?? "-"}
            </TableCell>

            {/* # CHOICE SCORES - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              {scorer.config?.choiceScores?.length ?? "-"}
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
                {formatDate(scorer.createdAt)}
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
                onClick={(e) => handleMenuOpen(e, scorer)}
                sx={{
                  color: `${text.icon}`,
                  padding: "6px",
                  "&:hover": {
                    backgroundColor: `${background.hover}`,
                  },
                }}
              >
                <MoreVertical size={18} />
              </IconButton>
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
            minWidth: 120,
            borderRadius: "4px",
            border: `1px solid ${borderPalette.dark}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
            mt: 0.5,
            p: 1,
          },
        }}
      >
        <Stack spacing={1}>
          {onEdit && (
            <CustomizableButton
              variant="outlined"
              onClick={handleEditClick}
              startIcon={<Pencil size={14} />}
              sx={{
                height: "34px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#374151",
                borderColor: `${borderPalette.dark}`,
                backgroundColor: "transparent",
                justifyContent: "flex-start",
                "&:hover": {
                  backgroundColor: "#F0FDF4",
                  borderColor: `${brand.primary}`,
                  color: `${brand.primary}`,
                },
              }}
            >
              Edit
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
                borderColor: `${borderPalette.dark}`,
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
    </TableBody>
  );
};

export default ScorersTableBody;

