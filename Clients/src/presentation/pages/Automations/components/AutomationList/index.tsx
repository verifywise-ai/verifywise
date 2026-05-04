import React, { useState } from "react";
import {
  Stack,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  useTheme,
  Box,
  Tooltip,
  Drawer,
} from "@mui/material";
import { Plus, Trash2, X, History, ChevronLeft } from "lucide-react";

import { CustomizableButton } from "../../../../components/button/customizable-button";
import { SearchBox } from "../../../../components/Search";
import Toggle from "../../../../components/Inputs/Toggle";
import { Automation } from "../../../../../domain/types/Automation";
import AutomationHistory from "../AutomationHistory";

interface AutomationListProps {
  automations: Automation[];
  selectedAutomationId: string | null;
  searchQuery: string;
  isLoading: boolean;
  onSelectAutomation: (id: string) => void;
  onCreateAutomation: () => void;
  onDeleteAutomation: (id: string) => void;
  onDiscardAutomation: (id: string) => void;
  onToggleAutomation: (id: string) => void;
  onSearchChange: (query: string) => void;
}

const AutomationList: React.FC<AutomationListProps> = ({
  automations,
  selectedAutomationId,
  searchQuery,
  isLoading,
  onSelectAutomation,
  onCreateAutomation,
  onDeleteAutomation,
  onDiscardAutomation,
  onToggleAutomation,
  onSearchChange,
}) => {
  const theme = useTheme();
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyAutomationId, setHistoryAutomationId] = useState<string | null>(null);

  const handleDelete = (event: React.MouseEvent<HTMLElement>, automationId: string) => {
    event.stopPropagation();
    onDeleteAutomation(automationId);
  };

  const handleDiscard = (event: React.MouseEvent<HTMLElement>, automationId: string) => {
    event.stopPropagation();
    onDiscardAutomation(automationId);
  };

  const handleViewHistory = (event: React.MouseEvent<HTMLElement>, automationId: string) => {
    event.stopPropagation();
    setHistoryAutomationId(automationId);
    setHistoryDrawerOpen(true);
  };

  const handleCloseHistory = () => {
    setHistoryDrawerOpen(false);
    setHistoryAutomationId(null);
  };

  return (
    <Stack
      sx={{
        height: "100%",
        backgroundColor: "transparent",
      }}
    >
      {/* Header */}
      <Stack spacing={2} sx={{ p: "16px" }}>
        <Typography variant="h6" sx={{ fontSize: "15px", fontWeight: 600 }}>
          Automations
        </Typography>

        <CustomizableButton
          variant="contained"
          startIcon={<Plus size={16} />}
          onClick={onCreateAutomation}
          sx={{ width: "100%" }}
        >
          Create new automation
        </CustomizableButton>

        <SearchBox
          placeholder="Find automations..."
          value={searchQuery}
          onChange={onSearchChange}
        />
      </Stack>

      {/* Automation List */}
      <Stack sx={{ flex: 1, overflow: "hidden" }}>
        {isLoading ? (
          <Stack spacing={1} sx={{ p: 2 }}>
            {[1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  height: 60,
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 1,
                  animation: "pulse 1.5s ease-in-out infinite",
                  "@keyframes pulse": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.5 },
                  },
                }}
              />
            ))}
          </Stack>
        ) : automations.length === 0 ? (
          <Stack
            spacing={2}
            alignItems="center"
            justifyContent="center"
            sx={{ flex: 1, p: "16px", textAlign: "center" }}
          >
            <Typography color="textSecondary" variant="body2" sx={{ fontWeight: 600 }}>
              {searchQuery ? "No automations found" : "No automations yet"}
            </Typography>
            {!searchQuery && (
              <Typography
                color="textSecondary"
                variant="body2"
                sx={{ fontSize: 12, fontWeight: 300 }}
              >
                Create your first automation to get started. Click on the "Create new automation"
                button above
              </Typography>
            )}
          </Stack>
        ) : (
          <List
            sx={{
              p: "16px",
              overflow: "auto",
              flex: 1,
              "&::-webkit-scrollbar": {
                width: "8px",
              },
              "&::-webkit-scrollbar-track": {
                background: "transparent",
              },
              "&::-webkit-scrollbar-thumb": {
                background: "transparent",
                borderRadius: "4px",
                backgroundClip: "padding-box",
              },
              "&:hover::-webkit-scrollbar-thumb": {
                background: "rgba(0, 0, 0, 0.3)",
              },
              "&::-webkit-scrollbar-thumb:hover": {
                background: "rgba(0, 0, 0, 0.4)",
              },
            }}
          >
            {automations.map((automation) => (
              <ListItemButton
                key={automation.id}
                selected={selectedAutomationId === automation.id}
                onClick={() => onSelectAutomation(automation.id)}
                sx={{
                  borderRadius: 1,
                  mb: "8px",
                  py: "8px", // Reduce vertical padding
                  minHeight: "44px", // Reduced from default height
                  border: `1px solid #d0d5dd`,
                  background:
                    "linear-gradient(135deg, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0.01) 100%)",
                  "&:hover": {
                    background:
                      "linear-gradient(135deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.02) 100%)",
                  },
                  "&.Mui-selected": {
                    border: `1px solid ${theme.palette.primary.main}`,
                    background:
                      "linear-gradient(135deg, rgba(25, 118, 210, 0.06) 0%, rgba(25, 118, 210, 0.03) 100%)",
                    "&:hover": {
                      background:
                        "linear-gradient(135deg, rgba(25, 118, 210, 0.08) 0%, rgba(25, 118, 210, 0.04) 100%)",
                    },
                  },
                }}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      component="span"
                      sx={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}
                    >
                      {automation.name}
                    </Typography>
                  }
                  secondary={
                    <Box
                      component="span"
                      sx={{ display: "flex", alignItems: "center", gap: 3, mt: 2 }}
                    >
                      <Toggle
                        checked={automation.isActive}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleAutomation(automation.id);
                        }}
                        size="small"
                      />
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        component="span"
                        sx={{ fontSize: 10 }}
                      >
                        {automation.isActive ? "ON" : "OFF"}
                      </Typography>
                    </Box>
                  }
                />
                {isNaN(Number(automation.id)) ? (
                  <Tooltip title="Discard unsaved automation">
                    <IconButton
                      size="small"
                      onClick={(e) => handleDiscard(e, automation.id)}
                      sx={{ ml: 1, color: theme.palette.text.secondary }}
                    >
                      <X size={16} />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <>
                    <Tooltip title="View history">
                      <IconButton
                        size="small"
                        onClick={(e) => handleViewHistory(e, automation.id)}
                        sx={{ ml: 1, color: theme.palette.info.main }}
                      >
                        <History size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete automation">
                      <IconButton
                        size="small"
                        onClick={(e) => handleDelete(e, automation.id)}
                        sx={{ ml: 0.5, color: theme.palette.error.main }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Stack>

      {/* History Drawer */}
      <Drawer
        anchor="right"
        open={historyDrawerOpen}
        onClose={handleCloseHistory}
        sx={{
          "& .MuiDrawer-paper": {
            width: "80%",
            maxWidth: "1200px",
            padding: "28px 36px",
          },
        }}
      >
        <Stack spacing={4} sx={{ height: "100%" }}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <IconButton onClick={handleCloseHistory}>
              <ChevronLeft />
            </IconButton>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Automation History</Typography>
          </Stack>

          {historyAutomationId && (
            <Box sx={{ flex: 1, overflow: "auto", pr: 1 }}>
              <AutomationHistory automationId={historyAutomationId} />
            </Box>
          )}
        </Stack>
      </Drawer>
    </Stack>
  );
};

export default AutomationList;
