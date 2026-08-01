import { Box, IconButton, Popover, Stack, Tooltip, Typography } from "@mui/material";
import { ChevronDown, ChevronUp } from "lucide-react";
import Field from "../../../components/Inputs/Field";
import { CustomizableButton } from "../../../components/button/customizable-button";

export interface FindReplacePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  replaceText: string;
  onReplaceTextChange: (value: string) => void;
  searchMatchCount: number;
  onSearchNext: () => void;
  onSearchPrev: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
}

/** Find & replace popover for the TipTap policy editor. */
export function FindReplacePopover({
  anchorEl,
  onClose,
  searchText,
  onSearchTextChange,
  replaceText,
  onReplaceTextChange,
  searchMatchCount,
  onSearchNext,
  onSearchPrev,
  onReplaceCurrent,
  onReplaceAll,
}: FindReplacePopoverProps) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      disableAutoFocus
      disableEnforceFocus
      slotProps={{
        paper: {
          sx: {
            width: 340,
            borderRadius: "4px",
            border: "1px solid",
            borderColor: "border.dark",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            p: "16px",
          },
        },
      }}
    >
      <Stack gap="12px">
        <Stack direction="row" gap="8px" alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Field
              id="search-find-input"
              placeholder="Find in document..."
              value={searchText}
              onChange={(e) => onSearchTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchNext();
              }}
              autoFocus
              sx={{
                "& .field-input": { height: 34 },
                "& input": { padding: "0 10px", fontSize: 13 },
              }}
            />
          </Box>
          <Tooltip title="Previous" arrow>
            <IconButton
              onClick={onSearchPrev}
              disabled={searchMatchCount === 0}
              size="small"
              sx={{
                "padding": "6px",
                "borderRadius": "4px",
                "border": "1px solid",
                "borderColor": "border.dark",
                "color": "text.secondary",
                "&:hover": { backgroundColor: "background.accent" },
                "&:disabled": { color: "border.dark", borderColor: "border.light" },
              }}
            >
              <ChevronUp size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Next" arrow>
            <IconButton
              onClick={onSearchNext}
              disabled={searchMatchCount === 0}
              size="small"
              sx={{
                "padding": "6px",
                "borderRadius": "4px",
                "border": "1px solid",
                "borderColor": "border.dark",
                "color": "text.secondary",
                "&:hover": { backgroundColor: "background.accent" },
                "&:disabled": { color: "border.dark", borderColor: "border.light" },
              }}
            >
              <ChevronDown size={16} />
            </IconButton>
          </Tooltip>
        </Stack>

        {searchText && (
          <Typography sx={{ fontSize: 11, color: "text.muted", mt: "-4px" }}>
            {searchMatchCount === 0
              ? "No matches found"
              : `${searchMatchCount} match${searchMatchCount !== 1 ? "es" : ""} found`}
          </Typography>
        )}

        <Stack direction="row" gap="8px" alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Field
              id="search-replace-input"
              placeholder="Replace with..."
              value={replaceText}
              onChange={(e) => onReplaceTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onReplaceCurrent();
              }}
              sx={{
                "& .field-input": { height: 34 },
                "& input": { padding: "0 10px", fontSize: 13 },
              }}
            />
          </Box>
          <Tooltip title="Replace" arrow>
            <span>
              <CustomizableButton
                variant="outlined"
                text="Replace"
                onClick={onReplaceCurrent}
                isDisabled={searchMatchCount === 0}
                sx={{
                  "minWidth": "auto",
                  "height": 34,
                  "px": "10px",
                  "fontSize": 12,
                  "backgroundColor": "background.main",
                  "border": "1px solid",
                  "borderColor": "border.dark",
                  "color": "text.secondary",
                  "whiteSpace": "nowrap",
                  "&:hover": { backgroundColor: "background.accent" },
                }}
              />
            </span>
          </Tooltip>
        </Stack>

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <CustomizableButton
            variant="outlined"
            text="Replace all"
            onClick={onReplaceAll}
            isDisabled={searchMatchCount === 0}
            sx={{
              "minWidth": "auto",
              "height": 34,
              "px": "10px",
              "fontSize": 12,
              "backgroundColor": "background.main",
              "border": "1px solid",
              "borderColor": "border.dark",
              "color": "text.secondary",
              "whiteSpace": "nowrap",
              "&:hover": { backgroundColor: "background.accent" },
            }}
          />
        </Box>
      </Stack>
    </Popover>
  );
}
