/**
 * EntityGraphModal - Full-screen modal for viewing entity relationships
 *
 * Opens Entity Graph focused on a specific entity, allowing users to
 * explore relationships without leaving their current context.
 */

import { useEffect, useState } from "react";
import type { FC } from "react";
import {
  Modal,
  Box,
  IconButton,
  Typography,
  Stack,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { X } from "lucide-react";
import {
  EntityGraphFocusProvider,
  useEntityGraphFocus,
} from "../../contexts/EntityGraphFocusContext";
// Import ReactFlow CSS at modal level to ensure it's available in the portal
import "@xyflow/react/dist/style.css";
// Import EntityGraph directly (not lazy) to avoid portal/context issues
import EntityGraph from "../../pages/EntityGraph";

export type FocusEntityType = "model" | "risk" | "vendor" | "useCase" | "evidence" | "framework";

const ENTITY_TYPE_LABELS: Record<FocusEntityType, string> = {
  model: "Model",
  risk: "Risk",
  vendor: "Vendor",
  useCase: "Use case",
  evidence: "Evidence",
  framework: "Framework",
};

const getEntityTypeLabel = (type: FocusEntityType): string => ENTITY_TYPE_LABELS[type] || type;

interface EntityGraphModalProps {
  open: boolean;
  onClose: () => void;
  focusEntityId: string | number;
  focusEntityType: FocusEntityType;
  focusEntityLabel?: string;
}

// Inner component that uses the focus context
const EntityGraphModalInner: FC<EntityGraphModalProps> = ({
  open,
  onClose,
  focusEntityId,
  focusEntityType,
  focusEntityLabel,
}) => {
  const theme = useTheme();
  const { setFocusEntity, clearFocus } = useEntityGraphFocus();
  const [isMounted, setIsMounted] = useState(false);

  // Delay rendering until modal is fully open to prevent NaN viewport issues
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setIsMounted(true), 100);
      return () => clearTimeout(timer);
    }
    setIsMounted(false);
    return undefined;
  }, [open]);

  // Set focus entity when modal opens
  useEffect(() => {
    if (open) {
      setFocusEntity({
        id: `${focusEntityType}-${focusEntityId}`,
        type: focusEntityType,
        label: focusEntityLabel,
      });
    } else {
      clearFocus();
    }
  }, [open, focusEntityId, focusEntityType, focusEntityLabel, setFocusEntity, clearFocus]);

  const handleClose = () => {
    clearFocus();
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="entity-graph-modal"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        sx={{
          width: "95vw",
          height: "90vh",
          backgroundColor: theme.palette.background.main,
          borderRadius: "8px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 3,
            py: 2,
            borderBottom: `1px solid ${theme.palette.border.light}`,
            backgroundColor: theme.palette.background.accent,
            flexShrink: 0,
          }}
        >
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Typography
              id="entity-graph-modal"
              variant="h6"
              sx={{
                fontSize: 16,
                fontWeight: 600,
                color: theme.palette.text.primary,
              }}
            >
              Entity relationships
            </Typography>
            {focusEntityLabel && (
              <>
                <Typography sx={{ color: theme.palette.other.icon, fontSize: 14 }}>
                  &bull;
                </Typography>
                <Typography
                  sx={{
                    fontSize: 14,
                    color: theme.palette.text.secondary,
                    fontWeight: 500,
                  }}
                >
                  {getEntityTypeLabel(focusEntityType)}: {focusEntityLabel}
                </Typography>
              </>
            )}
          </Stack>

          <Stack direction="row" alignItems="center" gap={1}>
            <IconButton
              onClick={handleClose}
              size="small"
              aria-label="Close entity graph modal"
              sx={{
                color: theme.palette.other.icon,
                "&:hover": {
                  backgroundColor: theme.palette.background.fill,
                },
              }}
            >
              <X size={20} />
            </IconButton>
          </Stack>
        </Stack>

        {/* Content - Full Entity Graph */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            minHeight: 400,
          }}
        >
          {isMounted ? (
            <EntityGraph />
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 2,
              }}
            >
              <CircularProgress size={24} />
              <Typography sx={{ color: theme.palette.other.icon }}>Loading graph...</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Modal>
  );
};

// Wrapper that provides the focus context
export const EntityGraphModal: FC<EntityGraphModalProps> = (props) => {
  return (
    <EntityGraphFocusProvider>
      <EntityGraphModalInner {...props} />
    </EntityGraphFocusProvider>
  );
};
