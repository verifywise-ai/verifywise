/**
 * AIDepGraphModal - Full-screen modal for viewing AI dependency relationships
 *
 * Opens the AI Dependency Graph visualization for a specific scan,
 * allowing users to explore AI/ML component relationships.
 */

import React, { useEffect, useState, memo } from "react";
import {
  Modal,
  Box,
  IconButton,
  Typography,
  Stack,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { X, Network } from "lucide-react";
// Import ReactFlow CSS at modal level to ensure it's available in the portal
import "@xyflow/react/dist/style.css";
import AIDepGraph from "../AIDepGraph";

interface AIDepGraphModalProps {
  open: boolean;
  onClose: () => void;
  scanId: number;
  repositoryName?: string;
  repositoryUrl?: string;
}

const AIDepGraphModal: React.FC<AIDepGraphModalProps> = ({
  open,
  onClose,
  scanId,
  repositoryName,
  repositoryUrl,
}) => {
  const theme = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  // Delay rendering until modal is fully open to prevent NaN viewport issues
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, [open]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="ai-dep-graph-modal"
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
          bgcolor: "common.white",
          borderRadius: 1,
          boxShadow: 24,
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
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "grey.50",
            flexShrink: 0,
          }}
        >
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Network size={20} color={theme.palette.primary.main} />
            <Typography
              variant="h6"
              id="ai-dep-graph-modal-title"
              sx={{
                fontSize: theme.typography.body1.fontSize,
                fontWeight: 600,
                color: "text.primary",
              }}
            >
              AI dependency graph
            </Typography>
            {repositoryName && (
              <>
                <Typography
                  sx={{ color: "text.secondary", fontSize: theme.typography.body2.fontSize }}
                >
                  •
                </Typography>
                <Typography
                  sx={{
                    fontSize: theme.typography.body2.fontSize,
                    color: "text.primary",
                    fontWeight: 500,
                  }}
                >
                  {repositoryName}
                </Typography>
              </>
            )}
          </Stack>

          <Stack direction="row" alignItems="center" gap={1}>
            <IconButton
              onClick={onClose}
              size="small"
              aria-label="Close AI dependency graph modal"
              sx={{
                "color": "text.secondary",
                "&:hover": {
                  bgcolor: "action.hover",
                },
              }}
            >
              <X size={20} />
            </IconButton>
          </Stack>
        </Stack>

        {/* Content - AI Dependency Graph */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            minHeight: 400,
          }}
        >
          {isMounted ? (
            <AIDepGraph scanId={scanId} repositoryUrl={repositoryUrl} />
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
              <CircularProgress size={24} sx={{ color: "primary.main" }} />
              <Typography sx={{ color: "text.secondary" }}>Loading graph...</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Modal>
  );
};

export default memo(AIDepGraphModal);
