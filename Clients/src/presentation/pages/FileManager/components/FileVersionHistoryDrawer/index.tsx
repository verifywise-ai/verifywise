/**
 * @fileoverview FileVersionHistoryDrawer Component
 *
 * A slide-out drawer that displays file version history and change log.
 * Shows all versions of a file (grouped by file_group_id) and
 * a timeline of metadata changes from the change history system.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Drawer,
  IconButton,
  Typography,
  CircularProgress,
  Divider,
  Stack,
} from "@mui/material";
import { X, Clock, FileText } from "lucide-react";
import {
  FileMetadata,
  getFileVersionHistory,
} from "../../../../../application/repository/file.repository";
import {
  useEntityChangeHistory,
  EntityChangeHistoryEntry,
} from "../../../../../application/hooks/useEntityChangeHistory";
import Chip from "../../../../components/Chip";
import StatusBadge from "../StatusBadge";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { text } from "../../../../themes/palette";

dayjs.extend(relativeTime);

interface FileVersionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string | number | null;
}

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "Unknown date";
  return dayjs(dateStr).format("MMM D, YYYY [at] h:mm A");
};

const formatRelativeTime = (date: string): string => {
  const now = dayjs();
  const target = dayjs(date);
  const diffMinutes = Math.abs(now.diff(target, "minute"));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.abs(now.diff(target, "hour"));
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.abs(now.diff(target, "day"));
  if (diffDays < 7) return `${diffDays}d ago`;
  return target.format("MMM D, YYYY");
};

export const FileVersionHistoryDrawer: React.FC<FileVersionHistoryDrawerProps> = ({
  isOpen,
  onClose,
  fileId,
}) => {
  const [versions, setVersions] = useState<FileMetadata[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const numericFileId = useMemo(() => {
    if (!fileId) return undefined;
    const parsed = Number(fileId);
    return isNaN(parsed) ? undefined : parsed;
  }, [fileId]);

  // Fetch change history for this file
  const {
    data: historyData,
    isLoading: loadingHistory,
  } = useEntityChangeHistory(
    isOpen ? "file" : undefined,
    isOpen ? numericFileId : undefined
  );

  const history = useMemo(() => {
    if (!historyData) return [];
    return historyData.pages.flatMap((page) => page.data);
  }, [historyData]);

  // Group history entries by timestamp
  const groupedHistory = useMemo(() => {
    const groups: { [key: string]: EntityChangeHistoryEntry[] } = {};

    history.forEach((entry) => {
      if (entry.field_name) {
        const key = `${entry.changed_at}_${entry.action}_${entry.changed_by_user_id}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(entry);
      }
    });

    return Object.values(groups).sort((a, b) => {
      return (
        new Date(b[0].changed_at).getTime() -
        new Date(a[0].changed_at).getTime()
      );
    });
  }, [history]);

  // Fetch version history when drawer opens
  useEffect(() => {
    if (!isOpen || !fileId) {
      setVersions([]);
      setVersionsError(null);
      return;
    }

    let cancelled = false;

    const fetchVersions = async () => {
      setLoadingVersions(true);
      setVersionsError(null);
      try {
        const result = await getFileVersionHistory({ id: String(fileId) });
        if (!cancelled) {
          setVersions(result);
        }
      } catch {
        if (!cancelled) {
          setVersionsError("Could not load version history");
          setVersions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingVersions(false);
        }
      }
    };

    fetchVersions();

    return () => {
      cancelled = true;
    };
  }, [isOpen, fileId]);

  const currentFile = useMemo(() => {
    return versions.find((v) => String(v.id) === String(fileId));
  }, [versions, fileId]);

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 440 },
          maxWidth: "100%",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid #E0E4E9",
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 600,
              color: "#101828",
            }}
          >
            Version history
          </Typography>
          {currentFile && (
            <Typography
              sx={{
                fontSize: 12,
                color: "text.icon",
                mt: 0.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 320,
              }}
            >
              {currentFile.filename}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <X size={18} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          padding: "16px 20px",
        }}
      >
        {/* Versions Section */}
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            mb: 1.5,
          }}
        >
          Versions
        </Typography>

        {loadingVersions ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : versionsError ? (
          <Box
            sx={{
              padding: "12px",
              backgroundColor: "#FEF3F2",
              borderRadius: "4px",
              border: "1px solid #FECDCA",
              mb: 2,
            }}
          >
            <Typography sx={{ fontSize: 12, color: "#B42318" }}>
              {versionsError}
            </Typography>
          </Box>
        ) : versions.length === 0 ? (
          <Box
            sx={{
              padding: "16px",
              textAlign: "center",
              mb: 2,
            }}
          >
            <FileText size={24} color={text.muted} />
            <Typography sx={{ fontSize: 12, color: "text.icon", mt: 1 }}>
              No other versions found
            </Typography>
          </Box>
        ) : (
          <Stack spacing={0} sx={{ mb: 2 }}>
            {versions.map((version, index) => {
              const isCurrent = String(version.id) === String(fileId);
              return (
                <Box
                  key={version.id}
                  sx={{
                    padding: "10px 12px",
                    borderRadius: "4px",
                    backgroundColor: isCurrent ? "#F0FDF4" : "transparent",
                    border: isCurrent ? "1px solid #BBF7D0" : "1px solid transparent",
                    "&:hover": {
                      backgroundColor: isCurrent ? "#F0FDF4" : "background.accent",
                    },
                    position: "relative",
                  }}
                >
                  {/* Timeline connector */}
                  {index < versions.length - 1 && (
                    <Box
                      sx={{
                        position: "absolute",
                        left: 20,
                        bottom: -1,
                        width: 1,
                        height: 8,
                        backgroundColor: "#E0E4E9",
                      }}
                    />
                  )}

                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: isCurrent ? "#16A34A" : "border.dark",
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: isCurrent ? 600 : 400,
                            color: "text.secondary",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {version.filename}
                        </Typography>
                        {isCurrent && (
                          <Typography
                            sx={{
                              fontSize: 10,
                              fontWeight: 500,
                              color: "#16A34A",
                              backgroundColor: "#F0FDF4",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              border: "1px solid #BBF7D0",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Current
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Chip
                          label={`v${version.version || "1.0"}`}
                          variant={
                            version.review_status === "approved"
                              ? "success"
                              : version.review_status === "superseded"
                                ? "default"
                                : "info"
                          }
                          uppercase={false}
                        />
                        {version.review_status && (
                          <StatusBadge status={version.review_status} size="small" />
                        )}
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                        <Clock size={10} color={text.muted} />
                        <Typography sx={{ fontSize: 11, color: "text.muted" }}>
                          {formatDate(version.upload_date)}
                        </Typography>
                      </Stack>
                      {version.uploader_name && (
                        <Typography sx={{ fontSize: 11, color: "text.muted", mt: 0.25 }}>
                          by {version.uploader_name} {version.uploader_surname}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Change History Section */}
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            mb: 1.5,
          }}
        >
          Change history
        </Typography>

        {loadingHistory ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : groupedHistory.length === 0 ? (
          <Box
            sx={{
              padding: "16px",
              textAlign: "center",
            }}
          >
            <Clock size={24} color={text.muted} />
            <Typography sx={{ fontSize: 12, color: "text.icon", mt: 1 }}>
              No changes recorded yet
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {groupedHistory.map((group) => {
              const entry = group[0];
              const userName = entry.user_name && entry.user_surname
                ? `${entry.user_name} ${entry.user_surname}`
                : entry.user_email || "Unknown user";

              return (
                <Box
                  key={`${entry.changed_at}_${entry.id}`}
                  sx={{
                    padding: "10px 12px",
                    backgroundColor: "background.accent",
                    borderRadius: "4px",
                    border: "1px solid #F2F4F7",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}>
                      {userName}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: "text.muted" }}>
                      {formatRelativeTime(entry.changed_at)}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 11, color: "text.icon", mb: 0.5 }}>
                    {entry.action === "created" && "Created this file"}
                    {entry.action === "updated" &&
                      `Updated ${group.length} field${group.length > 1 ? "s" : ""}`}
                    {entry.action === "deleted" && "Deleted this file"}
                  </Typography>
                  {entry.action === "updated" && (
                    <Stack spacing={0.5}>
                      {group.map((change) => (
                        <Stack key={change.id} direction="row" spacing={1} alignItems="center">
                          <Typography
                            sx={{
                              fontSize: 10,
                              color: "text.muted",
                              fontWeight: 500,
                              minWidth: 60,
                            }}
                          >
                            {change.field_name}
                          </Typography>
                          {change.old_value && change.old_value !== "-" && (
                            <Typography
                              sx={{
                                fontSize: 10,
                                color: "#B91C1C",
                                textDecoration: "line-through",
                                maxWidth: 100,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {change.old_value}
                            </Typography>
                          )}
                          {change.old_value && change.old_value !== "-" &&
                            change.new_value && change.new_value !== "-" && (
                              <Typography sx={{ fontSize: 10, color: "text.muted" }}>
                                →
                              </Typography>
                            )}
                          {change.new_value && change.new_value !== "-" && (
                            <Typography
                              sx={{
                                fontSize: 10,
                                color: "#0D7C4F",
                                fontWeight: 500,
                                maxWidth: 100,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {change.new_value}
                            </Typography>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

export default FileVersionHistoryDrawer;
