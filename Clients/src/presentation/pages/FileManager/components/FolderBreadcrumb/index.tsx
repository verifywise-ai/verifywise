/**
 * @fileoverview FolderBreadcrumb Component
 *
 * A breadcrumb navigation component for displaying the current folder path.
 *
 * @module presentation/pages/FileManager/components/FolderBreadcrumb
 */

import React from "react";
import { Stack, Box, Typography } from "@mui/material";
import {
  ChevronRight as ChevronRightIcon,
  Home as HomeIcon,
  Folder as FolderIcon,
  Files as FilesIcon,
  FileQuestion as UncategorizedIcon,
} from "lucide-react";
import {
  IVirtualFolder,
  SelectedFolder,
} from "../../../../../domain/interfaces/i.virtualFolder";
import { text, background, border as borderPalette } from "../../../../themes/palette";

interface FolderBreadcrumbProps {
  selectedFolder: SelectedFolder;
  breadcrumb: IVirtualFolder[];
  onSelectFolder: (folder: SelectedFolder) => void;
  loading?: boolean;
}

/**
 * FolderBreadcrumb Component
 */
export const FolderBreadcrumb: React.FC<FolderBreadcrumbProps> = ({
  selectedFolder,
  breadcrumb,
  onSelectFolder,
  loading,
}) => {
  // Get display name for special views
  const getDisplayName = (folder: SelectedFolder): string => {
    if (folder === "all") return "All files";
    if (folder === "uncategorized") return "Uncategorized";
    return "";
  };

  // Get icon for special views
  const getIcon = (folder: SelectedFolder) => {
    if (folder === "all") return <FilesIcon size={14} />;
    if (folder === "uncategorized") return <UncategorizedIcon size={14} />;
    return <FolderIcon size={14} />;
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        padding: "8px 0",
        minHeight: "32px",
      }}
    >
      {/* Home/All Files link */}
      <Box
        onClick={() => onSelectFolder("all")}
        sx={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: "4px",
          "&:hover": {
            backgroundColor: `${background.hover}`,
          },
        }}
      >
        <HomeIcon size={14} color={text.icon} />
      </Box>

      {/* Special folder views (all/uncategorized) */}
      {typeof selectedFolder === "string" && (
        <>
          <ChevronRightIcon size={14} color={borderPalette.dark} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: `${background.hover}`,
            }}
          >
            <Box sx={{ display: "flex", color: `${text.icon}` }}>
              {getIcon(selectedFolder)}
            </Box>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 500,
                color: `${text.secondary}`,
              }}
            >
              {getDisplayName(selectedFolder)}
            </Typography>
          </Box>
        </>
      )}

      {/* Folder path breadcrumb */}
      {typeof selectedFolder === "number" && (
        <>
          {breadcrumb.length === 0 && loading ? (
            // Only show loading if we don't have any breadcrumb yet
            <>
              <ChevronRightIcon size={14} color={borderPalette.dark} />
              <Box
                sx={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  backgroundColor: `${background.hover}`,
                  minWidth: "80px",
                }}
              >
                <Typography sx={{ fontSize: 13, color: `${text.muted}` }}>
                  Loading...
                </Typography>
              </Box>
            </>
          ) : (
            // Show breadcrumb (keep showing old one while loading new)
            breadcrumb.map((folder, index) => {
              const isLast = index === breadcrumb.length - 1;

              return (
                <React.Fragment key={folder.id}>
                  <ChevronRightIcon size={14} color={borderPalette.dark} />
                  <Box
                    onClick={() => !isLast && onSelectFolder(folder.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      cursor: isLast ? "default" : "pointer",
                      backgroundColor: isLast ? `${background.hover}` : "transparent",
                      "&:hover": {
                        backgroundColor: isLast ? `${background.hover}` : `${background.accent}`,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        color: folder.color || `${text.icon}`,
                      }}
                    >
                      <FolderIcon size={14} />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: isLast ? 500 : 400,
                        color: isLast ? `${text.secondary}` : `${text.icon}`,
                        maxWidth: "150px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {folder.name}
                    </Typography>
                  </Box>
                </React.Fragment>
              );
            })
          )}
        </>
      )}
    </Stack>
  );
};

export default FolderBreadcrumb;
