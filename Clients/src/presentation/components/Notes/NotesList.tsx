/**
 * @fileoverview NotesList Component
 *
 * Renders a list of notes in reverse chronological order (newest first).
 * Handles note display, edit, and delete operations.
 *
 * Props:
 * - notes: Array of note objects
 * - onEdit: Callback for edit action
 * - onDelete: Callback for delete action
 * - currentUserId: Current authenticated user ID
 * - isLoading: Loading state indicator
 *
 * @module components/Notes
 */

import React from "react";
import { Box, Stack, Typography, useTheme, CircularProgress } from "@mui/material";
import NoteItem from "./NoteItem";

interface NotesListProps {
  notes: Array<{
    id: number;
    content: string;
    author_id: number;
    author?: {
      id: number;
      name: string;
      surname: string;
      email: string;
    };
    created_at: string;
    updated_at: string;
    is_edited: boolean;
  }>;
  onEdit: (noteId: number, content: string) => void;
  onDelete: (noteId: number) => void;
  currentUserId: number;
  currentUserRole: string;
  isLoading?: boolean;
}

const NotesList: React.FC<NotesListProps> = ({
  notes,
  onEdit,
  onDelete,
  currentUserId,
  currentUserRole,
  isLoading = false,
}) => {
  const theme = useTheme();

  // Check if user is admin
  const isAdmin = currentUserRole === "Admin";

  // Ensure notes is always an array
  const notesArray = Array.isArray(notes) ? notes : [];

  // Sort notes by created_at in descending order (newest first)
  const sortedNotes = [...notesArray].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 200,
        }}
      >
        <CircularProgress size={40} />
      </Box>
    );
  }

  if (notesArray.length === 0) {
    return (
      <Box
        sx={{
          textAlign: "center",
          padding: theme.spacing(4, 2),
          backgroundColor: theme.palette.background.paper,
          borderRadius: "4px",
          border: `1px dashed ${theme.palette.border.light}`,
        }}
      >
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.palette.text.secondary,
            mb: theme.spacing(1),
          }}
        >
          No notes yet
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            color: theme.palette.text.secondary,
            opacity: 0.7,
          }}
        >
          Be the first to add one!
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={theme.spacing(2.5)} sx={{ maxHeight: 500, overflowY: "auto" }}>
      {sortedNotes.map((note) => {
        // User can edit if they're the author or an admin
        const canEdit = note.author_id === currentUserId || isAdmin;
        // User can delete if they're the author or an admin
        const canDelete = note.author_id === currentUserId || isAdmin;

        return (
          <NoteItem
            key={note.id}
            note={note}
            onEdit={onEdit}
            onDelete={onDelete}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        );
      })}
    </Stack>
  );
};

export default NotesList;
