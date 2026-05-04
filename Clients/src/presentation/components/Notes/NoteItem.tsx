/**
 * @fileoverview NoteItem Component
 *
 * Displays an individual note with author information, timestamps, and optional action menu.
 * Shows note content with edit indicator if the note has been edited.
 *
 * Props:
 * - note: Note object with content, author, timestamps
 * - onEdit: Callback when user clicks edit
 * - onDelete: Callback when user clicks delete
 * - canEdit: Boolean indicating if user can edit this note
 * - canDelete: Boolean indicating if user can delete this note
 *
 * @module components/Notes
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Stack,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  useTheme,
  Divider,
  Button,
  Collapse,
} from "@mui/material";
import VWAvatar from "../Avatar/VWAvatar";
import { MoreVertical as MenuIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import ConfirmationModal from "../Dialogs/ConfirmationModal";
import { useProfilePhotoFetch } from "../../../application/hooks/useProfilePhotoFetch";

dayjs.extend(relativeTime);

interface NoteItemProps {
  note: {
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
  };
  onEdit: (noteId: number, content: string) => void;
  onDelete: (noteId: number) => void;
  canEdit: boolean;
  canDelete: boolean;
}

const NoteItem: React.FC<NoteItemProps> = ({ note, onEdit, onDelete, canEdit, canDelete }) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState(false);
  const { fetchProfilePhotoAsBlobUrl } = useProfilePhotoFetch();

  // Fetch author's profile photo
  useEffect(() => {
    let cancel = false;
    let previousUrl: string | null = null;

    (async () => {
      if (!note.author_id) return;

      const url = await fetchProfilePhotoAsBlobUrl(note.author_id);
      if (cancel) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (previousUrl && previousUrl !== url) {
        URL.revokeObjectURL(previousUrl);
      }
      previousUrl = url ?? null;
      setAvatarUrl(url ?? "");
    })();

    return () => {
      cancel = true;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    };
  }, [note.author_id, fetchProfilePhotoAsBlobUrl]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    onEdit(note.id, note.content);
    handleMenuClose();
  };

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
    handleMenuClose();
  };

  const handleConfirmDelete = () => {
    onDelete(note.id);
    setIsDeleteModalOpen(false);
  };

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Character limit for truncation
  const TRUNCATE_LENGTH = 200;

  // Helper function to truncate at word boundary
  const getTruncatedContent = (content: string, maxLength: number): string => {
    if (content.length <= maxLength) return content;

    // Find the last space before maxLength to avoid cutting mid-word
    const truncated = content.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(" ");

    // Use last space if it's reasonably close (70% rule), otherwise hard cut
    const cutoff = lastSpaceIndex > maxLength * 0.7 ? lastSpaceIndex : maxLength;

    return content.substring(0, cutoff);
  };

  // Determine if content needs truncation
  const needsTruncation = note.content.length > TRUNCATE_LENGTH;
  const displayContent =
    needsTruncation && !isExpanded
      ? getTruncatedContent(note.content, TRUNCATE_LENGTH)
      : note.content;

  const authorName = note.author
    ? `${note.author.name} ${note.author.surname}`.trim()
    : "Unknown Author";

  // Map note.author to VWAvatar user format
  const avatarUser = note.author
    ? {
        firstname: note.author.name,
        lastname: note.author.surname,
        pathToImage: avatarUrl || undefined,
      }
    : undefined;

  const createdTime = dayjs(note.created_at).fromNow();
  const updatedTime = note.is_edited ? dayjs(note.updated_at).fromNow() : null;

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "4px",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          borderColor: theme.palette.primary.main,
          boxShadow: theme.boxShadow,
        },
      }}
    >
      <Stack spacing={0}>
        {/* Note Header - Author and Timestamp */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: theme.spacing(4),
            backgroundColor: theme.palette.background.modal,
          }}
        >
          <Stack
            direction="row"
            spacing={theme.spacing(1)}
            alignItems="center"
            sx={{ flex: 1, gap: 2 }}
          >
            <Stack
              direction="row"
              spacing={theme.spacing(1)}
              alignItems="center"
              sx={{ flex: 1, gap: 2 }}
            >
              <VWAvatar user={avatarUser} size="small" showBorder={false} />

              <Stack spacing={0} sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                  }}
                >
                  {authorName}
                </Typography>
              </Stack>
            </Stack>

            <Stack
              direction="row"
              spacing={theme.spacing(0.5)}
              alignItems="center"
              sx={{ minWidth: "fit-content", ml: "auto" }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  color: theme.palette.text.secondary,
                  whiteSpace: "nowrap",
                }}
              >
                {createdTime}
              </Typography>

              {note.is_edited && updatedTime && (
                <Typography
                  sx={{
                    fontSize: 12,
                    color: theme.palette.text.secondary,
                    fontStyle: "italic",
                    whiteSpace: "nowrap",
                  }}
                >
                  • Edited {updatedTime}
                </Typography>
              )}
            </Stack>
          </Stack>

          {/* Action Menu */}
          {(canEdit || canDelete) && (
            <Box sx={{ ml: theme.spacing(1.5) }}>
              <IconButton
                size="small"
                onClick={handleMenuOpen}
                sx={{
                  color: theme.palette.text.secondary,
                  padding: theme.spacing(1),
                  transition: `background-color ${0.2}s ease-in-out`,
                  "&:hover": {
                    backgroundColor: theme.palette.action.hover,
                  },
                }}
              >
                <MenuIcon size={18} />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {canEdit && (
                  <MenuItem
                    onClick={handleEdit}
                    sx={{ color: theme.palette.text.primary, fontSize: 13 }}
                  >
                    <EditIcon size={16} style={{ marginRight: 8 }} />
                    Edit
                  </MenuItem>
                )}
                {canDelete && (
                  <MenuItem
                    onClick={handleDeleteClick}
                    sx={{ color: theme.palette.error.main, fontSize: 13 }}
                  >
                    <DeleteIcon size={16} style={{ marginRight: 8 }} />
                    Delete
                  </MenuItem>
                )}
              </Menu>
            </Box>
          )}
        </Box>

        <Divider sx={{ margin: 0, borderColor: theme.palette.border.light }} />

        {/* Note Content */}
        <Box sx={{ padding: theme.spacing(5) }}>
          <Collapse in={true} timeout="auto">
            <Box>
              <Typography
                sx={{
                  fontSize: 13,
                  color: theme.palette.text.primary,
                  lineHeight: 1.7,
                  wordWrap: "break-word",
                  whiteSpace: "pre-wrap",
                  letterSpacing: "0.2px",
                }}
              >
                {displayContent}
                {needsTruncation && !isExpanded && (
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 13,
                      color: theme.palette.text.secondary,
                    }}
                  >
                    ...
                  </Typography>
                )}
              </Typography>

              {needsTruncation && (
                <Button
                  variant="text"
                  size="small"
                  onClick={handleToggleExpanded}
                  aria-label={isExpanded ? "Show less content" : "Show more content"}
                  aria-expanded={isExpanded}
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.palette.primary.main,
                    textTransform: "none",
                    padding: 0,
                    minWidth: "auto",
                    marginTop: theme.spacing(1),
                    transition: "color 0.2s ease-in-out",
                    "&:hover": {
                      backgroundColor: "transparent",
                      color: theme.palette.primary.dark,
                      textDecoration: "underline",
                    },
                  }}
                >
                  {isExpanded ? "See less" : "See more"}
                </Button>
              )}
            </Box>
          </Collapse>
        </Box>
      </Stack>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <ConfirmationModal
          title="Confirm delete"
          body={
            <Typography fontSize={13} sx={{ color: theme.palette.text.secondary }}>
              Are you sure you want to delete this note? This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          onCancel={() => setIsDeleteModalOpen(false)}
          onProceed={handleConfirmDelete}
        />
      )}
    </Box>
  );
};

export default NoteItem;
