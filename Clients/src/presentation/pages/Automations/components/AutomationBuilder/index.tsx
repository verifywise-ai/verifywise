import React from "react";
import {
  Stack,
  Typography,
  IconButton,
  useTheme,
  Box,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  Plus,
  Trash2,
  ArrowDown,
  Mail,
  Settings,
  Clock,
  CornerDownRight,
  Check,
  AlertTriangle,
  Shield,
  AlertCircle,
  GraduationCap,
  List,
  FolderTree,
  Building,
  CheckSquare,
  BarChart3,
} from "lucide-react";
import { Button } from "../../../../components/button";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import {
  Automation,
  Action,
  TriggerTemplate,
  ActionTemplate,
} from "../../../../../domain/types/Automation";

// Icon mapping for trigger types
const getTriggerIcon = (triggerType: string) => {
  switch (triggerType) {
    case "vendor_updated":
      return Building;
    case "model_updated":
      return List;
    case "project_updated":
      return FolderTree;
    case "task_updated":
      return CheckSquare;
    case "risk_updated":
      return AlertTriangle;
    case "training_updated":
      return GraduationCap;
    case "policy_updated":
      return Shield;
    case "incident_updated":
      return AlertCircle;
    case "vendor_review_date_approaching":
      return Clock;
    case "scheduled_report":
      return BarChart3;
    default:
      return Settings;
  }
};

interface AutomationBuilderProps {
  automation: Automation | null;
  triggerTemplates: TriggerTemplate[];
  actionTemplates: ActionTemplate[];
  selectedItemId: string | null;
  selectedItemType: "trigger" | "action" | null;
  onAddTrigger: (template: TriggerTemplate) => void;
  onAddAction: (template: ActionTemplate) => void;
  onSelectItem: (itemId: string, itemType: "trigger" | "action") => void;
  onDeleteTrigger: () => void;
  onDeleteAction: (actionId: string) => void;
  onUpdateAutomationName: (newName: string) => void;
  onUpdateAutomationDescription: (newDescription: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

const AutomationBuilder: React.FC<AutomationBuilderProps> = ({
  automation,
  triggerTemplates,
  actionTemplates,
  selectedItemId,
  onAddTrigger,
  onAddAction,
  onSelectItem,
  onDeleteTrigger,
  onDeleteAction,
  onSave,
  isSaving,
}) => {
  const theme = useTheme();
  const [triggerMenuAnchor, setTriggerMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = React.useState<null | HTMLElement>(null);

  // Format trigger names for dropdown
  const formatTriggerName = (template: TriggerTemplate) => {
    // Check if it's a time-based trigger
    if (
      template.type.includes("scheduled") ||
      template.type.includes("time") ||
      template.name.toLowerCase().includes("schedule")
    ) {
      return template.name;
    }

    // For event-based triggers, format as "When..."
    if (template.name.toLowerCase().startsWith("when ")) {
      return template.name;
    }

    // Convert other triggers to "When..." format
    return `When ${template.name.toLowerCase()}`;
  };

  const handleTriggerMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setTriggerMenuAnchor(event.currentTarget);
  };

  const handleTriggerMenuClose = () => {
    setTriggerMenuAnchor(null);
  };

  const handleTriggerSelect = (template: TriggerTemplate) => {
    onAddTrigger(template);
    handleTriggerMenuClose();
  };

  const handleActionMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setActionMenuAnchor(event.currentTarget);
  };

  const handleActionMenuClose = () => {
    setActionMenuAnchor(null);
  };

  const handleActionSelect = (template: ActionTemplate) => {
    onAddAction(template);
    handleActionMenuClose();
  };

  const renderActionCard = (action: Action) => (
    <Box
      key={action.id}
      sx={{
        "position": "relative",
        "width": 320,
        "height": 60,
        "border":
          selectedItemId === action.id
            ? `1px solid ${theme.palette.primary.main}`
            : `1px solid ${theme.palette.grey[300]}`,
        "borderRadius": 2,
        "backgroundColor": theme.palette.background.paper,
        "display": "flex",
        "alignItems": "center",
        "justifyContent": "center",
        "cursor": "pointer",
        "&:hover": {
          borderColor: theme.palette.primary.main,
          backgroundColor: theme.palette.action.hover,
        },
        "transition": "all 0.2s ease-in-out",
      }}
      onClick={() => onSelectItem(action.id, "action")}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <Mail size={16} strokeWidth={1.5} color={theme.palette.primary.main} />
        <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>{action.name}</Typography>
      </Stack>
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteAction(action.id);
        }}
        sx={{
          "position": "absolute",
          "top": -8,
          "right": -8,
          "backgroundColor": theme.palette.background.paper,
          "color": theme.palette.error.main,
          "boxShadow": theme.shadows[2],
          "&:hover": {
            backgroundColor: theme.palette.error.light,
            color: "white",
          },
        }}
      >
        <Trash2 size={16} />
      </IconButton>
    </Box>
  );

  if (!automation) {
    return (
      <Stack
        sx={{
          height: "100%",
          backgroundColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            backgroundColor: theme.palette.primary.light + "20",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 1.5,
          }}
        >
          <Settings size={48} strokeWidth={1} color={theme.palette.primary.main} />
        </Box>

        {/* Title */}
        <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: 1 }}>
          Let VerifyWise do work for you
        </Typography>

        {/* Subtitle */}
        <Typography
          color="textSecondary"
          sx={{ fontSize: "13px", mb: "32px", maxWidth: 400, fontWeight: 300 }}
        >
          Automate your most common tasks.
        </Typography>

        {/* Suggested Automations */}
        <Stack spacing={3} sx={{ width: "100%", maxWidth: 600 }}>
          <Typography
            color="textSecondary"
            sx={{ fontSize: "13px", textAlign: "left", fontWeight: 600, mb: "32px" }}
          >
            Suggested automations
          </Typography>

          {/* Automation Examples */}
          <Stack spacing={5}>
            {/* Vendor Risk Alert */}
            <Stack direction="row" spacing={2} sx={{ textAlign: "left" }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} strokeWidth={1.5} color={theme.palette.warning.main} />
              </Box>
              <Stack>
                <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>
                  Send vendor risk alert
                </Typography>
                <Typography color="textSecondary" sx={{ fontSize: "13px", fontWeight: 300 }}>
                  When vendor risk severity is High, notify all project owners
                </Typography>
              </Stack>
            </Stack>

            {/* Control Due Reminder */}
            <Stack direction="row" spacing={2} sx={{ textAlign: "left" }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Clock size={24} strokeWidth={1.5} color={theme.palette.info.main} />
              </Box>
              <Stack>
                <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>
                  Send control due reminder
                </Typography>
                <Typography color="textSecondary" sx={{ fontSize: "13px", fontWeight: 300 }}>
                  When control due date approaches, remind owner and reviewer
                </Typography>
              </Stack>
            </Stack>

            {/* Project Member Notification */}
            <Stack direction="row" spacing={2} sx={{ textAlign: "left" }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Mail size={24} strokeWidth={1.5} color={theme.palette.success.main} />
              </Box>
              <Stack>
                <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>
                  Notify new project members
                </Typography>
                <Typography color="textSecondary" sx={{ fontSize: "13px", fontWeight: 300 }}>
                  When user added to project, send welcome notification
                </Typography>
              </Stack>
            </Stack>

            {/* Project Risk Escalation */}
            <Stack direction="row" spacing={2} sx={{ textAlign: "left" }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} strokeWidth={1.5} color={theme.palette.error.main} />
              </Box>
              <Stack>
                <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>
                  Respond to new high risks
                </Typography>
                <Typography color="textSecondary" sx={{ fontSize: "13px", fontWeight: 300 }}>
                  When a high risk is added, notify risk owner and require mitigation plan
                </Typography>
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack
      sx={{
        height: "100%",
        backgroundColor: "transparent",
        position: "relative",
      }}
    >
      {/* Content */}
      <Stack
        sx={{
          "flex": 1,
          "overflow": "auto",
          "p": 2,
          "alignItems": "center",
          "pt": "64px",
          "pb": "64px",
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
        spacing={3}
      >
        {/* Trigger Section */}
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          {/* Trigger Button - shows "Add trigger" or trigger name */}
          <Box
            sx={{
              "position": "relative",
              "width": 320,
              "height": 60,
              "border": `1px dashed ${theme.palette.border.dark}`,
              "borderRadius": 2,
              "backgroundColor": theme.palette.background.paper,
              "display": "flex",
              "alignItems": "center",
              "justifyContent": "center",
              "cursor": "pointer",
              "&:hover": {
                borderColor: theme.palette.primary.main,
                backgroundColor: theme.palette.action.hover,
              },
              "transition": "all 0.2s ease-in-out",
            }}
            onClick={
              automation.trigger && automation.actions.length > 0
                ? () => onSelectItem(automation.trigger!.id, "trigger")
                : handleTriggerMenuOpen
            }
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {automation.trigger ? (
                <>
                  {(() => {
                    const IconComponent = getTriggerIcon(automation.trigger.type);
                    return (
                      <IconComponent
                        size={16}
                        strokeWidth={1.5}
                        color={theme.palette.primary.main}
                      />
                    );
                  })()}
                  <Typography color="primary" sx={{ fontSize: "13px", fontWeight: 500 }}>
                    {automation.trigger.name}
                  </Typography>
                </>
              ) : (
                <>
                  <Plus size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
                  <Typography color="textSecondary" sx={{ fontSize: "13px", fontWeight: 500 }}>
                    Add trigger
                  </Typography>
                </>
              )}
            </Stack>
            {/* Delete button for trigger when no actions exist */}
            {automation.trigger && automation.actions.length === 0 && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTrigger();
                }}
                sx={{
                  "position": "absolute",
                  "top": -8,
                  "right": -8,
                  "backgroundColor": theme.palette.background.paper,
                  "color": theme.palette.error.main,
                  "boxShadow": theme.shadows[2],
                  "&:hover": {
                    backgroundColor: theme.palette.error.light,
                    color: "white",
                  },
                }}
              >
                <Trash2 size={14} />
              </IconButton>
            )}
          </Box>

          {/* Trigger Selection Menu */}
          <Menu
            anchorEl={triggerMenuAnchor}
            open={Boolean(triggerMenuAnchor)}
            onClose={handleTriggerMenuClose}
            PaperProps={{
              sx: {
                boxShadow: "none",
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: 2,
                width: 320,
                py: 2,
                px: 1,
              },
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "center",
            }}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "center",
            }}
            sx={{
              mt: 1,
            }}
          >
            {triggerTemplates.map((template) => (
              <MenuItem
                key={template.type}
                onClick={() => handleTriggerSelect(template)}
                sx={{
                  "py": 1.5,
                  "px": 3,
                  "mx": 1,
                  "borderRadius": 1,
                  "&:hover": {
                    backgroundColor: theme.palette.action.hover,
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 6 }}>
                  {(() => {
                    const IconComponent = getTriggerIcon(template.type);
                    return (
                      <IconComponent
                        size={20}
                        strokeWidth={1.5}
                        color={theme.palette.primary.main}
                      />
                    );
                  })()}
                </ListItemIcon>
                <ListItemText
                  primary={formatTriggerName(template)}
                  primaryTypographyProps={{
                    fontSize: "13px",
                    fontWeight: 400,
                    color: theme.palette.text.primary,
                  }}
                />
              </MenuItem>
            ))}
          </Menu>
        </Stack>

        {/* Actions Section */}
        {automation.trigger && (
          <>
            <Divider>
              <ArrowDown size={16} color={theme.palette.text.disabled} />
            </Divider>

            <Stack spacing={2}>
              {/* Existing Actions */}
              {automation.actions.length > 0 && (
                <Stack spacing={2}>
                  {automation.actions.map((action, index) => (
                    <React.Fragment key={action.id}>
                      {renderActionCard(action)}
                      {index < automation.actions.length - 1 && (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                          <ArrowDown size={16} color={theme.palette.text.disabled} />
                        </Box>
                      )}
                    </React.Fragment>
                  ))}
                </Stack>
              )}

              {/* Spacer above Add Action Button */}
              <Box sx={{ height: "16px" }} />

              {/* Add Action Button - Only show if there are actions that haven't been added yet */}
              {(() => {
                // Get the types of actions already added
                const addedActionTypes = automation.actions.map((action) => action.type);

                // Filter available action templates to only compatible ones with the current trigger
                const compatibleActions = actionTemplates.filter(
                  (template) =>
                    !template.compatibleTriggers ||
                    template.compatibleTriggers.includes(automation.trigger!.type),
                );

                // Check if there are any actions left to add
                const remainingActions = compatibleActions.filter(
                  (template) => !addedActionTypes.includes(template.type),
                );

                // Only render the button if there are actions remaining
                return remainingActions.length > 0 ? (
                  <Button
                    variant="outlined"
                    startIcon={<Plus size={16} strokeWidth={1.5} />}
                    onClick={handleActionMenuOpen}
                    sx={{
                      "width": 320,
                      "height": 60,
                      "border": `1px dashed ${theme.palette.border.dark}`,
                      "borderRadius": 2,
                      "color": theme.palette.text.secondary,
                      "backgroundColor": theme.palette.background.paper,
                      "&:hover": {
                        borderColor: theme.palette.primary.main,
                        backgroundColor: theme.palette.action.hover,
                        border: `1px dashed ${theme.palette.primary.main}`,
                      },
                      "transition": "all 0.2s ease-in-out",
                      "fontSize": "13px",
                      "fontWeight": 500,
                    }}
                  >
                    Add action
                  </Button>
                ) : null;
              })()}

              {/* Action Selection Menu */}
              <Menu
                anchorEl={actionMenuAnchor}
                open={Boolean(actionMenuAnchor)}
                onClose={handleActionMenuClose}
                PaperProps={{
                  sx: {
                    boxShadow: "none",
                    border: `1px solid ${theme.palette.border.light}`,
                    borderRadius: 2,
                    width: 320,
                    py: 2,
                    px: 1,
                  },
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "center",
                }}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "center",
                }}
                sx={{
                  mt: 1,
                }}
              >
                {(() => {
                  // Get the types of actions already added
                  const addedActionTypes = automation.actions.map((action) => action.type);

                  // Filter to show only actions that haven't been added yet and are compatible
                  const availableActions = actionTemplates.filter(
                    (template) =>
                      !addedActionTypes.includes(template.type) &&
                      (!template.compatibleTriggers ||
                        template.compatibleTriggers.includes(automation.trigger!.type)),
                  );

                  return availableActions.map((template) => (
                    <MenuItem
                      key={template.type}
                      onClick={() => handleActionSelect(template)}
                      sx={{
                        "py": 1.5,
                        "px": 3,
                        "mx": 1,
                        "borderRadius": 1,
                        "&:hover": {
                          backgroundColor: theme.palette.action.hover,
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 12 }}>
                        <Mail size={20} strokeWidth={1.5} color={theme.palette.grey[400]} />
                      </ListItemIcon>
                      <ListItemText
                        primary={template.name}
                        primaryTypographyProps={{
                          fontSize: "13px",
                          fontWeight: 400,
                          color: theme.palette.text.primary,
                        }}
                      />
                    </MenuItem>
                  ));
                })()}
              </Menu>
            </Stack>
          </>
        )}

        {/* Automation Preview */}
        {automation.trigger && automation.actions.length > 0 && (
          <>
            <Divider />
            <Stack spacing={1} sx={{ mx: 12 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Automation preview:
              </Typography>
              <Box
                sx={{
                  backgroundColor: theme.palette.action.hover,
                  p: 2,
                  borderRadius: 1,
                  width: "400px",
                }}
              >
                {/* Trigger Name */}
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    mb: 1,
                  }}
                >
                  {automation.trigger.name}
                </Typography>

                {/* Actions List */}
                {automation.actions.map((action, index) => (
                  <Stack
                    key={action.id}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ mb: index < automation.actions.length - 1 ? 0.5 : 0 }}
                  >
                    <Box sx={{ width: "24px", display: "flex", justifyContent: "flex-end" }}>
                      <CornerDownRight size={12} color={theme.palette.text.secondary} />
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: 12,
                        fontFamily: "monospace",
                        color: theme.palette.text.secondary,
                      }}
                    >
                      {action.name}
                    </Typography>
                  </Stack>
                ))}
              </Box>
            </Stack>

            {/* Save Button */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                pt: 2,
              }}
            >
              <CustomizableButton
                variant="contained"
                startIcon={isSaving ? undefined : <Check size={16} />}
                onClick={onSave}
                isDisabled={isSaving}
                loading={isSaving}
                sx={{ minWidth: 200 }}
              >
                {"Save this automation"}
              </CustomizableButton>
            </Box>
          </>
        )}
      </Stack>
    </Stack>
  );
};

export default AutomationBuilder;
