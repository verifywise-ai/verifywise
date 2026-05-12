import type { FC, CSSProperties } from "react";
import { Box } from "@mui/material";

// Import file type icons
import pdfIcon from "../../assets/icons/file-types/pdf.svg";
import docIcon from "../../assets/icons/file-types/doc.svg";
import docxIcon from "../../assets/icons/file-types/docx.svg";
import xlsIcon from "../../assets/icons/file-types/xls.svg";
import xlsxIcon from "../../assets/icons/file-types/xlsx.svg";
import pptIcon from "../../assets/icons/file-types/ppt.svg";
import pptxIcon from "../../assets/icons/file-types/pptx.svg";
import txtIcon from "../../assets/icons/file-types/txt.svg";
import csvIcon from "../../assets/icons/file-types/csv.svg";
import zipIcon from "../../assets/icons/file-types/zip.svg";
import rarIcon from "../../assets/icons/file-types/rar.svg";
import jpgIcon from "../../assets/icons/file-types/jpg.svg";
import jpegIcon from "../../assets/icons/file-types/jpeg.svg";
import pngIcon from "../../assets/icons/file-types/png.svg";
import gifIcon from "../../assets/icons/file-types/gif.svg";
import jsonIcon from "../../assets/icons/file-types/json.svg";
import xmlIcon from "../../assets/icons/file-types/xml.svg";
import mdIcon from "../../assets/icons/file-types/md.svg";
import defaultIcon from "../../assets/icons/file-types/default.svg";

// Map file extensions to their corresponding icons
const FILE_ICON_MAP: Record<string, string> = {
  // Documents
  "pdf": pdfIcon,
  "doc": docIcon,
  "docx": docxIcon,

  // Spreadsheets
  "xls": xlsIcon,
  "xlsx": xlsxIcon,
  "csv": csvIcon,

  // Presentations
  "ppt": pptIcon,
  "pptx": pptxIcon,

  // Text
  "txt": txtIcon,

  // Archives
  "zip": zipIcon,
  "rar": rarIcon,
  "7z": zipIcon, // Use zip icon for 7z
  "tar": zipIcon, // Use zip icon for tar
  "gz": zipIcon, // Use zip icon for gz

  // Images
  "jpg": jpgIcon,
  "jpeg": jpegIcon,
  "png": pngIcon,
  "gif": gifIcon,

  // Data & markup
  "json": jsonIcon,
  "xml": xmlIcon,
  "md": mdIcon,
  "markdown": mdIcon,
  "yaml": defaultIcon,
  "yml": defaultIcon,
};

/**
 * Extract file extension from a filename
 */
const getFileExtension = (fileName: string): string => {
  if (!fileName) return "";
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
};

/**
 * Get the icon source for a given file extension
 */
export const getFileIconSrc = (fileName: string): string => {
  const extension = getFileExtension(fileName);
  return FILE_ICON_MAP[extension] || defaultIcon;
};

interface FileIconProps {
  fileName: string;
  size?: number;
  sx?: CSSProperties;
}

/**
 * FileIcon component displays an icon based on the file extension
 */
export const FileIcon: FC<FileIconProps> = ({ fileName, size = 24, sx }) => {
  const iconSrc = getFileIconSrc(fileName);

  return (
    <Box
      component="img"
      src={iconSrc}
      alt={`${getFileExtension(fileName) || "file"} icon`}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        ...sx,
      }}
    />
  );
};
