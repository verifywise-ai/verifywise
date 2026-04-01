/**
 * @fileoverview CreateFolderModal Component
 *
 * A modal dialog for creating and editing virtual folders.
 *
 * @module presentation/pages/FileManager/components/CreateFolderModal
 */

import React, { useState, useEffect } from "react";
import { Stack, Box, Typography, TextField } from "@mui/material";
import StandardModal from "../../../../components/Modals/StandardModal";
import {
  IVirtualFolderInput,
  IFolderTreeNode,
  FOLDER_COLORS,
} from "../../../../../domain/interfaces/i.virtualFolder";

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: IVirtualFolderInput) => Promise<void>;
  parentFolder?: IFolderTreeNode | null;
  editFolder?: IFolderTreeNode | null;
  isSubmitting?: boolean;
  /** Existing folder names at the same level (for duplicate check) */
  existingSiblingNames?: string[];
}

/**
 * CreateFolderModal Component
 */
export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  parentFolder,
  editFolder,
  isSubmitting,
  existingSiblingNames = [],
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(FOLDER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!editFolder;

  // Check if folder name already exists (case-insensitive)
  const isDuplicateName = (() => {
    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName) return false;

    // When editing, exclude the current folder's name from the check
    const namesToCheck = isEdit
      ? existingSiblingNames.filter(n => n.toLowerCase() !== editFolder.name.toLowerCase())
      : existingSiblingNames;

    return namesToCheck.some(n => n.toLowerCase() === trimmedName);
  })();

  // Reset form when modal opens/closes or edit folder changes
  useEffect(() => {
    if (isOpen) {
      if (editFolder) {
        setName(editFolder.name);
        setDescription(editFolder.description || "");
        setColor(editFolder.color || FOLDER_COLORS[0]);
      } else {
        setName("");
        setDescription("");
        setColor(FOLDER_COLORS[0]);
      }
      setError(null);
    }
  }, [isOpen, editFolder]);

  const handleSubmit = async () => {
    // Validate
    if (!name.trim()) {
      setError("Folder name is required");
      return;
    }

    if (name.trim().length > 255) {
      setError("Folder name must be less than 255 characters");
      return;
    }

    if (isDuplicateName) {
      setError("A folder with this name already exists");
      return;
    }

    setError(null);

    const input: IVirtualFolderInput = {
      name: name.trim(),
      description: description.trim() || null,
      parent_id: editFolder ? editFolder.parent_id : (parentFolder?.id || null),
      color: color,
    };

    await onSubmit(input);
  };

  // Determine the error message to display
  const displayError = error || (isDuplicateName ? "A folder with this name already exists in this location" : null);

  // Disable submit if there's an error or duplicate name
  const isSubmitDisabled = isSubmitting || !name.trim() || isDuplicateName;

  const getTitle = () => {
    if (isEdit) return "Edit folder";
    if (parentFolder) return `Create subfolder in "${parentFolder.name}"`;
    return "Create new folder";
  };

  const getDescription = () => {
    if (isEdit) return "Update the folder details.";
    if (parentFolder) return "Create a new subfolder to organize your files.";
    return "Create a new folder to organize your files.";
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      description={getDescription()}
      onSubmit={handleSubmit}
      submitButtonText={isEdit ? "Save changes" : "Create folder"}
      isSubmitting={isSubmitDisabled}
      maxWidth="500px"
    >
      <Stack spacing={3}>
        {/* Folder name */}
        <Stack spacing={1}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            Folder name <span style={{ color: "#EF4444" }}>*</span>
          </Typography>
          <TextField
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter folder name"
            fullWidth
            size="small"
            error={!!displayError}
            helperText={displayError}
            autoFocus
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "4px",
                "& fieldset": {
                  borderColor: error ? "#EF4444" : "border.dark",
                },
                "&:hover fieldset": {
                  borderColor: error ? "#EF4444" : "text.muted",
                },
                "&.Mui-focused fieldset": {
                  borderColor: error ? "#EF4444" : "brand.primary",
                },
              },
              "& .MuiInputBase-input": {
                fontSize: 13,
                padding: "10px 12px",
              },
            }}
          />
        </Stack>

        {/* Description */}
        <Stack spacing={1}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            Description
          </Typography>
          <TextField
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter folder description (optional)"
            fullWidth
            multiline
            rows={3}
            size="small"
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "4px",
                "& fieldset": {
                  borderColor: "border.dark",
                },
                "&:hover fieldset": {
                  borderColor: "text.muted",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "brand.primary",
                },
              },
              "& .MuiInputBase-input": {
                fontSize: 13,
              },
            }}
          />
        </Stack>

        {/* Color picker */}
        <Stack spacing={1}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            Folder color
          </Typography>
          <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {FOLDER_COLORS.map((c) => (
              <Box
                key={c}
                onClick={() => setColor(c)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "4px",
                  backgroundColor: c,
                  cursor: "pointer",
                  border: color === c ? "2px solid #101828" : "2px solid transparent",
                  transition: "border-color 0.15s ease",
                  "&:hover": {
                    opacity: 0.8,
                  },
                }}
              />
            ))}
          </Box>
        </Stack>

      </Stack>
    </StandardModal>
  );
};

export default CreateFolderModal;
