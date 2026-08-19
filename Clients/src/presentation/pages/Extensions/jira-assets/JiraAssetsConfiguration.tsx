import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Button,
  FormControlLabel,
} from "@mui/material";
import { RefreshCw, Download } from "lucide-react";
import { VWField, VWSelect, VWToggle } from "./VWComponents";
import { apiServices } from "../../../../infrastructure/api/networkServices";

interface Schema {
  id: string;
  name: string;
  objectSchemaKey: string;
}

interface ObjectType {
  id: string;
  name: string;
  objectCount?: number;
}

interface JiraObject {
  id: string;
  key: string;
  name: string;
  attributes: Record<string, any>;
  created: string;
  updated: string;
}

interface ImportedUseCase {
  id: number;
  project_id: number;
  jira_object_id: string;
  uc_id: string;
  name?: string;
  data: any;
  last_synced_at: string;
  sync_status: string;
}

export const JiraAssetsConfiguration: React.FC = () => {
  const pluginApiCall = useCallback(async (method: string, path: string, body?: any) => {
    const url = `/extensions/jira-assets${path.startsWith("/") ? path : `/${path}`}`;
    let response: any;

    switch (method.toUpperCase()) {
      case "GET":
        response = await apiServices.get(url);
        break;
      case "POST":
        response = await apiServices.post(url, body);
        break;
      case "PUT":
        response = await apiServices.put(url, body);
        break;
      case "PATCH":
        response = await apiServices.patch(url, body);
        break;
      case "DELETE":
        response = await apiServices.delete(url);
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    return response.data?.data ?? response.data;
  }, []);

  const [localConfig, setLocalConfig] = useState<Record<string, any>>({
    deployment_type: "cloud",
    sync_enabled: false,
    sync_interval_hours: 24,
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingObjectTypes, setIsLoadingObjectTypes] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Import state
  const [jiraObjects, setJiraObjects] = useState<JiraObject[]>([]);
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Imported use cases state
  const [importedUseCases, setImportedUseCases] = useState<ImportedUseCase[]>([]);
  const [, setIsLoadingUseCases] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load config from plugin's own endpoint on mount (only once)
  useEffect(() => {
    if (configLoaded) return;

    const loadConfig = async () => {
      try {
        const url = "/extensions/jira-assets/config";
        const response: any = await apiServices.get(url);
        const data = response.data?.data ?? response.data;
        if (data) {
          setLocalConfig((prev) => ({ ...prev, ...data }));
        }
      } catch (error) {
        console.error("Failed to load JIRA config:", error);
      } finally {
        setConfigLoaded(true);
      }
    };
    loadConfig();
  }, [configLoaded]);

  const handleChange = useCallback((key: string, value: any) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Load schemas when connection is configured
  const loadSchemas = useCallback(async () => {
    if (!localConfig.jira_base_url || !localConfig.workspace_id) return;

    setIsLoadingSchemas(true);
    try {
      const response = await pluginApiCall("GET", "/schemas");
      if (response && Array.isArray(response)) {
        setSchemas(response);
      }
    } catch (error) {
      console.error("Failed to load schemas:", error);
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [pluginApiCall, localConfig.jira_base_url, localConfig.workspace_id]);

  // Load object types when schema is selected
  const loadObjectTypes = useCallback(
    async (schemaId: string) => {
      if (!schemaId) return;

      setIsLoadingObjectTypes(true);
      try {
        const response = await pluginApiCall("GET", `/schemas/${schemaId}/object-types`);
        console.log(
          "[JiraConfig] loadObjectTypes response:",
          response,
          "isArray:",
          Array.isArray(response),
        );
        if (response && Array.isArray(response)) {
          setObjectTypes(response);
        } else {
          console.warn("[JiraConfig] Object types response is not an array:", typeof response);
        }
      } catch (error) {
        console.error("Failed to load object types:", error);
      } finally {
        setIsLoadingObjectTypes(false);
      }
    },
    [pluginApiCall],
  );

  // Load JIRA objects for import
  const loadJiraObjects = useCallback(async () => {
    if (!localConfig.selected_object_type_id) return;

    setIsLoadingObjects(true);
    setImportMessage(null);
    try {
      const response = await pluginApiCall(
        "GET",
        `/object-types/${localConfig.selected_object_type_id}/objects`,
      );
      if (response && Array.isArray(response)) {
        // Filter out already imported objects
        const importedIds = new Set(importedUseCases.map((uc) => uc.jira_object_id));
        const newObjects = response.filter((obj: JiraObject) => !importedIds.has(obj.id));
        setJiraObjects(newObjects);
      }
    } catch (error: any) {
      setImportMessage({ type: "error", text: error.message || "Failed to load JIRA objects" });
    } finally {
      setIsLoadingObjects(false);
    }
  }, [pluginApiCall, localConfig.selected_object_type_id, importedUseCases]);

  // Load imported use cases
  const loadImportedUseCases = useCallback(async () => {
    setIsLoadingUseCases(true);
    try {
      const response = await pluginApiCall("GET", "/use-cases");
      if (response && Array.isArray(response)) {
        setImportedUseCases(response);
      }
    } catch (error) {
      console.error("Failed to load imported use cases:", error);
    } finally {
      setIsLoadingUseCases(false);
    }
  }, [pluginApiCall]);

  // Import selected objects
  const handleImport = async () => {
    if (selectedObjects.size === 0) return;

    setIsImporting(true);
    setImportMessage(null);
    try {
      const response = await pluginApiCall("POST", "/import", {
        object_ids: Array.from(selectedObjects),
      });

      if (response?.success) {
        setImportMessage({
          type: "success",
          text: `Successfully imported ${response.imported} objects`,
        });
        setSelectedObjects(new Set());
        // Reload both lists
        await loadImportedUseCases();
        await loadJiraObjects();
      } else {
        setImportMessage({ type: "error", text: response?.error || "Import failed" });
      }
    } catch (error: any) {
      setImportMessage({ type: "error", text: error.message || "Import failed" });
    } finally {
      setIsImporting(false);
    }
  };

  // Sync now - fetch latest data from JIRA
  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const response = await pluginApiCall("POST", "/sync");
      if (response?.success) {
        setSyncMessage({
          type: "success",
          text: `Sync completed: ${response.objectsCreated || 0} created, ${response.objectsUpdated || 0} updated, ${response.objectsDeleted || 0} deleted`,
        });
        // Reload the imported use cases to show updated data
        await loadImportedUseCases();
        // Update last_sync_at in local config
        setLocalConfig((prev) => ({
          ...prev,
          last_sync_at: new Date().toISOString(),
          last_sync_status: "success",
        }));
      } else {
        setSyncMessage({ type: "error", text: response?.error || "Sync failed" });
      }
    } catch (error: any) {
      setSyncMessage({ type: "error", text: error.message || "Sync failed" });
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle object selection
  const toggleObjectSelection = (objectId: string) => {
    setSelectedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(objectId)) {
        next.delete(objectId);
      } else {
        next.add(objectId);
      }
      return next;
    });
  };

  // Select all objects
  const toggleSelectAll = () => {
    if (selectedObjects.size === jiraObjects.length) {
      setSelectedObjects(new Set());
    } else {
      setSelectedObjects(new Set(jiraObjects.map((obj) => obj.id)));
    }
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    setConnectionMessage("");

    try {
      // Note: test-connection goes through the main controller which expects { configuration: {...} }
      const response = await pluginApiCall("POST", "/test-connection", {
        configuration: {
          jira_base_url: localConfig.jira_base_url,
          workspace_id: localConfig.workspace_id,
          email: localConfig.email,
          api_token: localConfig.api_token,
          deployment_type: localConfig.deployment_type || "cloud",
        },
      });

      if (response?.success) {
        setConnectionStatus("success");
        setConnectionMessage(
          response.message ||
            "Connection successful. Click 'Save Configuration' to proceed to Step 2.",
        );
      } else {
        setConnectionStatus("error");
        setConnectionMessage(response?.message || "Connection failed");
      }
    } catch (error: any) {
      setConnectionStatus("error");
      setConnectionMessage(error.message || "Connection test failed");
    }
  };

  // Save configuration to plugin's own endpoint
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response: any = await apiServices.post("/extensions/jira-assets/config", {
        jira_base_url: localConfig.jira_base_url,
        workspace_id: localConfig.workspace_id,
        email: localConfig.email,
        api_token: localConfig.api_token || undefined, // Only send if user entered a new one
        deployment_type: localConfig.deployment_type || "cloud",
        selected_schema_id: localConfig.selected_schema_id || undefined,
        selected_object_type_id: localConfig.selected_object_type_id || undefined,
        sync_enabled: localConfig.sync_enabled || false,
        sync_interval_hours: localConfig.sync_interval_hours || 24,
      });

      const data = response.data?.data ?? response.data;
      if (data?.success) {
        setSaveMessage({ type: "success", text: "Configuration saved successfully!" });
        // Update localConfig with has_api_token flag so schemas can load
        setLocalConfig((prev) => ({ ...prev, has_api_token: true }));
        // Reload config to get full updated data
        setConfigLoaded(false);
        // Note: loadSchemas will be triggered by useEffect when has_api_token becomes true
      } else {
        setSaveMessage({
          type: "error",
          text: data?.errors?.join(", ") || data?.message || "Failed to save configuration",
        });
      }
    } catch (error: any) {
      setSaveMessage({ type: "error", text: error.message || "Failed to save configuration" });
    } finally {
      setIsSaving(false);
    }
  };

  // Persist a partial config update to the plugin's /config endpoint
  // without requiring the user to click "Save Configuration". We send
  // only what changed alongside the previously-saved connection fields,
  // so the existing api_token (already encrypted in the DB) is preserved
  // by the backend's `hasExistingToken` branch.
  const persistConfigPatch = useCallback(
    async (patch: Record<string, any>) => {
      if (!localConfig.has_api_token) return;
      try {
        await pluginApiCall("POST", "/config", {
          jira_base_url: localConfig.jira_base_url,
          workspace_id: localConfig.workspace_id,
          email: localConfig.email,
          deployment_type: localConfig.deployment_type || "cloud",
          // Defaults so the backend doesn't null these out on partial saves
          selected_schema_id: localConfig.selected_schema_id || undefined,
          selected_object_type_id: localConfig.selected_object_type_id || undefined,
          sync_enabled: localConfig.sync_enabled || false,
          sync_interval_hours: localConfig.sync_interval_hours || 24,
          ...patch,
        });
      } catch (err) {
        // Best-effort; user can still hit the Save button explicitly.
        console.warn("[JiraConfig] auto-save failed:", err);
      }
    },
    [pluginApiCall, localConfig],
  );

  // Handle schema selection. Auto-persist so users don't have to click
  // Save Configuration just to remember their picks across reloads.
  const handleSchemaChange = (schemaId: string) => {
    handleChange("selected_schema_id", schemaId);
    handleChange("selected_object_type_id", "");
    setObjectTypes([]);
    if (schemaId) {
      loadObjectTypes(schemaId);
      void persistConfigPatch({
        selected_schema_id: schemaId,
        selected_object_type_id: undefined,
      });
    }
  };

  // Handle object type selection. Auto-persist for the same reason.
  const handleObjectTypeChange = (objectTypeId: string) => {
    handleChange("selected_object_type_id", objectTypeId);
    if (objectTypeId) {
      void persistConfigPatch({ selected_object_type_id: objectTypeId });
    }
  };

  // Load schemas on mount only if already configured (has_api_token indicates saved config)
  useEffect(() => {
    console.log("[JiraConfig] Schema load check:", {
      has_api_token: localConfig.has_api_token,
      jira_base_url: localConfig.jira_base_url,
      workspace_id: localConfig.workspace_id,
      schemas_length: schemas.length,
    });
    if (
      localConfig.has_api_token &&
      localConfig.jira_base_url &&
      localConfig.workspace_id &&
      schemas.length === 0
    ) {
      console.log("[JiraConfig] Calling loadSchemas()");
      loadSchemas();
    }
  }, [
    localConfig.has_api_token,
    localConfig.jira_base_url,
    localConfig.workspace_id,
    loadSchemas,
    schemas.length,
  ]);

  // Load object types if schema is already selected (only if config is saved)
  useEffect(() => {
    if (localConfig.has_api_token && localConfig.selected_schema_id && objectTypes.length === 0) {
      loadObjectTypes(localConfig.selected_schema_id);
    }
  }, [
    localConfig.has_api_token,
    localConfig.selected_schema_id,
    loadObjectTypes,
    objectTypes.length,
  ]);

  // Load imported use cases on mount
  useEffect(() => {
    if (configLoaded) {
      loadImportedUseCases();
    }
  }, [configLoaded, loadImportedUseCases]);

  const syncIntervalOptions = [
    { value: 1, label: "Every hour" },
    { value: 6, label: "Every 6 hours" },
    { value: 12, label: "Every 12 hours" },
    { value: 24, label: "Every 24 hours" },
    { value: 48, label: "Every 48 hours" },
  ];

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" fontSize={13} sx={{ mb: 3 }}>
        Connect to your Jira Service Management Assets to import AI Systems as use-cases.
      </Typography>

      {/* Step 1: Connection Settings */}
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2, color: "#344054" }}>
        Step 1: Connection Settings
      </Typography>

      <Stack spacing={2.5}>
        <Box>
          <VWSelect
            id="deployment_type"
            label="Deployment Type"
            isRequired
            value={localConfig.deployment_type || "cloud"}
            onChange={(e) => handleChange("deployment_type", e.target.value)}
            items={[
              { _id: "cloud", name: "JIRA Cloud (Atlassian-hosted)" },
              { _id: "datacenter", name: "JIRA Data Center / Server (Self-hosted)" },
            ]}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            Select Cloud for *.atlassian.net, or Data Center for self-hosted JIRA
          </Typography>
        </Box>

        <Box>
          <VWField
            id="jira_base_url"
            label="JIRA Base URL"
            isRequired
            placeholder={
              localConfig.deployment_type === "datacenter"
                ? "https://jira.your-company.com"
                : "https://your-company.atlassian.net"
            }
            value={localConfig.jira_base_url || ""}
            onChange={(e) => handleChange("jira_base_url", e.target.value)}
          />
        </Box>

        <Box>
          <VWField
            id="workspace_id"
            label={
              localConfig.deployment_type === "datacenter"
                ? "Insight Object Schema ID"
                : "Workspace ID"
            }
            isRequired
            placeholder={
              localConfig.deployment_type === "datacenter"
                ? "Enter object schema ID (e.g., 1)"
                : "Enter your JSM Assets workspace ID"
            }
            value={localConfig.workspace_id || ""}
            onChange={(e) => handleChange("workspace_id", e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {localConfig.deployment_type === "datacenter"
              ? "For Data Center: Use object schema ID from Insight settings"
              : "Found in Assets settings or the URL when viewing Assets"}
          </Typography>
        </Box>

        <Box>
          <VWField
            id="email"
            label={localConfig.deployment_type === "datacenter" ? "Username" : "Email"}
            isRequired
            type={localConfig.deployment_type === "datacenter" ? "text" : "email"}
            placeholder={
              localConfig.deployment_type === "datacenter"
                ? "your-username"
                : "your-email@company.com"
            }
            value={localConfig.email || ""}
            onChange={(e) => handleChange("email", e.target.value)}
          />
        </Box>

        <Box>
          <VWField
            id="api_token"
            label={localConfig.deployment_type === "datacenter" ? "Password / Token" : "API Token"}
            isRequired={!localConfig.has_api_token}
            type="password"
            placeholder={
              localConfig.has_api_token && !localConfig.api_token
                ? "••••••••••••••••  (saved - enter new value to change)"
                : localConfig.deployment_type === "datacenter"
                  ? "Enter your password or personal access token"
                  : "Enter your Atlassian API token"
            }
            value={localConfig.api_token || ""}
            onChange={(e) => handleChange("api_token", e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {localConfig.has_api_token && !localConfig.api_token
              ? "API token is saved. Leave empty to keep current token, or enter a new value to update."
              : localConfig.deployment_type === "datacenter"
                ? "Use your JIRA password or personal access token"
                : "Generate at id.atlassian.com/manage-profile/security/api-tokens"}
          </Typography>
        </Box>
      </Stack>

      {/* Connection Status */}
      {connectionStatus !== "idle" && (
        <Box sx={{ mt: 2 }}>
          <Alert
            severity={
              connectionStatus === "success"
                ? "success"
                : connectionStatus === "error"
                  ? "error"
                  : "info"
            }
            sx={{ fontSize: "13px" }}
          >
            {connectionStatus === "testing" ? "Testing connection..." : connectionMessage}
          </Alert>
        </Box>
      )}

      {/* Save Message */}
      {saveMessage && (
        <Box sx={{ mt: 2 }}>
          <Alert
            severity={saveMessage.type}
            sx={{ fontSize: "13px" }}
            onClose={() => setSaveMessage(null)}
          >
            {saveMessage.text}
          </Alert>
        </Box>
      )}

      {/* Test Connection & Save Configuration Buttons - Side by Side */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 2 }}>
        <Button
          variant="outlined"
          onClick={handleTestConnection}
          disabled={
            connectionStatus === "testing" ||
            !localConfig.jira_base_url ||
            !localConfig.workspace_id ||
            !localConfig.email ||
            (!localConfig.api_token && !localConfig.has_api_token)
          }
          sx={{
            "borderColor": "#13715B",
            "color": "#13715B",
            "textTransform": "none",
            "fontSize": "13px",
            "fontWeight": 500,
            "&:hover": { borderColor: "#0F5A47", backgroundColor: "rgba(19, 113, 91, 0.04)" },
            "&:disabled": { borderColor: "#d0d5dd", color: "#98a2b3" },
          }}
        >
          {connectionStatus === "testing" ? (
            <>
              <CircularProgress size={16} sx={{ mr: 1 }} />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </Button>
        <Button
          variant="contained"
          onClick={handleSaveConfig}
          disabled={
            isSaving ||
            !localConfig.jira_base_url ||
            !localConfig.workspace_id ||
            !localConfig.email ||
            (!localConfig.api_token && !localConfig.has_api_token)
          }
          sx={{
            "backgroundColor": "#13715B",
            "textTransform": "none",
            "fontSize": "13px",
            "fontWeight": 500,
            "&:hover": { backgroundColor: "#0F5A47" },
            "&:disabled": { backgroundColor: "#d0d5dd" },
          }}
        >
          {isSaving ? (
            <>
              <CircularProgress size={16} sx={{ mr: 1, color: "white" }} />
              Saving...
            </>
          ) : (
            "Save Configuration"
          )}
        </Button>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Step 2: Schema & Object Type Selection */}
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2, color: "#344054" }}>
        Step 2: Select Schema & Object Type
      </Typography>

      <Stack spacing={2.5}>
        <Box>
          <VWSelect
            id="selected_schema_id"
            label="Schema"
            placeholder={isLoadingSchemas ? "Loading schemas..." : "Select a schema"}
            value={localConfig.selected_schema_id || ""}
            onChange={(e) => handleSchemaChange(e.target.value as string)}
            disabled={isLoadingSchemas || schemas.length === 0}
            items={schemas.map((schema) => ({
              _id: schema.id,
              name: `${schema.name} (${schema.objectSchemaKey})`,
            }))}
          />
        </Box>

        <Box>
          <VWSelect
            id="selected_object_type_id"
            label="Object Type (AI Systems)"
            placeholder={isLoadingObjectTypes ? "Loading object types..." : "Select an object type"}
            value={localConfig.selected_object_type_id || ""}
            onChange={(e) => handleObjectTypeChange(String(e.target.value))}
            disabled={
              isLoadingObjectTypes || objectTypes.length === 0 || !localConfig.selected_schema_id
            }
            items={objectTypes.map((ot) => ({
              _id: ot.id,
              name:
                ot.objectCount !== undefined ? `${ot.name} (${ot.objectCount} objects)` : ot.name,
            }))}
          />
        </Box>
      </Stack>

      <Divider sx={{ my: 3 }} />

      {/* Step 3: Sync Settings */}
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2, color: "#344054" }}>
        Step 3: Sync Settings
      </Typography>

      <Stack spacing={2.5}>
        <Box>
          <VWToggle
            checked={localConfig.sync_enabled || false}
            onChange={(e) => handleChange("sync_enabled", e.target.checked)}
            label="Enable automatic sync"
            description="Automatically sync data from JIRA on a schedule"
          />
        </Box>

        {localConfig.sync_enabled && (
          <Box>
            <VWSelect
              id="sync_interval_hours"
              label="Sync Interval"
              value={localConfig.sync_interval_hours || 24}
              onChange={(e) => handleChange("sync_interval_hours", e.target.value)}
              items={syncIntervalOptions.map((option) => ({
                _id: option.value,
                name: option.label,
              }))}
            />
          </Box>
        )}
      </Stack>

      {/* Last Sync Info */}
      {localConfig.last_sync_at && (
        <Box sx={{ mt: 2 }}>
          <Alert
            severity={localConfig.last_sync_status === "success" ? "success" : "warning"}
            sx={{ fontSize: "13px" }}
          >
            Last sync: {new Date(localConfig.last_sync_at).toLocaleString()} -{" "}
            {localConfig.last_sync_status === "success"
              ? "Successful"
              : localConfig.last_sync_message}
          </Alert>
        </Box>
      )}

      {/* Import Section - Only show if config is saved and object type is selected */}
      {localConfig.has_api_token && localConfig.selected_object_type_id && (
        <>
          <Divider sx={{ my: 3 }} />

          {/* Import & Sync */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ color: "#344054" }}>
                Import & Sync
              </Typography>
              <Typography variant="body2" fontSize={12} color="text.secondary">
                {importedUseCases.length} use cases imported
                {localConfig.last_sync_at &&
                  ` • Last sync: ${new Date(localConfig.last_sync_at).toLocaleString()}`}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={isSyncing ? <CircularProgress size={14} /> : <RefreshCw size={14} />}
                onClick={handleSyncNow}
                disabled={isSyncing || importedUseCases.length === 0}
                sx={{
                  "borderColor": "#13715B",
                  "color": "#13715B",
                  "textTransform": "none",
                  "fontSize": "13px",
                  "&:hover": { borderColor: "#0F5A47", backgroundColor: "rgba(19, 113, 91, 0.04)" },
                  "&:disabled": { borderColor: "#d0d5dd", color: "#98a2b3" },
                }}
              >
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
              <Button
                variant="contained"
                startIcon={
                  isImporting ? (
                    <CircularProgress size={14} sx={{ color: "white" }} />
                  ) : (
                    <Download size={14} />
                  )
                }
                onClick={loadJiraObjects}
                disabled={isImporting || isLoadingObjects}
                sx={{
                  "backgroundColor": "#13715B",
                  "textTransform": "none",
                  "fontSize": "13px",
                  "&:hover": { backgroundColor: "#0F5A47" },
                  "&:disabled": { backgroundColor: "#d0d5dd" },
                }}
              >
                {isLoadingObjects ? "Loading..." : "Import"}
              </Button>
            </Box>
          </Box>

          {/* Import/Sync Messages */}
          {importMessage && (
            <Alert
              severity={importMessage.type}
              sx={{ mt: 2, fontSize: "13px" }}
              onClose={() => setImportMessage(null)}
            >
              {importMessage.text}
            </Alert>
          )}
          {syncMessage && (
            <Alert
              severity={syncMessage.type}
              sx={{ mt: 2, fontSize: "13px" }}
              onClose={() => setSyncMessage(null)}
            >
              {syncMessage.text}
            </Alert>
          )}

          {/* JIRA Objects Selection Modal/Table - show when objects are loaded */}
          {jiraObjects.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={
                        selectedObjects.size === jiraObjects.length && jiraObjects.length > 0
                      }
                      indeterminate={
                        selectedObjects.size > 0 && selectedObjects.size < jiraObjects.length
                      }
                      onChange={toggleSelectAll}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" fontSize={13}>
                      Select All ({jiraObjects.length} available)
                    </Typography>
                  }
                />
                <Button
                  variant="contained"
                  onClick={handleImport}
                  disabled={isImporting || selectedObjects.size === 0}
                  startIcon={
                    isImporting ? (
                      <CircularProgress size={14} sx={{ color: "white" }} />
                    ) : (
                      <Download size={14} />
                    )
                  }
                  sx={{
                    "backgroundColor": "#13715B",
                    "textTransform": "none",
                    "fontSize": "13px",
                    "&:hover": { backgroundColor: "#0F5A47" },
                  }}
                >
                  {isImporting ? "Importing..." : `Import ${selectedObjects.size} Selected`}
                </Button>
              </Box>

              <TableContainer
                component={Paper}
                sx={{ maxHeight: 250, boxShadow: "none", border: "1px solid #e4e7ec" }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#f9fafb" }}>
                      <TableCell padding="checkbox" />
                      <TableCell sx={{ fontWeight: 600, fontSize: "12px" }}>Key</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: "12px" }}>Name</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {jiraObjects.map((obj) => (
                      <TableRow
                        key={obj.id}
                        hover
                        selected={selectedObjects.has(obj.id)}
                        onClick={() => toggleObjectSelection(obj.id)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox checked={selectedObjects.has(obj.id)} size="small" />
                        </TableCell>
                        <TableCell sx={{ fontSize: "13px", fontFamily: "monospace" }}>
                          {obj.key}
                        </TableCell>
                        <TableCell sx={{ fontSize: "13px" }}>{obj.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* Imported Use Cases Table */}
          {importedUseCases.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: "#344054" }}>
                Imported Use Cases
              </Typography>
              <TableContainer
                component={Paper}
                sx={{ maxHeight: 300, boxShadow: "none", border: "1px solid #e4e7ec" }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{ fontWeight: 600, fontSize: "12px", backgroundColor: "#f9fafb" }}
                      >
                        UC-ID
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 600, fontSize: "12px", backgroundColor: "#f9fafb" }}
                      >
                        Name
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 600, fontSize: "12px", backgroundColor: "#f9fafb" }}
                      >
                        JIRA Key
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 600, fontSize: "12px", backgroundColor: "#f9fafb" }}
                      >
                        Status
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importedUseCases.map((uc) => {
                      const data = typeof uc.data === "string" ? JSON.parse(uc.data) : uc.data;
                      const objectKey = data?.objectKey || "-";
                      return (
                        <TableRow key={uc.id} hover>
                          <TableCell sx={{ fontSize: "13px", fontFamily: "monospace" }}>
                            {uc.uc_id}
                          </TableCell>
                          <TableCell sx={{ fontSize: "13px" }}>
                            {uc.name || data?.label || "-"}
                          </TableCell>
                          <TableCell sx={{ fontSize: "13px", fontFamily: "monospace" }}>
                            {objectKey}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={uc.sync_status}
                              size="small"
                              color={
                                uc.sync_status === "synced"
                                  ? "success"
                                  : uc.sync_status === "updated"
                                    ? "info"
                                    : "default"
                              }
                              sx={{ fontSize: "11px" }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default JiraAssetsConfiguration;
