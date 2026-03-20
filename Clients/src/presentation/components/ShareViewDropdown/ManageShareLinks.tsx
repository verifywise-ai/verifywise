import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import { Copy, Trash2, ExternalLink, RotateCw } from "lucide-react";
import Toggle from "../Inputs/Toggle";
import {
  useShareLinks,
  useUpdateShareLink,
  useDeleteShareLink,
} from "../../../application/hooks/useShare";
import { brand, text, background } from "../../themes/palette";

/**
 * Props for the ManageShareLinks component
 */
export interface ManageShareLinksProps {
  /** The type of resource (e.g., 'model', 'policy') */
  resourceType: string;
  /** The ID of the resource */
  resourceId: number;
  /** Callback when a link is copied */
  onCopyLink?: (link: string) => void;
  /** Callback when a link is opened */
  onOpenLink?: (link: string) => void;
}

interface ShareLink {
  id: number;
  share_token: string;
  shareable_url: string;
  is_enabled: boolean;
  created_at: string;
  settings?: {
    shareAllFields: boolean;
    allowDataExport: boolean;
    allowViewersToOpenRecords: boolean;
    displayToolbar: boolean;
  };
}

/**
 * ManageShareLinks component for viewing and managing existing share links
 * Displays a list of share links with options to enable/disable, copy, open, or delete
 */
const ManageShareLinks: React.FC<ManageShareLinksProps> = ({
  resourceType,
  resourceId,
  onCopyLink,
  onOpenLink,
}) => {
  const [copySuccess, setCopySuccess] = useState<number | null>(null);

  const { data: shareLinks = [], isLoading, refetch } = useShareLinks(
    resourceType,
    resourceId
  );
  const updateMutation = useUpdateShareLink();
  const deleteMutation = useDeleteShareLink();

  const handleToggleEnabled = async (id: number, currentEnabled: boolean) => {
    try {
      await updateMutation.mutateAsync({
        id,
        is_enabled: !currentEnabled,
      });
    } catch (error) {
      console.error("Failed to toggle share link:", error);
    }
  };

  const handleCopyLink = async (link: string, id: number) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopySuccess(id);
      onCopyLink?.(link);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  const handleOpenLink = (link: string) => {
    window.open(link, "_blank", "noopener,noreferrer");
    onOpenLink?.(link);
  };

  const handleDeleteLink = async (id: number) => {
    if (window.confirm("Are you sure you want to revoke this share link? This action cannot be undone.")) {
      try {
        await deleteMutation.mutateAsync(id);
      } catch (error) {
        console.error("Failed to delete share link:", error);
      }
    }
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          p: 4,
        }}
      >
        <CircularProgress size={24} sx={{ color: `${brand.primary}` }} />
      </Box>
    );
  }

  if (shareLinks.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography
          variant="body2"
          sx={{
            fontSize: "13px",
            color: "#666",
          }}
        >
          No share links created yet. Enable share view to create one.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, pt: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontSize: "14px",
            fontWeight: 600,
            color: `${text.black}`,
          }}
        >
          Existing Share Links ({shareLinks.length})
        </Typography>
        <Tooltip title="Refresh list">
          <IconButton
            size="small"
            onClick={() => refetch()}
            sx={{
              p: 0.5,
              color: `${brand.primary}`,
              "&:hover": {
                backgroundColor: "rgba(19, 113, 91, 0.1)",
              },
            }}
          >
            <RotateCw size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {shareLinks.map((shareLink: ShareLink) => (
          <Box
            key={shareLink.id}
            sx={{
              border: "1px solid #e0e0e0",
              borderRadius: "6px",
              p: 1.5,
              backgroundColor: shareLink.is_enabled ? `${background.main}` : `${background.surface}`,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 1,
              }}
            >
              <Box sx={{ flex: 1, mr: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "12px",
                    color: "#666",
                    mb: 0.5,
                  }}
                >
                  Created: {new Date(shareLink.created_at).toLocaleDateString()}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "11px",
                    color: "#999",
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {shareLink.shareable_url}
                </Typography>
              </Box>
              <Toggle
                checked={shareLink.is_enabled}
                onChange={() =>
                  handleToggleEnabled(shareLink.id, shareLink.is_enabled)
                }
              />
            </Box>

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mt: 1,
                pt: 1,
                borderTop: "1px solid #e0e0e0",
              }}
            >
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Tooltip
                  title={copySuccess === shareLink.id ? "Copied!" : "Copy link"}
                >
                  <IconButton
                    size="small"
                    onClick={() =>
                      handleCopyLink(shareLink.shareable_url, shareLink.id)
                    }
                    disabled={!shareLink.is_enabled}
                    sx={{
                      p: 0.5,
                      color: `${brand.primary}`,
                      "&:hover": {
                        backgroundColor: "rgba(19, 113, 91, 0.1)",
                      },
                    }}
                  >
                    <Copy size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Open in new tab">
                  <IconButton
                    size="small"
                    onClick={() => handleOpenLink(shareLink.shareable_url)}
                    disabled={!shareLink.is_enabled}
                    sx={{
                      p: 0.5,
                      color: `${brand.primary}`,
                      "&:hover": {
                        backgroundColor: "rgba(19, 113, 91, 0.1)",
                      },
                    }}
                  >
                    <ExternalLink size={16} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Tooltip title="Revoke and delete link">
                <IconButton
                  size="small"
                  onClick={() => handleDeleteLink(shareLink.id)}
                  sx={{
                    p: 0.5,
                    color: "#dc2626",
                    "&:hover": {
                      backgroundColor: "rgba(220, 38, 38, 0.1)",
                    },
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default ManageShareLinks;
