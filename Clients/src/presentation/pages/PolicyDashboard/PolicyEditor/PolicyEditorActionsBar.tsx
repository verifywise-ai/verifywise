import React, { useRef, useState } from "react";
import { Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import {
  Check,
  FileDown,
  FileText,
  History as HistoryIcon,
  Loader2,
  SaveIcon,
  Upload,
} from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { background, border, brand, palette } from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";

/** History active fill — prior `#E6F4F1` chrome. */
const HISTORY_ACTIVE_BG = "#E6F4F1";
const HISTORY_ACTIVE_HOVER_BG = "#D1EDE6";
const SAVE_SUCCESS_BG = "#079455";

export interface PolicyEditorActionsBarProps {
  isNew: boolean;
  hasPolicyId: boolean;
  isHistorySidebarOpen: boolean;
  onToggleHistorySidebar: () => void;
  isExportingPDF: boolean;
  isExportingDOCX: boolean;
  exportError: string | null;
  onDownloadExport: (format: "pdf" | "docx") => void;
  isImporting: boolean;
  onDocxFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isSaving: boolean;
  saveSuccess: boolean;
  isSaveDisabled: boolean;
  saveButtonText: string;
  onSave: () => void;
}

/** History, export, import, and save controls for the policy editor. */
export function PolicyEditorActionsBar({
  isNew,
  hasPolicyId,
  isHistorySidebarOpen,
  onToggleHistorySidebar,
  isExportingPDF,
  isExportingDOCX,
  exportError,
  onDownloadExport,
  isImporting,
  onDocxFileSelect,
  isSaving,
  saveSuccess,
  isSaveDisabled,
  saveButtonText,
  onSave,
}: PolicyEditorActionsBarProps) {
  const [exportAnchorEl, setExportAnchorEl] = useState<HTMLElement | null>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);

  return (
    <Box sx={{ display: "flex", flexDirection: "row", gap: "8px", alignItems: "center" }}>
      {exportError && (
        <Typography
          sx={{
            ...textStyles.caption,
            color: palette.status?.error?.text || "#f04438",
            backgroundColor: palette.status?.error?.bg || "#f9eced",
            px: 1.5,
            py: 0.75,
            borderRadius: "4px",
          }}
        >
          {exportError}
        </Typography>
      )}

      {!isNew && hasPolicyId && (
        <Tooltip title="Activity history" arrow>
          <IconButton
            onClick={onToggleHistorySidebar}
            size="small"
            sx={{
              "color": isHistorySidebarOpen ? brand.primary : "text.muted",
              "padding": "4px",
              "borderRadius": "4px",
              "backgroundColor": isHistorySidebarOpen ? HISTORY_ACTIVE_BG : "transparent",
              "&:hover": {
                backgroundColor: isHistorySidebarOpen
                  ? HISTORY_ACTIVE_HOVER_BG
                  : palette.background.hover,
              },
            }}
          >
            <HistoryIcon size={16} />
          </IconButton>
        </Tooltip>
      )}

      {!isNew && hasPolicyId && (
        <>
          <CustomizableButton
            variant="outlined"
            text={
              isExportingPDF ? "Exporting PDF..." : isExportingDOCX ? "Exporting Word..." : "Export"
            }
            isDisabled={isExportingPDF || isExportingDOCX}
            sx={{
              "backgroundColor": palette.background.main,
              "border": `1px solid ${palette.border.dark}`,
              "color": palette.text.secondary,
              "gap": 1,
              "minWidth": "90px",
              "&:hover": {
                backgroundColor: palette.background.accent,
                borderColor: palette.text.muted,
              },
              "&:disabled": {
                backgroundColor: palette.background.accent,
                borderColor: palette.border.light,
                color: palette.text.muted,
              },
            }}
            onClick={(e: React.MouseEvent<HTMLElement>) => setExportAnchorEl(e.currentTarget)}
            icon={
              isExportingPDF || isExportingDOCX ? (
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <FileDown size={16} />
              )
            }
          />
          <Popover
            open={Boolean(exportAnchorEl)}
            anchorEl={exportAnchorEl}
            onClose={() => setExportAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{
              paper: {
                sx: {
                  mt: 0.5,
                  borderRadius: "4px",
                  border: `1px solid ${palette.border.light}`,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  minWidth: 140,
                  p: 0.5,
                  display: "flex",
                  flexDirection: "column",
                },
              },
            }}
          >
            {[
              {
                icon: <FileText size={14} />,
                label: "Download as PDF",
                format: "pdf" as const,
              },
              {
                icon: <FileDown size={14} />,
                label: "Download as Word",
                format: "docx" as const,
              },
            ].map(({ icon, label, format }) => (
              <Box
                key={format}
                component="button"
                onClick={() => {
                  setExportAnchorEl(null);
                  onDownloadExport(format);
                }}
                sx={{
                  "display": "flex",
                  "alignItems": "center",
                  "gap": 1,
                  "px": 1.5,
                  "py": 1,
                  "border": "none",
                  "background": "none",
                  "cursor": "pointer",
                  "borderRadius": "4px",
                  ...textStyles.caption,
                  "color": "text.secondary",
                  "width": "100%",
                  "textAlign": "left",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                {icon}
                {label}
              </Box>
            ))}
          </Popover>
        </>
      )}

      <CustomizableButton
        variant="outlined"
        text={isImporting ? "Importing..." : "Import"}
        isDisabled={isImporting}
        sx={{
          "backgroundColor": palette.background.main,
          "border": `1px solid ${palette.border.dark}`,
          "color": "text.secondary",
          "gap": 1,
          "minWidth": "90px",
          "&:hover": {
            backgroundColor: palette.background.accent,
            borderColor: "text.muted",
          },
          "&:disabled": {
            backgroundColor: palette.background.accent,
            borderColor: palette.border.light,
            color: "text.muted",
          },
        }}
        onClick={() => docxInputRef.current?.click()}
        icon={
          isImporting ? (
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Upload size={16} />
          )
        }
      />
      <input
        ref={docxInputRef}
        type="file"
        accept=".docx"
        style={{ display: "none" }}
        onChange={onDocxFileSelect}
      />

      <CustomizableButton
        variant="contained"
        text={saveButtonText}
        isDisabled={isSaveDisabled}
        sx={{
          "backgroundColor": saveSuccess ? SAVE_SUCCESS_BG : palette.accent.primary,
          "border": `1px solid ${saveSuccess ? SAVE_SUCCESS_BG : palette.accent.primary}`,
          "gap": 2,
          "&:hover": {
            backgroundColor: saveSuccess ? SAVE_SUCCESS_BG : palette.accent.primary,
            borderColor: saveSuccess ? SAVE_SUCCESS_BG : palette.accent.primary.border,
          },
          "&:disabled": {
            backgroundColor: palette.accent.primary,
            opacity: 0.7,
          },
        }}
        onClick={onSave}
        icon={
          isSaving ? (
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          ) : saveSuccess ? (
            <Check size={16} />
          ) : (
            <SaveIcon size={16} />
          )
        }
      />
    </Box>
  );
}
