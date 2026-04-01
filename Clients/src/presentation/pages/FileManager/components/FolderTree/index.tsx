/**
 * @fileoverview FolderTree Component
 *
 * A hierarchical tree view component for navigating virtual folders.
 *
 * @module presentation/pages/FileManager/components/FolderTree
 */

import React, { useState, useCallback } from "react";
import { Stack, Box, Typography, Collapse, IconButton } from "@mui/material";
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
  Files as FilesIcon,
  FileQuestion as UncategorizedIcon,
  Plus as PlusIcon,
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  PanelLeftOpen as PanelLeftOpenIcon,
  PanelLeftClose as PanelLeftCloseIcon,
} from "lucide-react";
import {
  IFolderTreeNode,
  SelectedFolder,
} from "../../../../../domain/interfaces/i.virtualFolder";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import { brand, text } from "../../../../themes/palette";

interface FolderTreeProps {
  folders: IFolderTreeNode[];
  selectedFolder: SelectedFolder;
  onSelectFolder: (folder: SelectedFolder) => void;
  onCreateFolder?: (parentId: number | null) => void;
  onEditFolder?: (folder: IFolderTreeNode) => void;
  onDeleteFolder?: (folder: IFolderTreeNode) => void;
  loading?: boolean;
  canManage?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Label for the "All files" item. Defaults to "All files". */
  allLabel?: string;
  /** Whether to show the "Uncategorized" item. Defaults to true. */
  showUncategorized?: boolean;
}

interface FolderItemProps {
  folder: IFolderTreeNode;
  level: number;
  selectedFolder: SelectedFolder;
  expandedFolders: Set<number>;
  onSelectFolder: (folder: SelectedFolder) => void;
  onToggleExpand: (folderId: number) => void;
  onCreateFolder?: (parentId: number | null) => void;
  onEditFolder?: (folder: IFolderTreeNode) => void;
  onDeleteFolder?: (folder: IFolderTreeNode) => void;
  canManage?: boolean;
}

/**
 * Individual folder item in the tree
 */
const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  level,
  selectedFolder,
  expandedFolders,
  onSelectFolder,
  onToggleExpand,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  canManage,
}) => {
  const [showActions, setShowActions] = useState(false);
  const isSelected = selectedFolder === folder.id;
  const isExpanded = expandedFolders.has(folder.id);
  const hasChildren = folder.children.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectFolder(folder.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(folder.id);
  };

  const handleCreateSubfolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCreateFolder?.(folder.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditFolder?.(folder);
    setShowActions(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteFolder?.(folder);
    setShowActions(false);
  };

  return (
    <>
      <Box
        onClick={handleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        sx={{
          display: "flex",
          alignItems: "center",
          padding: "6px 8px",
          paddingLeft: `${8 + level * 16}px`,
          cursor: "pointer",
          borderRadius: "4px",
          backgroundColor: isSelected ? "#E8F5F1" : "transparent",
          "&:hover": {
            backgroundColor: isSelected ? "#E8F5F1" : "#F0F2F5",
          },
          transition: "background-color 0.15s ease",
        }}
      >
        {/* Expand/Collapse toggle */}
        <Box
          onClick={hasChildren ? handleToggle : undefined}
          sx={{
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: hasChildren ? "pointer" : "default",
            opacity: hasChildren ? 1 : 0,
          }}
        >
          {hasChildren && (
            isExpanded ? (
              <ChevronDownIcon size={14} color={text.icon} />
            ) : (
              <ChevronRightIcon size={14} color={text.icon} />
            )
          )}
        </Box>

        {/* Folder icon */}
        <Box
          sx={{
            marginRight: "8px",
            display: "flex",
            alignItems: "center",
            color: folder.color || brand.primary,
          }}
        >
          {isExpanded ? (
            <FolderOpenIcon size={16} />
          ) : (
            <FolderIcon size={16} />
          )}
        </Box>

        {/* Folder name and count */}
        <Typography
          sx={{
            flex: 1,
            fontSize: 13,
            fontWeight: isSelected ? 500 : 400,
            color: isSelected ? "brand.primary" : "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {folder.name}
        </Typography>

        {/* File count */}
        <Typography
          sx={{
            fontSize: 12,
            color: "text.muted",
            marginLeft: "4px",
            flexShrink: 0,
          }}
        >
          ({folder.file_count})
        </Typography>

        {/* Action buttons (shown on hover) */}
        {canManage && showActions && (
          <Box sx={{ display: "flex", gap: "2px", marginLeft: "4px" }}>
            <IconButton
              size="small"
              onClick={handleCreateSubfolder}
              sx={{
                padding: "2px",
                "&:hover": { backgroundColor: "#E8F5F1" },
              }}
              title="Create subfolder"
              aria-label={`Create subfolder in ${folder.name}`}
            >
              <PlusIcon size={12} color={text.icon} />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleEdit}
              sx={{
                padding: "2px",
                "&:hover": { backgroundColor: "#E8F5F1" },
              }}
              title="Edit folder"
              aria-label={`Edit folder ${folder.name}`}
            >
              <EditIcon size={12} color={text.icon} />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleDelete}
              sx={{
                padding: "2px",
                "&:hover": { backgroundColor: "#FEE2E2" },
              }}
              title="Delete folder"
              aria-label={`Delete folder ${folder.name}`}
            >
              <DeleteIcon size={12} color="#EF4444" />
            </IconButton>
          </Box>
        )}
      </Box>

      {/* Children */}
      <Collapse in={isExpanded} timeout={200}>
        <Box>
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolder={selectedFolder}
              expandedFolders={expandedFolders}
              onSelectFolder={onSelectFolder}
              onToggleExpand={onToggleExpand}
              onCreateFolder={onCreateFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
              canManage={canManage}
            />
          ))}
        </Box>
      </Collapse>
    </>
  );
};

/**
 * FolderTree Component
 */
export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  loading,
  canManage,
  collapsed = false,
  onToggleCollapse,
  allLabel = "All files",
  showUncategorized = true,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  const handleToggleExpand = useCallback((folderId: number) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  return (
    <Stack
      sx={{
        width: collapsed ? "48px" : "240px",
        minWidth: collapsed ? "48px" : "200px",
        borderRight: "1px solid #E0E4E9",
        backgroundColor: "#FAFBFC",
        alignSelf: "stretch",
        overflow: "hidden",
        transition: "width 300ms ease, min-width 300ms ease",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          padding: collapsed ? "12px 0" : "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          minHeight: "44px",
        }}
      >
        {collapsed ? (
          <IconButton
            size="small"
            onClick={onToggleCollapse}
            sx={{
              padding: "4px",
              "&:hover": { backgroundColor: "#E8F5F1" },
            }}
            title="Expand sidebar"
            aria-label="Expand folder sidebar"
          >
            <PanelLeftOpenIcon size={16} color={text.icon} />
          </IconButton>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <IconButton
                size="small"
                onClick={onToggleCollapse}
                sx={{
                  padding: "4px",
                  "&:hover": { backgroundColor: "#E8F5F1" },
                }}
                title="Collapse sidebar"
                aria-label="Collapse folder sidebar"
              >
                <PanelLeftCloseIcon size={14} color={text.icon} />
              </IconButton>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "text.icon",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Folders
              </Typography>
            </Box>
            {canManage && (
              <IconButton
                size="small"
                onClick={() => onCreateFolder?.(null)}
                sx={{
                  padding: "4px",
                  "&:hover": { backgroundColor: "#E8F5F1" },
                }}
                title="Create folder"
                aria-label="Create new folder"
              >
                <PlusIcon size={14} color={brand.primary} />
              </IconButton>
            )}
          </>
        )}
      </Box>

      {/* Collapsed state — folder icon only */}
      {collapsed && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            padding: "12px 0",
          }}
        >
          <FolderIcon size={16} color={text.icon} />
        </Box>
      )}

      {/* Folder list — hidden when collapsed */}
      {!collapsed && (
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            padding: "8px",
          }}
        >
          {loading ? (
            <Typography
              sx={{
                fontSize: 13,
                color: "text.muted",
                padding: "12px",
                textAlign: "center",
              }}
            >
              Loading folders...
            </Typography>
          ) : (
            <>
              {/* All Files */}
              <Box
                onClick={() => onSelectFolder("all")}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 8px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  backgroundColor: selectedFolder === "all" ? "#E8F5F1" : "transparent",
                  "&:hover": {
                    backgroundColor: selectedFolder === "all" ? "#E8F5F1" : "#F0F2F5",
                  },
                  marginBottom: "4px",
                }}
              >
                <Box sx={{ width: 20 }} />
                <Box sx={{ marginRight: "8px", display: "flex", color: "text.icon" }}>
                  <FilesIcon size={16} />
                </Box>
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: selectedFolder === "all" ? 500 : 400,
                    color: selectedFolder === "all" ? "brand.primary" : "text.secondary",
                  }}
                >
                  {allLabel}
                </Typography>
              </Box>

              {/* Uncategorized */}
              {showUncategorized && (
              <Box
                onClick={() => onSelectFolder("uncategorized")}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 8px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  backgroundColor: selectedFolder === "uncategorized" ? "#E8F5F1" : "transparent",
                  "&:hover": {
                    backgroundColor: selectedFolder === "uncategorized" ? "#E8F5F1" : "#F0F2F5",
                  },
                  marginBottom: "8px",
                }}
              >
                <Box sx={{ width: 20 }} />
                <Box sx={{ marginRight: "8px", display: "flex", color: "text.muted" }}>
                  <UncategorizedIcon size={16} />
                </Box>
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: selectedFolder === "uncategorized" ? 500 : 400,
                    color: selectedFolder === "uncategorized" ? "brand.primary" : "text.secondary",
                  }}
                >
                  Uncategorized
                </Typography>
              </Box>
              )}

              {/* Folder tree */}
              {folders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  level={0}
                  selectedFolder={selectedFolder}
                  expandedFolders={expandedFolders}
                  onSelectFolder={onSelectFolder}
                  onToggleExpand={handleToggleExpand}
                  onCreateFolder={onCreateFolder}
                  onEditFolder={onEditFolder}
                  onDeleteFolder={onDeleteFolder}
                  canManage={canManage}
                />
              ))}

              {/* Empty state */}
              {folders.length === 0 && (
                <Box
                  sx={{
                    padding: "16px",
                    textAlign: "center",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: "text.muted",
                      marginBottom: "8px",
                    }}
                  >
                    No folders yet
                  </Typography>
                  {canManage && (
                    <CustomizableButton
                      variant="outlined"
                      text="Create folder"
                      onClick={() => onCreateFolder?.(null)}
                      sx={{
                        height: "28px",
                        fontSize: 12,
                      }}
                      icon={<PlusIcon size={12} />}
                    />
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      )}
    </Stack>
  );
};

export default FolderTree;
