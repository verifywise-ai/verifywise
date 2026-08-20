/**
 * @fileoverview File path row with click-to-show code preview, used inside finding rows.
 *
 * @module pages/AIDetection/ScanDetails/FilePathItem
 */

import { Box } from "@mui/material";
import VWTooltip from "../../../components/VWTooltip";
import { palette } from "../../../themes/palette";

interface FilePathItemProps {
  path: string;
  lineNumber: number | null;
  matchedText: string;
  fileUrl: string | null;
}

export function FilePathItem({ path, lineNumber, matchedText, fileUrl }: FilePathItemProps) {
  const hasContent = !!matchedText;

  const codePreviewContent = hasContent ? matchedText : null;

  const filePathRow = (
    <Box
      sx={{
        "display": "flex",
        "alignItems": "center",
        "gap": 1,
        "py": 0.5,
        "px": 1,
        "fontFamily": "monospace",
        "fontSize": 13,
        "cursor": fileUrl ? "pointer" : "default",
        "&:hover": {
          backgroundColor: palette.background.hover,
        },
        "borderRadius": "4px",
      }}
    >
      {fileUrl ? (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontFamily: "monospace",
            color: palette.text.primary,
            wordBreak: "break-all",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          {path}
          {lineNumber && (
            <span style={{ color: palette.text.tertiary, marginLeft: "4px" }}>:{lineNumber}</span>
          )}
        </a>
      ) : (
        <span
          style={{ fontFamily: "monospace", color: palette.text.primary, wordBreak: "break-all" }}
        >
          {path}
          {lineNumber && (
            <span style={{ color: palette.text.tertiary, marginLeft: "4px" }}>:{lineNumber}</span>
          )}
        </span>
      )}
    </Box>
  );

  if (hasContent && codePreviewContent) {
    return (
      <VWTooltip content={codePreviewContent} placement="bottom-start">
        {filePathRow}
      </VWTooltip>
    );
  }

  return filePathRow;
}
