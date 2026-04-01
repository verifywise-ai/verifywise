/**
 * @fileoverview NoteComposer Component
 *
 * Form component for creating and editing notes.
 * Provides text input with validation, character count, and submit/cancel buttons.
 *
 * Props:
 * - onSubmit: Callback when form is submitted
 * - onCancel: Callback when edit is cancelled
 * - initialContent: Content for edit mode (optional)
 * - isLoading: Loading state during submission
 * - isEditing: Boolean indicating edit vs create mode
 *
 * @module components/Notes
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Send as SendIcon,
  Save as SaveIcon,
} from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";

interface NoteComposerProps {
  onSubmit: (content: string) => void;
  onCancel?: () => void;
  initialContent?: string;
  isLoading?: boolean;
  isEditing?: boolean;
}

const NoteComposer: React.FC<NoteComposerProps> = ({
  onSubmit,
  onCancel,
  initialContent = "",
  isLoading = false,
  isEditing = false,
}) => {
  const theme = useTheme();
  const [content, setContent] = useState(initialContent);
  const MAX_LENGTH = 5000;
  const remainingChars = MAX_LENGTH - content.length;

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onSubmit(content.trim());
      if (!isEditing) {
        setContent("");
      }
    }
  };

  const handleCancel = () => {
    setContent(initialContent);
    onCancel?.();
  };

  const isContentValid =
    content.trim().length > 0 && content.length <= MAX_LENGTH;
  const isOverLimit = content.length > MAX_LENGTH;

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "4px",
        padding: theme.spacing(3),
        transition: `border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out`,
        "&:focus-within": {
          borderColor: theme.palette.primary.main,
          boxShadow: `0 0 0 3px rgba(19, 113, 91, 0.1)`,
        },
      }}
    >
      <Stack spacing={theme.spacing(3)}>
        {/* Text Input */}
        <TextField
          fullWidth
          multiline
          minRows={isEditing ? 4 : 3}
          maxRows={8}
          placeholder={isEditing ? "Edit your note..." : "Add a note..."}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isLoading}
          variant="standard"
          slotProps={{
            input: {
              disableUnderline: true,
            },
          }}
          sx={{
            "& .MuiInput-root": {
              fontFamily: "inherit",
              fontSize: "13px",
              color: theme.palette.text.primary,
              "&::placeholder": {
                color: theme.palette.text.secondary,
                opacity: 0.5,
              },
            },
            "& .MuiInput-input": {
              padding: 0,
              lineHeight: 1.6,
              "&:disabled": {
                color: theme.palette.text.secondary,
                opacity: 0.6,
              },
            },
          }}
        />

        {/* Action Buttons and Character Count */}
        <Stack
          direction="row"
          spacing={theme.spacing(1.5)}
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            mt: theme.spacing(2),
          }}
        >
          {/* Character Count */}
          <Typography
            sx={{
              fontSize: 11,
              color: isOverLimit
                ? theme.palette.error.main
                : theme.palette.text.secondary,
              fontWeight: isOverLimit ? 600 : 500,
              letterSpacing: "0.3px",
            }}
          >
            {isOverLimit
              ? `⚠️ Exceeded by ${content.length - MAX_LENGTH} characters`
              : `${remainingChars} characters remaining`}
          </Typography>

          {/* Action Buttons */}
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "center" }}
          >
          {isEditing && onCancel && (
            <CustomizableButton
              variant="outlined"
              text="Cancel"
              onClick={handleCancel}
              isDisabled={isLoading}
              sx={{
                minWidth: "80px",
                height: "34px",
                border: "1px solid #d0d5dd",
                color: "text.secondary",
                "&:hover": {
                  backgroundColor: "background.accent",
                  border: "1px solid #d0d5dd",
                },
              }}
            />
          )}

          {isEditing ? (
            <CustomizableButton
              type="submit"
              variant="contained"
              text="Save"
              isDisabled={!isContentValid || isLoading}
              loading={isLoading}
              icon={<SaveIcon size={16} />}
              sx={{
                backgroundColor: "brand.primary",
                border: "1px solid brand.primary",
                gap: 2,
                width: "fit-content",
                height: "34px",
              }}
            />
          ) : (
            <CustomizableButton
              type="submit"
              variant="contained"
              text="Send"
              isDisabled={!isContentValid || isLoading}
              loading={isLoading}
              icon={<SendIcon size={16} />}
              sx={{
                backgroundColor: "brand.primary",
                border: "1px solid brand.primary",
                gap: 2,
                width: "fit-content",
                height: "34px",
              }}
            />
          )}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
};

export default NoteComposer;
