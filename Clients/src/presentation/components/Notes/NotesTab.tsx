/**
 * @fileoverview NotesTab Component
 *
 * Main container component for the Notes feature within a drawer/dialog.
 * Manages note state, handles CRUD operations, and orchestrates child components.
 *
 * Props:
 * - attachedTo: Entity type (e.g., NIST_SUBCATEGORY)
 * - attachedToId: Entity ID
 *
 * @module components/Notes
 */

import React, { useState, useEffect, useCallback } from "react";
import { Stack, useTheme } from "@mui/material";
import { AlertProps } from "../../types/alert.types";
import { useAuth } from "../../../application/hooks/useAuth";
import * as notesRepository from "../../../application/repository/notes.repository";
import NoteComposer from "./NoteComposer";
import NotesList from "./NotesList";
import Alert from "../Alert";

interface Note {
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
}

interface NotesTabProps {
  attachedTo: string;
  attachedToId: string;
}

const NotesTab: React.FC<NotesTabProps> = ({ attachedTo, attachedToId }) => {
  const { userId, userRoleName } = useAuth();
  const theme = useTheme();

  // Validate that attachedTo is provided (defensive check)
  if (!attachedTo) {
    console.error("NotesTab: attachedTo prop is missing or undefined");
  }

  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [alert, setAlert] = useState<AlertProps | null>(null);

  // Fetch notes on component mount or when entity changes
  const fetchNotes = useCallback(async () => {
    if (!attachedToId || !attachedTo) {
      setNotes([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await notesRepository.getNotes(attachedTo, attachedToId);
      // Ensure response is always an array
      setNotes(Array.isArray(response) ? response : []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load notes";
      setAlert({
        variant: "error",
        body: errorMessage,
        isToast: true,
      });
      // Set empty array on error to prevent crashes
      setNotes([]);
    } finally {
      setIsLoading(false);
    }
  }, [attachedTo, attachedToId]);

  useEffect(() => {
    fetchNotes();
  }, [attachedTo, attachedToId, fetchNotes]);

  const handleAddNote = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        setAlert({
          variant: "error",
          body: "Note content cannot be empty",
          isToast: true,
        });
        return;
      }

      // Validate that attachedTo and attachedToId are provided
      if (!attachedTo || !attachedToId) {
        setAlert({
          variant: "error",
          body: "Invalid entity information. Please refresh and try again.",
          isToast: true,
        });
        return;
      }

      setIsSaving(true);
      try {
        // Validate attachedTo one more time before sending (defensive check)
        const entityType = attachedTo?.trim();
        if (!entityType || entityType.length === 0) {
          throw new Error("Entity type is missing. Please refresh and try again.");
        }

        // Explicitly use the attachedTo prop value to ensure correct entity type
        await notesRepository.createNote({
          content,
          attached_to: entityType, // Use validated and trimmed value
          attached_to_id: attachedToId.trim(), // Ensure ID is trimmed
        });

        // Refetch notes to ensure we have the latest data with author info
        await fetchNotes();

        setAlert({
          variant: "success",
          body: "Note added successfully",
          isToast: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to add note";
        setAlert({
          variant: "error",
          body: errorMessage,
          isToast: true,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [attachedTo, attachedToId, fetchNotes],
  );

  const handleEditNote = useCallback((noteId: number, content: string) => {
    setEditingNoteId(noteId);
    setEditingContent(content);
  }, []);

  const handleSaveEdit = useCallback(
    async (content: string) => {
      if (!editingNoteId) return;

      if (!content.trim()) {
        setAlert({
          variant: "error",
          body: "Note content cannot be empty",
          isToast: true,
        });
        return;
      }

      setIsSaving(true);
      try {
        await notesRepository.updateNote(editingNoteId, {
          content,
        });

        // Refetch notes to ensure we have the latest data
        await fetchNotes();

        setEditingNoteId(null);
        setEditingContent("");

        setAlert({
          variant: "success",
          body: "Note updated successfully",
          isToast: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to update note";
        setAlert({
          variant: "error",
          body: errorMessage,
          isToast: true,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [editingNoteId, fetchNotes],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingNoteId(null);
    setEditingContent("");
  }, []);

  const handleDeleteNote = useCallback(
    async (noteId: number) => {
      setIsSaving(true);
      try {
        await notesRepository.deleteNote(noteId);

        // Refetch notes to ensure we have the latest data
        await fetchNotes();

        setAlert({
          variant: "success",
          body: "Note deleted successfully",
          isToast: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to delete note";
        setAlert({
          variant: "error",
          body: errorMessage,
          isToast: true,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [fetchNotes],
  );

  const handleCloseAlert = () => {
    setAlert(null);
  };

  // Auto-dismiss alerts after 3 seconds
  useEffect(() => {
    if (alert) {
      const timeoutId = setTimeout(() => {
        setAlert(null);
      }, 3000); // 3 seconds

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [alert]);

  return (
    <Stack spacing={theme.spacing(3)} sx={{ height: "100%", p: theme.spacing(3, 0) }}>
      {/* Alert */}
      {alert && (
        <Alert
          variant={alert.variant}
          body={alert.body}
          isToast={alert.isToast}
          onClick={handleCloseAlert}
        />
      )}

      {/* Note Composer - Create/Edit Form */}
      <Stack spacing={0}>
        {editingNoteId ? (
          <NoteComposer
            initialContent={editingContent}
            onSubmit={handleSaveEdit}
            onCancel={handleCancelEdit}
            isLoading={isSaving}
            isEditing={true}
          />
        ) : (
          <NoteComposer onSubmit={handleAddNote} isLoading={isSaving} isEditing={false} />
        )}
      </Stack>

      {/* Notes List - Display All Notes */}
      <Stack spacing={0} sx={{ flex: 1, minHeight: 0, overflow: "visible" }}>
        <NotesList
          notes={notes}
          onEdit={handleEditNote}
          onDelete={handleDeleteNote}
          currentUserId={userId || 0}
          currentUserRole={userRoleName || ""}
          isLoading={isLoading}
        />
      </Stack>
    </Stack>
  );
};

export default NotesTab;
