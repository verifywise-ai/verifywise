import React, { useState, useEffect } from "react";
import {
  Box,
  Popover,
  Typography,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Copy,
  RotateCw,
  ExternalLink,
  Info,
} from "lucide-react";
import Toggle from "../Inputs/Toggle";
import Checkbox from "../Inputs/Checkbox";
import Field from "../Inputs/Field";
import ManageShareLinks from "./ManageShareLinks";
import { brand, text, background } from "../../themes/palette";

/**
 * Configuration for share view settings
 */
export interface ShareViewSettings {
  /** Whether to share all fields in the view */
  shareAllFields: boolean;
  /** Whether to allow data export */
  allowDataExport: boolean;
  /** Whether to allow viewers to open individual records */
  allowViewersToOpenRecords: boolean;
  /** Whether to display toolbar in the shared view */
  displayToolbar: boolean;
}

/**
 * Props for the ShareViewDropdown component
 */
export interface ShareViewDropdownProps {
  /** The anchor element to position the dropdown */
  anchorEl: HTMLElement | null;
  /** Callback when the dropdown should close */
  onClose: () => void;
  /** The ID of the model/entity being shared */
  modelId?: number | string;
  /** The current shareable link (if already generated) */
  shareableLink?: string;
  /** Whether the share view is currently enabled */
  enabled?: boolean;
  /** Initial settings for the share view */
  initialSettings?: Partial<ShareViewSettings>;
  /** Callback when the enabled state changes */
  onEnabledChange?: (enabled: boolean) => void;
  /** Callback to generate a new shareable link */
  onGenerateLink?: (settings: ShareViewSettings) => string | Promise<string>;
  /** Callback when settings change */
  onSettingsChange?: (settings: ShareViewSettings) => void;
  /** Callback when the link is copied */
  onCopyLink?: (link: string) => void;
  /** Callback when the link refresh is requested */
  onRefreshLink?: () => void;
  /** Callback when opening the link in a new tab */
  onOpenLink?: (link: string) => void;
}

const defaultSettings: ShareViewSettings = {
  shareAllFields: false,
  allowDataExport: true,
  allowViewersToOpenRecords: false,
  displayToolbar: true,
};

/**
 * ShareViewDropdown component for sharing table views
 * Provides options to generate shareable links and configure view permissions
 */
const ShareViewDropdown: React.FC<ShareViewDropdownProps> = ({
  anchorEl,
  onClose,
  modelId,
  shareableLink: initialLink,
  enabled = false,
  initialSettings = {},
  onEnabledChange,
  onGenerateLink,
  onSettingsChange,
  onCopyLink,
  onRefreshLink,
  onOpenLink,
}) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [shareableLink, setShareableLink] = useState(initialLink || "");
  const [settings, setSettings] = useState<ShareViewSettings>({
    ...defaultSettings,
    ...initialSettings,
  });
  const [copySuccess, setCopySuccess] = useState(false);

  // Sync shareableLink prop with internal state
  useEffect(() => {
    if (initialLink) {
      setShareableLink(initialLink);
    }
  }, [initialLink]);

  const handleToggleEnabled = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newEnabled = event.target.checked;
    setIsEnabled(newEnabled);
    onEnabledChange?.(newEnabled);

    // Generate link when enabled
    if (newEnabled && !shareableLink && onGenerateLink) {
      const newLink = await onGenerateLink(settings);
      setShareableLink(newLink);
    }
  };

  const handleSettingChange = (key: keyof ShareViewSettings) => {
    const newSettings = {
      ...settings,
      [key]: !settings[key],
    };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopySuccess(true);
      onCopyLink?.(shareableLink);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  const handleRefreshLink = async () => {
    if (onRefreshLink) {
      onRefreshLink();
    }
    if (onGenerateLink) {
      const newLink = await onGenerateLink(settings);
      setShareableLink(newLink);
    }
  };

  const handleOpenLink = () => {
    if (shareableLink) {
      window.open(shareableLink, "_blank", "noopener,noreferrer");
      onOpenLink?.(shareableLink);
    }
  };

  const open = Boolean(anchorEl);
  const id = open ? "share-view-dropdown" : undefined;

  return (
    <Popover
      id={id}
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      sx={{
        marginTop: "8px",
        "& .MuiPopover-paper": {
          borderRadius: "8px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
          overflow: "visible",
          backgroundColor: `${background.main}`,
          width: "420px",
        },
      }}
    >
      <Box
        role="dialog"
        aria-label="Share view settings"
        sx={{
          padding: "16px",
          width: "100%",
        }}
      >
        {/* Header Section */}
        <Box
          sx={{
            padding: "8px 0",
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: `${text.black}`,
                }}
              >
                Share view
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontSize: "13px",
                  color: "#666",
                  lineHeight: 1.4,
                  marginTop: "8px",
                }}
              >
                Send a view only link to anyone or embed this report on a
                website
              </Typography>
            </Box>
            <Toggle
              checked={isEnabled}
              onChange={handleToggleEnabled}
            />
          </Box>
        </Box>

        {/* Shareable Link Section */}
        {isEnabled && (
          <>
            <Box sx={{ paddingTop: "12px", paddingBottom: "8px" }}>
              <Box sx={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: `${text.black}`,
                  }}
                >
                  Shareable link
                </Typography>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Field
                  value={shareableLink || "Generating link..."}
                  disabled={true}
                  sx={{
                    flex: 1,
                    "& .MuiInputBase-root": {
                      fontSize: "13px",
                      "& input": {
                        cursor: "default",
                      },
                    },
                  }}
                />
                <Tooltip
                  title={copySuccess ? "Copied!" : "Copy link"}
                  slotProps={{
                    tooltip: {
                      sx: {
                        backgroundColor: `${brand.primary}`,
                        color: `${background.main}`,
                        fontSize: "12px",
                        padding: "6px 12px",
                        borderRadius: "4px",
                      },
                    },
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={handleCopyLink}
                    sx={{
                      padding: "4px",
                      color: `${brand.primary}`,
                      "&:hover": {
                        backgroundColor: "rgba(19, 113, 91, 0.1)",
                      },
                    }}
                  >
                    <Copy size={18} />
                  </IconButton>
                </Tooltip>
                <Tooltip
                  title="Refresh link"
                  slotProps={{
                    tooltip: {
                      sx: {
                        backgroundColor: `${brand.primary}`,
                        color: `${background.main}`,
                        fontSize: "12px",
                        padding: "6px 12px",
                        borderRadius: "4px",
                      },
                    },
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={handleRefreshLink}
                    sx={{
                      padding: "4px",
                      color: `${brand.primary}`,
                      "&:hover": {
                        backgroundColor: "rgba(19, 113, 91, 0.1)",
                      },
                    }}
                  >
                    <RotateCw size={18} />
                  </IconButton>
                </Tooltip>
                <Tooltip
                  title="Open in new tab"
                  slotProps={{
                    tooltip: {
                      sx: {
                        backgroundColor: `${brand.primary}`,
                        color: `${background.main}`,
                        fontSize: "12px",
                        padding: "6px 12px",
                        borderRadius: "4px",
                      },
                    },
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={handleOpenLink}
                    disabled={!shareableLink}
                    sx={{
                      padding: "4px",
                      color: `${brand.primary}`,
                      "&:hover": {
                        backgroundColor: "rgba(19, 113, 91, 0.1)",
                      },
                    }}
                  >
                    <ExternalLink size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Settings Section */}
            <Box sx={{ paddingTop: "12px", paddingBottom: "16px" }}>
              <Box sx={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: `${text.black}`,
                  }}
                >
                  Settings
                </Typography>
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <SettingItem
                  label="Share all fields"
                  checked={settings.shareAllFields}
                  onChange={() => handleSettingChange("shareAllFields")}
                  helpText="Include all fields in the shared view"
                />
                <SettingItem
                  label="Allow data to be exported"
                  checked={settings.allowDataExport}
                  onChange={() => handleSettingChange("allowDataExport")}
                  helpText="Enable data export functionality for viewers"
                />
              </Box>
            </Box>

            {/* Existing Share Links Section */}
            {modelId && (
              <>
                <Box
                  sx={{
                    marginTop: "16px",
                  }}
                />
                <ManageShareLinks
                  resourceType="model"
                  resourceId={typeof modelId === 'number' ? modelId : parseInt(String(modelId))}
                  onCopyLink={onCopyLink}
                  onOpenLink={onOpenLink}
                />
              </>
            )}
          </>
        )}
      </Box>
    </Popover>
  );
};

/**
 * Individual setting item with checkbox and help icon
 */
interface SettingItemProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  helpText: string;
}

const SettingItem: React.FC<SettingItemProps> = ({
  label,
  checked,
  onChange,
  helpText,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Box sx={{ flexGrow: 1, marginRight: "8px" }}>
        <Checkbox
          id={`setting-${label.replace(/\s+/g, '-').toLowerCase()}`}
          label={label}
          isChecked={checked}
          value={label}
          onChange={onChange}
          sx={{
            "& svg": {
              color: checked ? "brand.primary" : "#d1d5db",
            },
          }}
        />
      </Box>
      <Tooltip
        title={helpText}
        arrow
        placement="left"
        slotProps={{
          tooltip: {
            sx: {
              backgroundColor: "brand.primary",
              color: "background.main",
              fontSize: "12px",
              padding: "6px 12px",
              borderRadius: "4px",
            },
          },
          arrow: {
            sx: {
              color: "brand.primary",
            },
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "help",
          }}
        >
          <Info size={16} color={text.disabled} />
        </Box>
      </Tooltip>
    </Box>
  );
};

export default ShareViewDropdown;
