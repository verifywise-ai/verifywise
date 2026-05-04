import { memo, useCallback, useState, useMemo } from "react";
import { Box, IconButton, Popover, Stack, Typography, Divider } from "@mui/material";
import { MessageSquarePlus, History, Trash2 } from "lucide-react";
import { AdvisorDomain } from "./advisorConfig";
import { useAdvisorConversationSafe } from "../../../application/contexts/AdvisorConversation.context";
import { formatRelativeDate } from "../../../application/utils/dateFormatter";
import VWTooltip from "../VWTooltip";
import ConfirmationModal from "../Dialogs/ConfirmationModal";

interface AdvisorHeaderProps {
  pageContext?: AdvisorDomain;
}

/**
 * Header bar shown at the top of every advisor panel.
 *
 * Styling notes: matches the NotificationBell popover conventions so the
 * advisor's past-chats list feels native to VerifyWise. 8px radius, soft
 * shadow, `rgba(19, 113, 91, 0.04)` brand tint for the active row with a
 * 3px left accent, 13/12/11px typography, hover-reveal delete action.
 */
const AdvisorHeaderComponent = ({ pageContext }: AdvisorHeaderProps) => {
  const context = useAdvisorConversationSafe();
  const [popoverAnchor, setPopoverAnchor] = useState<null | HTMLElement>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const conversations = useMemo(
    () => (context && pageContext ? context.getConversations(pageContext) : []),
    [context, pageContext],
  );
  const activeId = context && pageContext ? context.getActiveId(pageContext) : null;
  const hasHistory = conversations.length > 0;

  const handleNewChat = useCallback(() => {
    if (!context || !pageContext) return;
    void context.startNewConversation(pageContext);
  }, [context, pageContext]);

  const handleOpenHistory = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setPopoverAnchor(event.currentTarget);
  }, []);

  const handleCloseHistory = useCallback(() => {
    setPopoverAnchor(null);
  }, []);

  const handleSelectConversation = useCallback(
    (id: number) => {
      if (!context || !pageContext) return;
      void context.selectConversation(pageContext, id);
      setPopoverAnchor(null);
    },
    [context, pageContext],
  );

  const handleRequestDelete = useCallback((event: React.MouseEvent, id: number) => {
    event.stopPropagation();
    setPendingDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!context || !pageContext || pendingDeleteId == null) return;
    setIsDeleting(true);
    try {
      await context.deleteConversation(pageContext, pendingDeleteId);
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  }, [context, pageContext, pendingDeleteId]);

  const handleCancelDelete = useCallback(() => {
    if (isDeleting) return;
    setPendingDeleteId(null);
  }, [isDeleting]);

  // Guard: keep the layout stable when there's no provider/context.
  if (!context || !pageContext) {
    return (
      <Box
        sx={{
          height: 40,
          borderBottom: "1px solid",
          borderColor: "background.hover",
          flexShrink: 0,
        }}
      />
    );
  }

  const pendingDeleteSummary = conversations.find((c) => c.id === pendingDeleteId);
  const iconButtonStyles = {
    width: "28px",
    height: "28px",
    color: "text.secondary",
    "&:hover": {
      backgroundColor: "rgba(19, 113, 91, 0.08)",
      color: "brand.primary",
    },
    "&.Mui-disabled": {
      color: "text.disabled",
    },
  };

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderBottom: "1px solid",
          borderColor: "background.hover",
          flexShrink: 0,
          bgcolor: "background.main",
        }}
      >
        <VWTooltip
          header="New chat"
          content="Start a fresh conversation"
          placement="bottom"
          maxWidth={200}
        >
          <IconButton
            size="small"
            onClick={handleNewChat}
            aria-label="Start new chat"
            sx={iconButtonStyles}
          >
            <MessageSquarePlus size={16} />
          </IconButton>
        </VWTooltip>

        <VWTooltip
          header="Past chats"
          content={hasHistory ? "Browse previous conversations" : "No past chats yet"}
          placement="bottom"
          maxWidth={200}
        >
          {/* span wrapper so the tooltip still renders when the button is disabled */}
          <span>
            <IconButton
              size="small"
              onClick={handleOpenHistory}
              disabled={!hasHistory}
              aria-label="Open chat history"
              aria-haspopup="menu"
              aria-expanded={popoverAnchor ? "true" : undefined}
              sx={iconButtonStyles}
            >
              <History size={16} />
            </IconButton>
          </span>
        </VWTooltip>
      </Box>

      <Popover
        open={Boolean(popoverAnchor)}
        anchorEl={popoverAnchor}
        onClose={handleCloseHistory}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{
          "& .MuiPopover-paper": {
            width: 320,
            maxHeight: 480,
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.12)",
            borderRadius: "8px",
            border: "1px solid",
            borderColor: "background.hover",
            mt: 1,
            overflow: "hidden",
          },
        }}
      >
        <Box
          sx={{
            maxHeight: 480,
            overflowY: "auto",
            "&::-webkit-scrollbar": { width: "6px" },
            "&::-webkit-scrollbar-track": { background: "transparent" },
            "&::-webkit-scrollbar-thumb": {
              background: "#e0e0e0",
              borderRadius: "3px",
            },
            "&::-webkit-scrollbar-thumb:hover": {
              backgroundColor: "border.dark",
            },
          }}
        >
          <Stack divider={<Divider sx={{ borderColor: "background.hover" }} />}>
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const label = conv.title && conv.title.length > 0 ? conv.title : "Untitled chat";
              // Prefer last_message_at; fall back to updated_at. Both are
              // TIMESTAMPTZ after the 20260409010003 migration and
              // formatRelativeDate normalizes them either way.
              const tsSource = conv.last_message_at ?? conv.updated_at;
              const timestamp = tsSource ? formatRelativeDate(tsSource) : "Just now";

              return (
                <Box
                  key={conv.id}
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => handleSelectConversation(conv.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectConversation(conv.id);
                    }
                  }}
                  sx={{
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.5,
                    pl: "21px", // 24 - 3px accent border
                    pr: "24px",
                    py: "10px",
                    cursor: "pointer",
                    borderLeft: isActive ? "3px solid" : "3px solid transparent",
                    borderLeftColor: isActive ? "brand.primary" : "transparent",
                    backgroundColor: isActive ? "rgba(19, 113, 91, 0.04)" : "transparent",
                    transition: "all 0.15s ease",
                    "&:hover": {
                      backgroundColor: isActive ? "rgba(19, 113, 91, 0.04)" : "rgba(0, 0, 0, 0.02)",
                    },
                    // Reveal the delete button on hover/focus only, so the
                    // resting state stays clean.
                    "&:hover .advisor-history-delete, &:focus-within .advisor-history-delete": {
                      opacity: 1,
                    },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: "13px",
                        fontWeight: isActive ? 600 : 500,
                        color: "text.primary",
                        lineHeight: 1.4,
                        mb: 0.25,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "11px",
                        color: "text.disabled",
                        mt: 0.5,
                      }}
                    >
                      {timestamp}
                    </Typography>
                  </Box>

                  <VWTooltip
                    header="Delete chat"
                    content="Remove this conversation"
                    placement="left"
                    maxWidth={180}
                  >
                    <IconButton
                      className="advisor-history-delete"
                      size="small"
                      aria-label={`Delete chat: ${label}`}
                      onClick={(event) => handleRequestDelete(event, conv.id)}
                      sx={{
                        width: "24px",
                        height: "24px",
                        flexShrink: 0,
                        opacity: 0,
                        transition:
                          "opacity 120ms ease, color 120ms ease, background-color 120ms ease",
                        color: "text.disabled",
                        "&:hover": {
                          color: "#EF4444",
                          backgroundColor: "rgba(239, 68, 68, 0.08)",
                        },
                        "&:focus-visible": {
                          opacity: 1,
                        },
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </VWTooltip>
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Popover>

      {pendingDeleteId != null && (
        <ConfirmationModal
          isOpen
          title="Delete chat"
          body={
            <Typography sx={{ fontSize: "13px", color: "text.secondary", lineHeight: 1.5 }}>
              {pendingDeleteSummary?.title
                ? `"${pendingDeleteSummary.title}" will be permanently removed.`
                : "This chat will be permanently removed."}{" "}
              This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          onCancel={handleCancelDelete}
          onProceed={handleConfirmDelete}
          isLoading={isDeleting}
        />
      )}
    </>
  );
};

export const AdvisorHeader = memo(AdvisorHeaderComponent);
