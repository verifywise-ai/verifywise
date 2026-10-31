import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  useTheme,
} from "@mui/material";
import { Download } from "lucide-react";
import { VWField, VWSelect } from "../../../components/VWComponents";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import StandardModal from "../../../components/Modals/StandardModal";
import { useAuth } from "../../../../application/hooks/useAuth";
import { getApiErrorReason } from "../../../../application/utils/apiErrorReason";
import { CustomizableButton } from "../../../components/button/customizable-button";
import ExtensionSyncPanel from "../../../components/ExtensionSyncPanel";
import {
  useExtensionSyncStatus,
  type ScheduleState,
} from "../../../../application/hooks/useExtensionSync";
import type { ExtensionRun } from "../../../../application/repository/extensionSync.repository";
import {
  BatchProgress,
  deselectDone,
  finishImport,
  importInBatches,
  keepShown,
  appendPage,
  createRequestGate,
  loadPages,
  PickerPage,
  runPickerRequest,
  PanelMessage,
  removeInBatches,
  summaryMessage,
} from "./batching";

/** A panel message: the text, then each count with its own label (each translatable). */
function MessageBody({ message }: { message: PanelMessage }) {
  return (
    <>
      <span>{message.text}</span>
      {message.counts?.map((count) => (
        <React.Fragment key={count.label}>
          {" "}
          <span>{count.label}</span> <span>{count.value}</span>
        </React.Fragment>
      ))}
    </>
  );
}

/** "Importing objects 101–200 / 250" while a batched run is going. */
function BatchProgressLine({ label, progress }: { label: string; progress: BatchProgress }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
      <span>{label}</span>{" "}
      <span>
        {progress.from}–{progress.to} / {progress.total}
      </span>
    </Typography>
  );
}

const SELECTION_SAVE_FAILED = "Could not save the schema and object type. Try again.";
const IMPORT_PROGRESS_LABEL = "Importing objects";
const REMOVE_PROGRESS_LABEL = "Removing use cases";
/** Desktop control height for the panel's action buttons. */
const CONTROL_HEIGHT_SX = { height: 30, minHeight: 30 };
/** The "Sync now" success line, as the page showed it before the shared panel. */
function describeJiraSync(run: ExtensionRun): string {
  return `Sync completed: ${run.counts.created ?? 0} created, ${run.counts.updated ?? 0} updated`;
}
const MISSING_EXPLAINER =
  "Jira no longer returns these objects. Syncs keep their use cases; remove them here if they should go.";

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
  /** Set by a sync that did not find the object in Jira; cleared when it reappears. */
  missing_in_jira_since?: string | null;
}

export const JiraAssetsConfiguration: React.FC = () => {
  const theme = useTheme();
  const formatDate = useFormattedDate();
  // The settings page already redirects non-Admins; this keeps the sync
  // controls read-only if the panel is ever shown to anyone else.
  const { userRoleName } = useAuth();
  const canManageSync = userRoleName === "Admin";
  // The "Last sync" date in the Import & Sync header comes from the sync engine.
  const syncStatus = useExtensionSyncStatus("jira-assets");
  const lastSyncAt = syncStatus.data?.last_finished_run?.completed_at ?? null;
  // Before the connection is saved, the panel's schedule is a draft sent with it.
  const scheduleDraft = useRef({ sync_enabled: false, sync_interval_hours: 24 });
  const handleScheduleDraft = useCallback((schedule: ScheduleState) => {
    scheduleDraft.current = {
      sync_enabled: schedule.enabled,
      sync_interval_hours: schedule.interval_hours,
    };
  }, []);
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
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  // A failed load leaves has_api_token false, which would turn schedule changes
  // into an unsaved draft; the schedule stays locked instead.
  const [configLoadFailed, setConfigLoadFailed] = useState(false);

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
  const [storedSelection, setSelectedObjects] = useState<Set<string>>(new Set());
  // The effective selection is derived at render: only ids the picker shows.
  // A selected id is never invisible, not even for one frame.
  const selectedObjects = useMemo(
    () => keepShown(storedSelection, jiraObjects),
    [storedSelection, jiraObjects],
  );
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);
  // The picker loads one page at a time; "Load more" asks for the next.
  const [jiraHasMore, setJiraHasMore] = useState(false);
  const [jiraNextStartAt, setJiraNextStartAt] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<PanelMessage | null>(null);
  const [importProgress, setImportProgress] = useState<BatchProgress | null>(null);

  // Imported use cases state
  const [importedUseCases, setImportedUseCases] = useState<ImportedUseCase[]>([]);
  // Jira object ids already imported, set where the list is fetched
  // (loadImportedUseCases) and read when a picker page arrives (not when it
  // was requested), so a "Load more" that lands after an import never brings
  // the just-imported objects back.
  const importedIdsRef = useRef<Set<string>>(new Set());
  // Generations of picker requests: stale responses are dropped.
  const pickerGate = useRef(createRequestGate());
  // How many pages the picker has loaded since the last reset; a refresh
  // reloads that many.
  const loadedPagesRef = useRef(0);
  const [, setIsLoadingUseCases] = useState(false);

  // Unmount flag so a schema / object-type save that settles late does not
  // update the page after it has gone.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Schema / object-type saves: same ordering, latest response wins.
  const selectionQueue = useRef<Promise<void>>(Promise.resolve());
  const selectionSeq = useRef(0);
  const [syncMessage, setSyncMessage] = useState<PanelMessage | null>(null);
  const [removeProgress, setRemoveProgress] = useState<BatchProgress | null>(null);

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
        setConfigLoadFailed(false);
      } catch (error) {
        console.error("Failed to load JIRA config:", error);
        setConfigLoadFailed(true);
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

  // Clear the import picker (list, paging, selection): its contents belong to
  // one object type and one fetch.
  const resetPicker = useCallback(() => {
    // Any picker request still in flight belongs to the old picker; its
    // loading state goes with it.
    pickerGate.current.bump();
    loadedPagesRef.current = 0;
    setIsLoadingObjects(false);
    setJiraObjects([]);
    setJiraHasMore(false);
    setJiraNextStartAt(0);
    setSelectedObjects(new Set());
  }, []);

  // Load JIRA objects for import, one page at a time (`append` = "Load more").
  const loadJiraObjects = useCallback(
    async (append = false) => {
      if (!localConfig.selected_object_type_id) return;

      const objectTypeId = localConfig.selected_object_type_id;
      const fetchPage = async (startAt: number): Promise<PickerPage<JiraObject>> => {
        const response = await pluginApiCall(
          "GET",
          `/object-types/${objectTypeId}/objects?startAt=${startAt}`,
        );
        const list: JiraObject[] = Array.isArray(response)
          ? response
          : Array.isArray(response?.objects)
            ? response.objects
            : [];
        return {
          objects: list,
          hasMore: !!response?.hasMore,
          nextStartAt: Number(response?.nextStartAt) || 0,
        };
      };
      setImportMessage(null);
      await runPickerRequest({
        gate: pickerGate.current,
        append,
        setLoading: setIsLoadingObjects,
        // "Load more" fetches the next page. A fresh load (refresh) reloads as
        // many pages as were loaded before, so ticks on objects from "Load
        // more" pages are kept as long as the objects are still there.
        fetch: async () =>
          append
            ? { ...(await fetchPage(jiraNextStartAt)), pages: 1 }
            : loadPages(fetchPage, loadedPagesRef.current),
        onResult: (page) => {
          // Leave out objects already imported, as known when the page lands.
          if (append) {
            setJiraObjects((prev) => appendPage(prev, page.objects, importedIdsRef.current));
            loadedPagesRef.current += 1;
          } else {
            // The list is replaced by the same pages, reloaded: prune the
            // stored selection to it in the same step, so a tick on an object
            // that is gone does not come back later.
            const next = appendPage([], page.objects, importedIdsRef.current);
            setJiraObjects(next);
            setSelectedObjects((prev) => keepShown(prev, next));
            loadedPagesRef.current = page.pages;
          }
          setJiraHasMore(page.hasMore);
          setJiraNextStartAt(page.nextStartAt);
        },
        onError: (error: any) => {
          // A failed fresh load must not leave the previous list on screen.
          if (!append) resetPicker();
          setImportMessage({
            type: "error",
            text: getApiErrorReason(error) || error?.message || "Failed to load JIRA objects",
          });
        },
      });
    },
    [pluginApiCall, localConfig.selected_object_type_id, jiraNextStartAt, resetPicker],
  );

  // Load imported use cases
  /** Reload the imported use cases; returns the fresh list, or null if it could not be read. */
  const loadImportedUseCases = useCallback(async (): Promise<ImportedUseCase[] | null> => {
    setIsLoadingUseCases(true);
    try {
      const response = await pluginApiCall("GET", "/use-cases");
      if (response && Array.isArray(response)) {
        importedIdsRef.current = new Set(response.map((uc) => String(uc.jira_object_id)));
        setImportedUseCases(response);
        return response;
      }
      return null;
    } catch (error) {
      console.error("Failed to load imported use cases:", error);
      return null;
    } finally {
      setIsLoadingUseCases(false);
    }
  }, [pluginApiCall]);

  // Import the selected objects, 100 per request (the server limit), one
  // request at a time; the first error stops the rest.
  const handleImport = async () => {
    if (selectedObjects.size === 0) return;

    setIsImporting(true);
    setImportMessage(null);
    try {
      const summary = await importInBatches(
        Array.from(selectedObjects),
        (batch) => pluginApiCall("POST", "/import", { object_ids: batch }),
        setImportProgress,
      );
      // Reload the imported use cases, then apply finishImport's updaters with
      // that fresh list (not the one this handler started with) to the latest
      // state: imported objects leave the picker (pages already loaded, or
      // loaded meanwhile, are kept) and handled ids leave the selection; the
      // selection derived at render then drops any id the picker no longer
      // shows. The outcome is set last and nothing after it clears it.
      const fresh = await loadImportedUseCases();
      const importedIds = fresh ? new Set(fresh.map((uc) => String(uc.jira_object_id))) : null;
      const next = finishImport<JiraObject>(summary, importedIds);
      setJiraObjects(next.objects);
      setSelectedObjects(next.selected);
      setImportMessage(next.message);
    } finally {
      setImportProgress(null);
      setIsImporting(false);
    }
  };

  // Use cases a sync flagged as missing in Jira. Syncs never delete; an
  // Admin removes them here, after confirming.
  const missingUseCases = importedUseCases.filter((uc) => !!uc.missing_in_jira_since);
  const [isRemoveMissingOpen, setIsRemoveMissingOpen] = useState(false);
  const [isRemovingMissing, setIsRemovingMissing] = useState(false);
  // Nothing is selected by default; the Admin ticks what should go.
  const [selectedMissingIds, setSelectedMissingIds] = useState<Set<number>>(new Set());
  const selectedMissing = missingUseCases.filter((uc) => selectedMissingIds.has(uc.id));
  const projectOfMissing = new Map(missingUseCases.map((uc) => [uc.id, uc.project_id]));

  // Drop selections for use cases that are no longer in the missing list
  // (removed, or found in Jira again by a sync).
  useEffect(() => {
    setSelectedMissingIds((prev) => {
      const stillMissing = new Set(
        importedUseCases.filter((uc) => !!uc.missing_in_jira_since).map((uc) => uc.id),
      );
      const next = new Set([...prev].filter((id) => stillMissing.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [importedUseCases]);

  const toggleMissingSelection = (id: number) => {
    setSelectedMissingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllMissing = () => {
    setSelectedMissingIds((prev) =>
      prev.size === missingUseCases.length
        ? new Set()
        : new Set(missingUseCases.map((uc) => uc.id)),
    );
  };

  // Remove the selected use cases, 100 per request (the server limit), one
  // request at a time; the first error stops the rest. The list refreshes at
  // the end. The server removes only those still flagged.
  const handleRemoveMissing = async () => {
    setIsRemovingMissing(true);
    setSyncMessage(null);
    setIsRemoveMissingOpen(false);
    try {
      const summary = await removeInBatches(
        selectedMissing.map((uc) => uc.id),
        (batch) => pluginApiCall("POST", "/use-cases/remove-missing", { use_case_ids: batch }),
        setRemoveProgress,
        // All links of one use case go in the same request.
        (id) => projectOfMissing.get(id),
      );
      setSelectedMissingIds((prev) => deselectDone(prev, summary.doneIds));
      await loadImportedUseCases();
      setSyncMessage(summaryMessage(summary));
    } finally {
      setRemoveProgress(null);
      setIsRemovingMissing(false);
    }
  };

  // Toggle object selection
  const toggleObjectSelection = (objectId: string) => {
    setSelectedObjects((prev) => {
      // Toggle on the pruned set: nothing hidden rides along.
      const next = new Set(keepShown(prev, jiraObjects));
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
        // Before the first save the schedule has no connection to attach to,
        // so the panel's draft travels with the connection, as it always did.
        ...(localConfig.has_api_token ? {} : scheduleDraft.current),
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

  // Persist the schema / object-type pick at once (PATCH /config/selection,
  // only those two fields), so users don't have to click Save Configuration
  // to keep their picks. Saves run in order; only the newest one's failure is
  // shown.
  const persistSelection = (patch: {
    selected_schema_id?: string | null;
    selected_object_type_id?: string | null;
  }) => {
    if (!localConfig.has_api_token) return;
    const seq = ++selectionSeq.current;
    selectionQueue.current = selectionQueue.current.then(async () => {
      try {
        await pluginApiCall("PATCH", "/config/selection", patch);
      } catch (error) {
        console.warn("[JiraConfig] selection save failed:", error);
        if (seq === selectionSeq.current && mountedRef.current) {
          setSaveMessage({ type: "error", text: SELECTION_SAVE_FAILED });
        }
      }
    });
  };

  const handleSchemaChange = (schemaId: string) => {
    resetPicker();
    handleChange("selected_schema_id", schemaId);
    handleChange("selected_object_type_id", "");
    setObjectTypes([]);
    if (schemaId) {
      loadObjectTypes(schemaId);
      persistSelection({ selected_schema_id: schemaId, selected_object_type_id: null });
    }
  };

  const handleObjectTypeChange = (objectTypeId: string) => {
    resetPicker();
    handleChange("selected_object_type_id", objectTypeId);
    if (objectTypeId) {
      persistSelection({ selected_object_type_id: objectTypeId });
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

      {configLoadFailed && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error" sx={{ fontSize: "13px" }}>
            Could not load the saved Jira connection. Reload the page to change the sync settings.
          </Alert>
        </Box>
      )}

      <ExtensionSyncPanel
        extensionKey="jira-assets"
        // Until GET /config answers, a schedule change could be kept as a draft by mistake.
        canManage={canManageSync && configLoaded && !configLoadFailed}
        scheduleDescription="Automatically sync data from JIRA on a schedule"
        scheduleHelp="Automatic sync refreshes use cases you have imported. It does not import new objects or remove any."
        persistSchedule={!!localConfig.has_api_token}
        onScheduleChange={handleScheduleDraft}
        showSyncNow={!!(localConfig.has_api_token && localConfig.selected_object_type_id)}
        syncNowDisabled={importedUseCases.length === 0}
        describeCompletedRun={describeJiraSync}
        onRunCompleted={() => {
          void loadImportedUseCases();
        }}
      />

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
                {lastSyncAt &&
                  ` • Last sync: ${formatDate(new Date(lastSyncAt), { includeTime: true })}`}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                startIcon={
                  isImporting ? (
                    <CircularProgress size={14} sx={{ color: "white" }} />
                  ) : (
                    <Download size={14} />
                  )
                }
                onClick={() => loadJiraObjects()}
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
              <MessageBody message={importMessage} />
            </Alert>
          )}
          {syncMessage && (
            <Alert
              severity={syncMessage.type}
              sx={{ mt: 2, fontSize: "13px" }}
              onClose={() => setSyncMessage(null)}
            >
              <MessageBody message={syncMessage} />
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
                <CustomizableButton
                  variant="contained"
                  onClick={handleImport}
                  isDisabled={isImporting || selectedObjects.size === 0}
                  loading={isImporting}
                  startIcon={<Download size={14} />}
                  testId="jira-import-selected"
                  sx={CONTROL_HEIGHT_SX}
                >
                  {isImporting ? "Importing..." : `Import ${selectedObjects.size} selected`}
                </CustomizableButton>
              </Box>

              {importProgress && (
                <BatchProgressLine label={IMPORT_PROGRESS_LABEL} progress={importProgress} />
              )}

              <TableContainer
                component={Paper}
                sx={{
                  maxHeight: 250,
                  boxShadow: "none",
                  border: `1px solid ${theme.palette.border.dark}`,
                }}
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

          {/* The picker shows one page; say so and offer the next. */}
          {jiraHasMore && (
            <Box
              sx={{
                mt: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                More objects exist in Jira than are shown here.
              </Typography>
              <CustomizableButton
                variant="text"
                text="Load more"
                onClick={() => loadJiraObjects(true)}
                isDisabled={isLoadingObjects}
                testId="jira-objects-load-more"
                sx={CONTROL_HEIGHT_SX}
              />
            </Box>
          )}

          {/* Use cases flagged as missing in Jira: listed, removed only on request */}
          {missingUseCases.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2" fontWeight={600} sx={{ color: "#344054" }}>
                  <span>Missing in Jira</span> <span>({missingUseCases.length})</span>
                </Typography>
                <CustomizableButton
                  variant="outlined"
                  color="error"
                  onClick={() => setIsRemoveMissingOpen(true)}
                  isDisabled={!canManageSync || isRemovingMissing || selectedMissing.length === 0}
                  testId="jira-remove-missing"
                  sx={{
                    ...CONTROL_HEIGHT_SX,
                    "borderColor": theme.palette.status.error.text,
                    "color": theme.palette.status.error.text,
                    "&:hover": {
                      borderColor: theme.palette.status.error.text,
                      backgroundColor: theme.palette.status.error.bg,
                    },
                    "&.Mui-disabled": {
                      borderColor: theme.palette.border.dark,
                      color: theme.palette.text.disabled,
                    },
                  }}
                >
                  <span>Remove selected use cases</span>&nbsp;
                  <span>({selectedMissing.length})</span>
                </CustomizableButton>
              </Box>
              <Typography
                variant="body2"
                fontSize={12}
                color="text.secondary"
                sx={{ mb: 1.5, display: "block" }}
              >
                {MISSING_EXPLAINER}
              </Typography>
              {removeProgress && (
                <BatchProgressLine label={REMOVE_PROGRESS_LABEL} progress={removeProgress} />
              )}
              <TableContainer
                component={Paper}
                sx={{
                  maxHeight: 250,
                  boxShadow: "none",
                  border: `1px solid ${theme.palette.border.dark}`,
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" sx={{ backgroundColor: "#f9fafb" }}>
                        <Checkbox
                          size="small"
                          checked={
                            missingUseCases.length > 0 &&
                            selectedMissing.length === missingUseCases.length
                          }
                          indeterminate={
                            selectedMissing.length > 0 &&
                            selectedMissing.length < missingUseCases.length
                          }
                          onChange={toggleAllMissing}
                          disabled={!canManageSync}
                          inputProps={{ "aria-label": "Select all missing use cases" }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 600, fontSize: "12px", backgroundColor: "#f9fafb" }}
                      >
                        Key
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 600, fontSize: "12px", backgroundColor: "#f9fafb" }}
                      >
                        Name
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: 600, fontSize: "12px", backgroundColor: "#f9fafb" }}
                      >
                        Missing since
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {missingUseCases.map((uc) => {
                      const data = typeof uc.data === "string" ? JSON.parse(uc.data) : uc.data;
                      return (
                        <TableRow key={uc.id} selected={selectedMissingIds.has(uc.id)}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={selectedMissingIds.has(uc.id)}
                              onChange={() => toggleMissingSelection(uc.id)}
                              disabled={!canManageSync}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: "13px", fontFamily: "monospace" }}>
                            {data?.objectKey || "-"}
                          </TableCell>
                          <TableCell sx={{ fontSize: "13px" }}>
                            {uc.name || data?.label || "-"}
                          </TableCell>
                          <TableCell sx={{ fontSize: "13px" }}>
                            {formatDate(new Date(uc.missing_in_jira_since as string))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          <StandardModal
            isOpen={isRemoveMissingOpen}
            onClose={() => setIsRemoveMissingOpen(false)}
            title="Remove selected use cases"
            description="These use cases and all their data in VerifyWise will be permanently deleted. This cannot be undone."
            onSubmit={handleRemoveMissing}
            submitButtonText="Remove"
            submitButtonColor={theme.palette.status.error.text}
            isSubmitting={isRemovingMissing}
            fitContent
          >
            <Stack spacing={1}>
              <Typography variant="body2" fontSize={13} fontWeight={600}>
                <span>Use cases to remove:</span> <span>{selectedMissing.length}</span>
              </Typography>
              {selectedMissing.map((uc) => {
                const data = typeof uc.data === "string" ? JSON.parse(uc.data) : uc.data;
                return (
                  <Typography key={uc.id} variant="body2" fontSize={13}>
                    {data?.objectKey ? `${data.objectKey} · ` : ""}
                    {uc.name || data?.label || "-"}
                  </Typography>
                );
              })}
            </Stack>
          </StandardModal>

          {/* Imported Use Cases Table */}
          {importedUseCases.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: "#344054" }}>
                Imported Use Cases
              </Typography>
              <TableContainer
                component={Paper}
                sx={{
                  maxHeight: 300,
                  boxShadow: "none",
                  border: `1px solid ${theme.palette.border.dark}`,
                }}
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
