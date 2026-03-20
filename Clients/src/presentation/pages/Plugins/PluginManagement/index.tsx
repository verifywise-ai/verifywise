import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Navigate, useLocation } from "react-router-dom";
import {
  Box,
  Stack,
  Typography,
  Chip as MuiChip,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  TextField,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  FormControl,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Chip from "../../../components/Chip";
import {
  ArrowLeft as ArrowLeftIcon,
  CheckCircle as CheckIcon,
  Settings as SettingsIcon,
  Home,
  Puzzle,
  FileSpreadsheet as FileSpreadsheetIcon,
  Package as PackageIcon,
  Database as DatabaseIcon,
} from "lucide-react";
import { PageBreadcrumbs } from "../../../components/breadcrumbs/PageBreadcrumbs";
import { PageHeader } from "../../../components/Layout/PageHeader";
import PluginSlot from "../../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../../domain/constants/pluginSlots";
import { usePluginRegistry } from "../../../../application/contexts/PluginRegistry.context";
import { getPluginByKey, getInstalledPlugins, updatePluginConfiguration, testPluginConnection, connectOAuthWorkspace } from "../../../../application/repository/plugin.repository";
import { usePluginInstallation } from "../../../../application/hooks/usePluginInstallation";
import { Plugin, PluginInstallationStatus } from "../../../../domain/types/plugins";
import Alert from "../../../components/Alert";
import { useAuth } from "../../../../application/hooks/useAuth";
import { cardStyles } from "../../../themes/components";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import { BreadcrumbItem } from "../../../../domain/types/breadcrumbs.types";
import { ENV_VARs } from "../../../../../env.vars";
import { getConfigFields, ConfigField } from "./config-fields";
import {
  backButton,
  pluginIconPlaceholder,
  installedStatusChip,
  installButton,
  uninstallButton,
  formFieldLabel,
  testConnectionButton,
  saveConfigButton,
  configTextField,
  configSelect,
  configCheckbox,
  frameworkDetailsGrid,
  frameworkDetailItem,
  frameworkDetailLabel,
  frameworkDetailValue,
  frameworkTypeChip,
  frameworkTypeDescription,
} from "./style";
import { brand, background, status } from "../../../themes/palette";

const PluginManagement: React.FC = () => {
  const { pluginKey } = useParams<{ pluginKey: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { userRoleName } = useAuth();
  const { install, uninstall, installing, uninstalling } = usePluginInstallation();
  const { getComponentsForSlot } = usePluginRegistry();
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [configData, setConfigData] = useState<Record<string, string>>({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [toast, setToast] = useState<{
    variant: "success" | "info" | "warning" | "error";
    body: string;
    visible: boolean;
  } | null>(null);

  // OAuth connection state
  const [connectingOAuth, setConnectingOAuth] = useState(false);

  const isAdmin = userRoleName === "Admin";

  // Check if plugin is a compliance/framework plugin
  const isFrameworkPlugin = plugin?.category === "compliance";

  // Custom breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const items: BreadcrumbItem[] = [
      {
        label: "Dashboard",
        path: "/",
        icon: <Home size={14} strokeWidth={1.5} />,
      },
      {
        label: "Plugins",
        path: "/plugins/marketplace",
        icon: <Puzzle size={14} strokeWidth={1.5} />,
      },
    ];

    // Add plugin name if available
    if (plugin) {
      items.push({
        label: plugin.displayName,
        path: `/plugins/${pluginKey}/manage`,
        disabled: true,
      });
    }

    return items;
  }, [plugin, pluginKey]);

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      if (pluginKey !== "slack") return;

      const params = new URLSearchParams(location.search);
      const code = params.get("code");

      if (code) {
        setConnectingOAuth(true);
        try {
          await connectOAuthWorkspace({ pluginKey, code });
          setToast({
            variant: "success",
            body: "Slack workspace connected successfully!",
            visible: true,
          });
          // Remove code from URL - plugin component will fetch workspaces on mount
          navigate(`/plugins/${pluginKey}/manage`, { replace: true });
        } catch (error: unknown) {
          setToast({
            variant: "error",
            body: error instanceof Error ? error.message : "Failed to connect Slack workspace",
            visible: true,
          });
          // Remove code from URL
          navigate(`/plugins/${pluginKey}/manage`, { replace: true });
        } finally {
          setConnectingOAuth(false);
        }
      }
    };

    handleOAuthCallback();
  }, [location.search, pluginKey, navigate]);

  // Fetch plugin details
  useEffect(() => {
    const fetchPlugin = async () => {
      if (!pluginKey) return;

      try {
        setLoading(true);
        // Fetch plugin metadata
        const pluginData = await getPluginByKey({ key: pluginKey });

        // Fetch installation status
        const installations = await getInstalledPlugins({});
        const installation = installations.find(
          (inst) => inst.pluginKey === pluginKey || inst.plugin?.key === pluginKey
        );

        if (installation) {
          setPlugin({
            ...pluginData,
            installationId: installation.id,
            installationStatus: installation.status,
            installedAt: installation.installedAt,
          });

          // Load existing configuration
          setConfigData(installation.configuration || {});
        } else {
          setPlugin(pluginData);
        }
      } catch (error) {
        console.error("Failed to fetch plugin:", error);
        setToast({
          variant: "error",
          body: "Failed to load plugin details",
          visible: true,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPlugin();
  }, [pluginKey]);

  const handleUninstallClick = () => {
    setIsDeleteModalOpen(true);
  };

  const handleConfirmUninstall = useCallback(async () => {
    if (!plugin?.installationId) return;

    try {
      await uninstall(plugin.installationId, pluginKey);
      setIsDeleteModalOpen(false);
      setToast({
        variant: "success",
        body: "Plugin uninstalled successfully!",
        visible: true,
      });

      // Navigate back to My Plugins after uninstall
      setTimeout(() => navigate("/plugins/my-plugins"), 1500);
    } catch (err: unknown) {
      setIsDeleteModalOpen(false);
      setToast({
        variant: "error",
        body: err instanceof Error ? err.message : "Failed to uninstall plugin. Please try again.",
        visible: true,
      });
    }
  }, [plugin, pluginKey, uninstall, navigate]);


  const handleCloseToast = () => {
    setToast(null);
  };

  const handleConfigChange = (key: string, value: string) => {
    setConfigData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleTestConnection = async () => {
    if (!pluginKey) return;

    setIsTestingConnection(true);
    try {
      const result = await testPluginConnection({
        pluginKey,
        configuration: configData,
      });

      if (result?.success) {
        setToast({
          variant: "success",
          body: result.message || "Connection test successful!",
          visible: true,
        });
      } else {
        setToast({
          variant: "error",
          body: result?.message || "Connection test failed",
          visible: true,
        });
      }
    } catch (err: unknown) {
      setToast({
        variant: "error",
        body: err instanceof Error ? err.message : "Failed to test connection. Please try again.",
        visible: true,
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (!plugin?.installationId) return;

    setIsSavingConfig(true);
    try {
      await updatePluginConfiguration({
        installationId: plugin.installationId,
        configuration: configData,
      });

      setToast({
        variant: "success",
        body: "Configuration saved successfully!",
        visible: true,
      });
    } catch (err: unknown) {
      setToast({
        variant: "error",
        body: err instanceof Error ? err.message : "Failed to save configuration. Please try again.",
        visible: true,
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Get configuration fields based on plugin type
  const configFields = useMemo(() => getConfigFields(pluginKey), [pluginKey]);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast && toast.visible) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <Stack className="vwhome" gap="16px">
        <PageBreadcrumbs items={breadcrumbItems} autoGenerate={false} />
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </Stack>
    );
  }

  if (!plugin) {
    return (
      <Stack className="vwhome" gap="16px">
        <PageBreadcrumbs items={breadcrumbItems} autoGenerate={false} />
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            Plugin not found
          </Typography>
          <Button
            variant="outlined"
            onClick={() => navigate("/plugins/marketplace")}
            sx={{ mt: 2 }}
          >
            Go to Marketplace
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack className="vwhome" gap="16px">
      <PageBreadcrumbs items={breadcrumbItems} autoGenerate={false} />

      {/* Back Button */}
      <Box>
        <Button
          startIcon={<ArrowLeftIcon size={16} />}
          onClick={() => navigate("/plugins/my-plugins")}
          sx={backButton}
        >
          Back to My Plugins
        </Button>
      </Box>

      <PageHeader
        title={plugin.displayName}
        description={plugin.description}
      />

      <Box sx={{ px: 2 }}>
        <Stack gap={2}>
          {/* Plugin Info Card */}
          <Card sx={cardStyles.base(theme)}>
            <CardContent sx={{ p: "16px" }}>
              <Stack spacing="16px">
                {/* Header with Icon */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {plugin.iconUrl ? (
                    <Box
                      component="img"
                      src={plugin.iconUrl}
                      alt={`${plugin.displayName} logo`}
                      sx={{
                        width: 64,
                        height: 64,
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <Box sx={pluginIconPlaceholder(plugin.key, plugin.category)}>
                      {plugin.key === "risk-import" ? (
                        <FileSpreadsheetIcon size={36} color="#10b981" />
                      ) : plugin.category === "data_management" ? (
                        <DatabaseIcon size={36} color="#8b5cf6" />
                      ) : (
                        <PackageIcon size={36} color="#6366f1" />
                      )}
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                      <Typography variant="h5" fontWeight={600} fontSize={18}>
                        {plugin.displayName}
                      </Typography>
                      {plugin.installationStatus && (
                        <MuiChip
                          size="small"
                          label={plugin.installationStatus}
                          icon={<CheckIcon size={14} />}
                          sx={installedStatusChip}
                        />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" fontSize={13}>
                      Version {plugin.version} • {plugin.author || "VerifyWise"}
                    </Typography>
                  </Box>
                </Box>

                {/* Description */}
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} fontSize={14} mb="8px">
                    About
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontSize={13}>
                    {plugin.longDescription || plugin.description}
                  </Typography>
                </Box>

                {/* Framework Details - Only for compliance/framework plugins */}
                {isFrameworkPlugin && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600} fontSize={14} mb={2}>
                        Framework Details
                      </Typography>
                      <Box sx={frameworkDetailsGrid}>
                        {/* Region */}
                        <Box sx={frameworkDetailItem}>
                          <Box component="span" sx={frameworkDetailLabel}>
                            Region
                          </Box>
                          <Box component="span" sx={frameworkDetailValue}>
                            {plugin.region || "Global"}
                          </Box>
                        </Box>

                        {/* Framework Type */}
                        <Box sx={frameworkDetailItem}>
                          <Box component="span" sx={frameworkDetailLabel}>
                            Framework Type
                          </Box>
                          <Box>
                            <MuiChip
                              size="small"
                              label={plugin.frameworkType === "organizational" ? "Organizational" : "Project-Based"}
                              sx={frameworkTypeChip(plugin.frameworkType === "organizational")}
                            />
                            <Typography component="span" sx={{ ...frameworkTypeDescription, display: "block" }}>
                              {plugin.frameworkType === "organizational"
                                ? "Organization-wide framework that applies globally across all projects"
                                : "Project-specific framework that can be applied to individual projects"}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </>
                )}

                {/* Features */}
                {plugin.features && plugin.features.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} fontSize={14} mb="8px">
                      Features
                    </Typography>
                    <Stack spacing="8px">
                      {plugin.features.map((feature, index) => (
                        <Box
                          key={index}
                          sx={{
                            display: "flex",
                            gap: "12px",
                            padding: "12px",
                            backgroundColor: "background.accent",
                            borderRadius: "6px",
                          }}
                        >
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              backgroundColor: "#E8F5E9",
                              borderRadius: "6px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <CheckIcon size={16} color={brand.primary} />
                          </Box>
                          <Box>
                            <Typography variant="body2" fontWeight={500} fontSize={13}>
                              {feature.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" fontSize={12} sx={{ mt: "2px", display: "block" }}>
                              {feature.description}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}

                {/* Tags */}
                {plugin.tags && plugin.tags.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} fontSize={14} mb="8px">
                      Tags
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {plugin.tags.map((tag, index) => (
                        <Chip
                          key={index}
                          label={tag}
                          size="small"
                          uppercase={false}
                          backgroundColor={background.hover}
                          textColor={status.default.text}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Install Button - Show when plugin is not installed */}
                {(!plugin.installationStatus || plugin.installationStatus === PluginInstallationStatus.UNINSTALLED || plugin.installationStatus === PluginInstallationStatus.FAILED) && (
                  <Box sx={{ display: "flex", gap: 2 }}>
                    <Button
                      variant="contained"
                      onClick={async () => {
                        try {
                          if (plugin.key) {
                            await install(plugin.key);

                            // Refresh plugin data with installation status
                            const [updatedPlugin, installedPlugins] = await Promise.all([
                              getPluginByKey({ key: plugin.key }),
                              getInstalledPlugins()
                            ]);

                            // Find the installation for this plugin
                            const pluginInstallation = installedPlugins.find(
                              (p) => p.pluginKey === plugin.key || p.plugin?.key === plugin.key
                            );

                            // Merge plugin metadata with installation status
                            setPlugin({
                              ...updatedPlugin,
                              installationStatus: pluginInstallation?.status,
                              installationId: pluginInstallation?.id,
                            });

                            setToast({
                              variant: "success",
                              body: "Plugin installed successfully!",
                              visible: true,
                            });
                          }
                        } catch (err: unknown) {
                          setToast({
                            variant: "error",
                            body: err instanceof Error ? err.message : "Failed to install plugin. Please try again.",
                            visible: true,
                          });
                        }
                      }}
                      disabled={installing === plugin.key}
                      sx={installButton}
                    >
                      {installing === plugin.key
                        ? "Installing..."
                        : plugin.installationStatus === PluginInstallationStatus.FAILED
                        ? "Retry Installation"
                        : "Install plugin"}
                    </Button>
                  </Box>
                )}

                {/* Uninstall Button - Show when plugin is installed */}
                {plugin.installationStatus === PluginInstallationStatus.INSTALLED && (
                  <Box sx={{ display: "flex", gap: 2 }}>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={handleUninstallClick}
                      disabled={uninstalling === plugin.installationId}
                      sx={uninstallButton}
                    >
                      {uninstalling === plugin.installationId ? "Uninstalling..." : "Uninstall Plugin"}
                    </Button>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* Configuration Card - Only show for installed plugins that require configuration */}
          {plugin.installationStatus === PluginInstallationStatus.INSTALLED && plugin.requiresConfiguration !== false && (
            <Card sx={cardStyles.base(theme)}>
              <CardContent sx={{ p: "16px" }}>
                <Stack spacing={3}>
                  {/* Configuration Header */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <SettingsIcon size={20} color={brand.primary} />
                    <Typography variant="h6" fontWeight={600} fontSize={15}>
                      Configuration
                    </Typography>
                  </Box>

                  <Divider />

                  {/* Configuration Content */}
                  <Box>
                    {/* Show loading during OAuth connection */}
                    {connectingOAuth && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 4 }}>
                        <CircularProgress size={24} />
                        <Typography fontSize={13}>Connecting to Slack...</Typography>
                      </Box>
                    )}

                    {/* Plugin Configuration via PluginSlot */}
                    {!connectingOAuth && pluginKey && getComponentsForSlot(PLUGIN_SLOTS.PLUGIN_CONFIG).some(c => c.pluginKey === pluginKey) && (
                      <PluginSlot
                        id={PLUGIN_SLOTS.PLUGIN_CONFIG}
                        pluginKey={pluginKey}
                        slotProps={{
                          pluginKey,
                          installationId: plugin.installationId,
                          slackClientId: ENV_VARs.CLIENT_ID,
                          slackOAuthUrl: ENV_VARs.SLACK_URL,
                          onToast: (t: { variant: string; body: string }) => {
                            const variant = t.variant as "success" | "info" | "warning" | "error";
                            setToast({ variant, body: t.body, visible: true });
                          },
                          configData,
                          onConfigChange: handleConfigChange,
                          onSaveConfiguration: handleSaveConfiguration,
                          onTestConnection: handleTestConnection,
                          isSavingConfig,
                          isTestingConnection,
                        }}
                      />
                    )}

                    {/* Generic Configuration Form - only for plugins without custom config UI (that don't require configuration) */}
                    {!connectingOAuth && pluginKey && !getComponentsForSlot(PLUGIN_SLOTS.PLUGIN_CONFIG).some(c => c.pluginKey === pluginKey) && !plugin.requiresConfiguration && (
                      <>
                        <Typography variant="body2" color="text.secondary" fontSize={13} sx={{ mb: 3 }}>
                          Configure {plugin.displayName} settings and preferences.
                        </Typography>

                        {/* Generic Configuration Form */}
                        <Stack spacing={2.5}>
                          {configFields.map((field: ConfigField) => {
                            // Skip field if showIf condition is false
                            if (field.showIf && !field.showIf(configData)) {
                              return null;
                            }

                            // Render based on field type
                            if (field.type === "select") {
                              return (
                                <Box key={field.key}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={500}
                                    fontSize={13}
                                    sx={formFieldLabel}
                                  >
                                    {field.label}
                                  </Typography>
                                  <FormControl fullWidth size="small">
                                    <Select
                                      value={configData[field.key] || field.placeholder || ""}
                                      onChange={(e) => handleConfigChange(field.key, e.target.value)}
                                      sx={configSelect}
                                    >
                                      {field.options?.map((option) => (
                                        <MenuItem key={option.value} value={option.value} sx={{ fontSize: "13px" }}>
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                </Box>
                              );
                            }

                            if (field.type === "multiselect") {
                              const currentValue = configData[field.key] ?
                                (typeof configData[field.key] === 'string' ?
                                  JSON.parse(configData[field.key]) :
                                  configData[field.key]) :
                                [];

                              return (
                                <Box key={field.key}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={500}
                                    fontSize={13}
                                    sx={formFieldLabel}
                                  >
                                    {field.label}
                                  </Typography>
                                  <FormControl fullWidth size="small">
                                    <Select
                                      multiple
                                      value={currentValue}
                                      onChange={(e) => {
                                        const value = typeof e.target.value === 'string' ?
                                          e.target.value.split(',') :
                                          e.target.value;
                                        handleConfigChange(field.key, JSON.stringify(value));
                                      }}
                                      renderValue={(selected) => (selected as string[]).join(", ")}
                                      sx={configSelect}
                                    >
                                      {field.options?.map((option) => (
                                        <MenuItem key={option.value} value={option.value} sx={{ fontSize: "13px" }}>
                                          <Checkbox
                                            checked={currentValue.indexOf(option.value) > -1}
                                            sx={configCheckbox}
                                          />
                                          <Typography fontSize={13}>{option.label}</Typography>
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                </Box>
                              );
                            }

                            if (field.type === "checkbox") {
                              return (
                                <Box key={field.key}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        checked={configData[field.key] === "true"}
                                        onChange={(e) => handleConfigChange(field.key, e.target.checked ? "true" : "false")}
                                        sx={configCheckbox}
                                      />
                                    }
                                    label={
                                      <Typography variant="body2" fontWeight={500} fontSize={13} sx={{ color: "text.secondary" }}>
                                        {field.label}
                                      </Typography>
                                    }
                                  />
                                </Box>
                              );
                            }

                            // Default: Text, URL, Password, Number fields
                            return (
                              <Box key={field.key}>
                                <Typography
                                  variant="body2"
                                  fontWeight={500}
                                  fontSize={13}
                                  sx={formFieldLabel}
                                >
                                  {field.label}
                                </Typography>
                                <TextField
                                  fullWidth
                                  type={field.type}
                                  placeholder={field.placeholder}
                                  value={configData[field.key] || ""}
                                  onChange={(e) => handleConfigChange(field.key, e.target.value)}
                                  size="small"
                                  sx={configTextField}
                                />
                              </Box>
                            );
                          })}
                        </Stack>

                        {/* Test Connection and Save Buttons */}
                        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
                          <Button
                            variant="outlined"
                            onClick={handleTestConnection}
                            disabled={isTestingConnection || isSavingConfig}
                            sx={testConnectionButton}
                          >
                            {isTestingConnection ? "Testing..." : "Test Connection"}
                          </Button>
                          <Button
                            variant="contained"
                            onClick={handleSaveConfiguration}
                            disabled={isSavingConfig || isTestingConnection}
                            sx={saveConfigButton}
                          >
                            {isSavingConfig ? "Saving..." : "Save Configuration"}
                          </Button>
                        </Box>
                      </>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Box>

      {/* Toast Notifications */}
      {toast && toast.visible && (
        <Alert
          variant={toast.variant}
          body={toast.body}
          isToast={true}
          onClick={handleCloseToast}
        />
      )}

      {/* Uninstall Confirmation Modal */}
      {isDeleteModalOpen && plugin && (
        <ConfirmationModal
          title="Confirm uninstall"
          body={
            <Typography fontSize={13}>
              Are you sure you want to uninstall {plugin.displayName}? This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Uninstall"
          onCancel={() => setIsDeleteModalOpen(false)}
          onProceed={handleConfirmUninstall}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
        />
      )}
    </Stack>
  );
};

export default PluginManagement;
