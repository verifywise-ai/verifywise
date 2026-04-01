/**
 * @fileoverview AssignToFolderModal Component
 *
 * A modal dialog for assigning files to virtual folders.
 *
 * @module presentation/pages/FileManager/components/AssignToFolderModal
 */

import React, { useState, useEffect, useMemo } from "react";
import { Stack, Box, Typography, Checkbox } from "@mui/material";
import {
  Folder as FolderIcon,
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import StandardModal from "../../../../components/Modals/StandardModal";
import {
  IFolderTreeNode,
  IVirtualFolder,
} from "../../../../../domain/interfaces/i.virtualFolder";
import { text, brand } from "../../../../themes/palette";

interface AssignToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (folderIds: number[]) => Promise<void>;
  folders: IFolderTreeNode[];
  currentFolders: IVirtualFolder[];
  fileName?: string;
  isSubmitting?: boolean;
}

interface FolderCheckItemProps {
  folder: IFolderTreeNode;
  level: number;
  selectedFolders: Set<number>;
  onToggleFolder: (folderId: number) => void;
  expandedFolders: Set<number>;
  onToggleExpand: (folderId: number) => void;
}

/**
 * Individual folder checkbox item
 */
const FolderCheckItem: React.FC<FolderCheckItemProps> = ({
  folder,
  level,
  selectedFolders,
  onToggleFolder,
  expandedFolders,
  onToggleExpand,
}) => {
  const isSelected = selectedFolders.has(folder.id);
  const isExpanded = expandedFolders.has(folder.id);
  const hasChildren = folder.children.length > 0;

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(folder.id);
  };

  const handleToggleSelect = () => {
    onToggleFolder(folder.id);
  };

  return (
    <>
      <Box
        onClick={handleToggleSelect}
        sx={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          paddingLeft: `${12 + level * 20}px`,
          cursor: "pointer",
          borderRadius: "4px",
          "&:hover": {
            backgroundColor: "background.accent",
          },
        }}
      >
        {/* Expand/Collapse toggle */}
        <Box
          onClick={hasChildren ? handleToggleExpand : undefined}
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

        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onChange={handleToggleSelect}
          onClick={(e) => e.stopPropagation()}
          sx={{
            padding: "4px",
            marginRight: "8px",
            "& .MuiSvgIcon-root": {
              fontSize: 18,
            },
            "&.Mui-checked": {
              color: "brand.primary",
            },
          }}
        />

        {/* Folder icon */}
        <Box
          sx={{
            marginRight: "8px",
            display: "flex",
            alignItems: "center",
            color: folder.color || brand.primary,
          }}
        >
          <FolderIcon size={16} />
        </Box>

        {/* Folder name */}
        <Typography
          sx={{
            flex: 1,
            fontSize: 13,
            color: "text.secondary",
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
          }}
        >
          ({folder.file_count})
        </Typography>
      </Box>

      {/* Children */}
      {isExpanded && hasChildren && (
        <Box>
          {folder.children.map((child) => (
            <FolderCheckItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolders={selectedFolders}
              onToggleFolder={onToggleFolder}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </Box>
      )}
    </>
  );
};

/**
 * AssignToFolderModal Component
 */
export const AssignToFolderModal: React.FC<AssignToFolderModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  folders,
  currentFolders,
  fileName,
  isSubmitting,
}) => {
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  // Initialize selected folders from current assignments
  useEffect(() => {
    if (isOpen) {
      setSelectedFolders(new Set(currentFolders.map((f) => f.id)));
      // Auto-expand folders that contain selected items
      const toExpand = new Set<number>();
      currentFolders.forEach((f) => {
        if (f.parent_id) {
          toExpand.add(f.parent_id);
        }
      });
      setExpandedFolders(toExpand);
    }
  }, [isOpen, currentFolders]);

  const handleToggleFolder = (folderId: number) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleToggleExpand = (folderId: number) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    await onSubmit(Array.from(selectedFolders));
  };

  // Count how many folders are selected
  const selectedCount = selectedFolders.size;

  // Check if there are any changes
  const hasChanges = useMemo(() => {
    const currentIds = new Set(currentFolders.map((f) => f.id));
    if (currentIds.size !== selectedFolders.size) return true;
    for (const id of selectedFolders) {
      if (!currentIds.has(id)) return true;
    }
    return false;
  }, [currentFolders, selectedFolders]);

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign to folders"
      description={
        fileName
          ? `Select the folders to assign "${fileName}" to.`
          : "Select the folders to assign the file to."
      }
      onSubmit={handleSubmit}
      submitButtonText={`Save (${selectedCount} folder${selectedCount !== 1 ? "s" : ""})`}
      isSubmitting={isSubmitting}
      maxWidth="500px"
    >
      <Stack spacing={2}>
        {/* Info text */}
        <Typography sx={{ fontSize: 12, color: "text.icon" }}>
          Files can belong to multiple folders. Select all folders where this file should appear.
        </Typography>

        {/* Folder list */}
        <Box
          sx={{
            maxHeight: "400px",
            overflow: "auto",
            border: "1px solid #E0E4E9",
            borderRadius: "4px",
            backgroundColor: "#FAFBFC",
          }}
        >
          {folders.length === 0 ? (
            <Box sx={{ padding: "24px", textAlign: "center" }}>
              <Typography sx={{ fontSize: 13, color: "text.muted" }}>
                No folders available. Create a folder first.
              </Typography>
            </Box>
          ) : (
            <Stack>
              {folders.map((folder) => (
                <FolderCheckItem
                  key={folder.id}
                  folder={folder}
                  level={0}
                  selectedFolders={selectedFolders}
                  onToggleFolder={handleToggleFolder}
                  expandedFolders={expandedFolders}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </Stack>
          )}
        </Box>

        {/* Selected count */}
        {selectedCount > 0 && (
          <Typography sx={{ fontSize: 12, color: "text.icon" }}>
            File will appear in {selectedCount} folder{selectedCount !== 1 ? "s" : ""}.
          </Typography>
        )}

        {/* No changes warning */}
        {!hasChanges && (
          <Box
            sx={{
              padding: "8px 12px",
              backgroundColor: "#FEF3C7",
              borderRadius: "4px",
              border: "1px solid #FCD34D",
            }}
          >
            <Typography sx={{ fontSize: 12, color: "#92400E" }}>
              No changes have been made.
            </Typography>
          </Box>
        )}
      </Stack>
    </StandardModal>
  );
};

export default AssignToFolderModal;
