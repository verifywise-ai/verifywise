import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Drawer,
  Divider,
  CircularProgress,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  useTheme,
  IconButton,
  Menu,
} from "@mui/material";
import {
  Upload,
  Download,
  X,
  Edit3,
  Trash2,
  ArrowLeft,
  Save as SaveIcon,
  Copy,
  Plus,
  User,
  Bot,
  Check,
  Eye,
} from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import TabContext from "@mui/lab/TabContext";
import TabBar from "../../components/TabBar";
import {
  listMyDatasets,
  listDatasets,
  readDataset,
  uploadDataset,
  deleteDatasets,
  type DatasetPromptRecord,
  type ListedDataset,
  type DatasetType,
} from "../../../application/repository/deepEval.repository";
import {
  isSingleTurnPrompt,
  isMultiTurnConversation,
  type SingleTurnPrompt,
  type MultiTurnConversation,
} from "../../../application/repository/deepEval.repository";
import Alert from "../../components/Alert";
import Chip from "../../components/Chip";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import Field from "../../components/Inputs/Field";
import SearchBox from "../../components/Search/SearchBox";
import { FilterBy, type FilterColumn } from "../../components/Table/FilterBy";
import { GroupBy } from "../../components/Table/GroupBy";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import DatasetsTable, { type DatasetRow } from "../../components/Table/DatasetsTable";
import TemplatesTable from "../../components/Table/TemplatesTable";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import TipBox from "../../components/TipBox";
import { useAuth } from "../../../application/hooks/useAuth";
import UploadDatasetModal from "./ProjectDatasets/UploadDatasetModal";
import CreateDatasetModals from "./ProjectDatasets/CreateDatasetModals";
import DatasetPreviewDrawer from "./ProjectDatasets/DatasetPreviewDrawer";
import TemplatePreviewDrawer from "./ProjectDatasets/TemplatePreviewDrawer";
import type { ExampleTurnType, ExampleUseCase } from "./ProjectDatasets/exampleDatasetPayloads";
import allowedRoles from "../../../application/constants/permissions";

type ProjectDatasetsProps = { projectId: string; orgId?: string | null };

type BuiltInDataset = ListedDataset & {
  promptCount?: number;
  isUserDataset?: boolean;
  createdAt?: string;
  datasetType?: DatasetType;
  turnType?: "single-turn" | "multi-turn" | "simulated";
  // Additional metadata for templates
  test_count?: number;
  categories?: string[];
  category_count?: number;
  difficulty?: { easy: number; medium: number; hard: number };
  description?: string;
  tags?: string[];
};

export function ProjectDatasets({ projectId, orgId }: ProjectDatasetsProps) {
  void projectId; // Used for future project-scoped features
  const theme = useTheme();

  // RBAC permissions
  const { userRoleName, isSuperAdmin } = useAuth();
  const canUploadDataset = allowedRoles.evals.uploadDataset.includes(userRoleName) && !isSuperAdmin;
  const canDeleteDataset = allowedRoles.evals.deleteDataset.includes(userRoleName) && !isSuperAdmin;

  // Tab state: "my" for user datasets, "templates" for built-in datasets
  const [activeTab, setActiveTab] = useState<"my" | "templates">("my");

  // My datasets state
  const [datasets, setDatasets] = useState<BuiltInDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTemplatesList, setLoadingTemplatesList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const {
    groupBy: datasetsGroupBy,
    groupSortOrder: datasetsGroupSortOrder,
    handleGroupChange: handleDatasetsGroupChange,
  } = useGroupByState();
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<BuiltInDataset | null>(null);
  const [datasetPrompts, setDatasetPrompts] = useState<DatasetPromptRecord[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);

  // Template datasets state
  const [templateGroups, setTemplateGroups] = useState<
    Record<"chatbot" | "rag" | "agent", BuiltInDataset[]>
  >({
    chatbot: [],
    rag: [],
    agent: [],
  });
  const [selectedTemplate, setSelectedTemplate] = useState<BuiltInDataset | null>(null);
  const [templatePrompts, setTemplatePrompts] = useState<DatasetPromptRecord[]>([]);
  const [loadingTemplatePrompts, setLoadingTemplatePrompts] = useState(false);
  const [copyingTemplate, setCopyingTemplate] = useState(false);

  // Template table state (search) - sorting and pagination handled by TemplatesTable component
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");

  // Copy template confirmation modal state
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [templateToCopy, setTemplateToCopy] = useState<BuiltInDataset | null>(null);

  // Template drawer state
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);

  // Action menu state
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);
  const [actionDataset, setActionDataset] = useState<BuiltInDataset | null>(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<BuiltInDataset | null>(null);

  // Inline editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<BuiltInDataset | null>(null);
  const [editablePrompts, setEditablePrompts] = useState<DatasetPromptRecord[]>([]);
  const [editDatasetName, setEditDatasetName] = useState("");
  const [savingDataset, setSavingDataset] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Prompt edit drawer state (for inline editor)
  const [promptDrawerOpen, setPromptDrawerOpen] = useState(false);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number | null>(null);

  // Create dataset modal state
  const [createDatasetModalOpen, setCreateDatasetModalOpen] = useState(false);
  const [createTypeSelectionOpen, setCreateTypeSelectionOpen] = useState(false);

  // Note: promptCount is now returned by the API - no need to load metadata individually

  // Load user's datasets (My datasets tab)
  const loadMyDatasets = useCallback(async () => {
    try {
      setLoading(true);
      const userRes = await listMyDatasets().catch(() => ({ datasets: [] }));
      const userDatasets = userRes.datasets || [];
      const allDatasets: BuiltInDataset[] = userDatasets.map((ud) => ({
        key: `user_${ud.id}`,
        name: ud.name,
        path: ud.path,
        use_case: (ud.datasetType || "chatbot") as "chatbot" | "rag" | "agent",
        datasetType: ud.datasetType || "chatbot",
        turnType: ud.turnType,
        isUserDataset: true,
        createdAt: ud.createdAt,
        promptCount: ud.promptCount || 0, // Use pre-computed count from API
      }));
      setDatasets(allDatasets);
    } catch (err) {
      console.error("Failed to load datasets", err);
      setDatasets([]);
      setAlert({
        variant: "error",
        body: "Failed to load datasets",
      });
      setTimeout(() => setAlert(null), 5000);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load built-in template datasets (Templates tab)
  const loadTemplateDatasets = useCallback(async () => {
    try {
      setLoadingTemplatesList(true);
      const res = await listDatasets();
      setTemplateGroups(res as Record<"chatbot" | "rag" | "agent", BuiltInDataset[]>);
    } catch (err) {
      console.error("Failed to load template datasets", err);
      setTemplateGroups({ chatbot: [], rag: [], agent: [] });
      setAlert({
        variant: "error",
        body: "Failed to load template datasets",
      });
      setTimeout(() => setAlert(null), 5000);
    } finally {
      setLoadingTemplatesList(false);
    }
  }, []);

  // Flatten templates from all categories into a single array with category field
  type TemplateWithCategory = BuiltInDataset & { category: "chatbot" | "rag" | "agent" };
  const flattenedTemplates: TemplateWithCategory[] = useMemo(() => {
    return (["chatbot", "rag", "agent"] as const).flatMap((category) =>
      (templateGroups[category] || []).map((ds) => ({ ...ds, category })),
    );
  }, [templateGroups]);

  // Template filter columns
  const templateFilterColumns: FilterColumn[] = useMemo(
    () => [
      { id: "name", label: "Dataset name", type: "text" },
      {
        id: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "chatbot", label: "Chatbot" },
          { value: "rag", label: "RAG" },
          { value: "agent", label: "Agent" },
        ],
      },
    ],
    [],
  );

  // Template field value getter for filtering
  const getTemplateFieldValue = useCallback(
    (item: TemplateWithCategory, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "name":
          return item.name;
        case "category":
          return item.category;
        default:
          return null;
      }
    },
    [],
  );

  // useFilterBy hook for templates
  const { filterData: filterTemplateData, handleFilterChange: handleTemplateFilterChange } =
    useFilterBy<TemplateWithCategory>(getTemplateFieldValue);

  // Filtered templates (sorting and pagination handled by TemplatesTable component)
  const filteredAndSortedTemplates = useMemo(() => {
    // Apply filter
    let result = filterTemplateData(flattenedTemplates);

    // Apply search
    if (templateSearchTerm.trim()) {
      const q = templateSearchTerm.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
      );
    }

    return result;
  }, [flattenedTemplates, filterTemplateData, templateSearchTerm]);

  // Open copy confirmation modal
  const handleOpenCopyModal = (template: BuiltInDataset) => {
    setTemplateToCopy(template);
    setCopyModalOpen(true);
  };

  // Confirm copy
  const handleConfirmCopy = async () => {
    if (!templateToCopy) return;
    setCopyModalOpen(false);
    await handleCopyTemplate(templateToCopy);
    setTemplateToCopy(null);
  };

  // Open template drawer
  const handleViewTemplate = (template: BuiltInDataset) => {
    setSelectedTemplate(template);
    setTemplateDrawerOpen(true);
  };

  // Close template drawer
  const handleCloseTemplateDrawer = () => {
    setTemplateDrawerOpen(false);
    setSelectedTemplate(null);
    setTemplatePrompts([]);
  };

  // Load both datasets on mount so tab counts are always available
  useEffect(() => {
    void loadMyDatasets();
    void loadTemplateDatasets();
  }, [loadMyDatasets, loadTemplateDatasets]);

  // Load template prompts when a template is selected
  useEffect(() => {
    if (!selectedTemplate?.path) {
      setTemplatePrompts([]);
      return;
    }
    (async () => {
      try {
        setLoadingTemplatePrompts(true);
        const res = await readDataset(selectedTemplate.path);
        setTemplatePrompts(res.prompts || []);
      } catch (err) {
        console.error("Failed to load template prompts", err);
        setTemplatePrompts([]);
      } finally {
        setLoadingTemplatePrompts(false);
      }
    })();
  }, [selectedTemplate]);

  // Copy template to user's datasets
  const handleCopyTemplate = async (template: BuiltInDataset) => {
    try {
      setCopyingTemplate(true);
      // Load the template content
      const res = await readDataset(template.path);
      const prompts = res.prompts || [];

      // Create a new file and upload it
      const json = JSON.stringify(prompts, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const fileName = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`;
      const file = new File([blob], fileName, { type: "application/json" });

      await uploadDataset(file, "chatbot", "single-turn", orgId || undefined);
      setAlert({ variant: "success", body: `"${template.name}" copied to your datasets` });
      setTimeout(() => setAlert(null), 3000);

      // Switch to My datasets tab and reload
      setActiveTab("my");
      void loadMyDatasets();
    } catch (err) {
      console.error("Failed to copy template", err);
      setAlert({ variant: "error", body: "Failed to copy template" });
      setTimeout(() => setAlert(null), 5000);
    } finally {
      setCopyingTemplate(false);
    }
  };

  const filterColumns: FilterColumn[] = useMemo(
    () => [{ id: "name", label: "Dataset name", type: "text" }],
    [],
  );

  const getFieldValue = useCallback(
    (d: BuiltInDataset, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "name":
          return d.name;
        case "use_case":
          return d.use_case;
        default:
          return "";
      }
    },
    [],
  );

  const { filterData, handleFilterChange } = useFilterBy<BuiltInDataset>(getFieldValue);

  const filteredDatasets = useMemo(() => {
    const afterFilter = filterData(datasets);
    if (!searchTerm.trim()) return afterFilter;
    const q = searchTerm.toLowerCase();
    return afterFilter.filter((d) =>
      [d.name, d.path, d.use_case].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [datasets, filterData, searchTerm]);

  // Datasets grouping
  const getDatasetGroupKey = useCallback((dataset: BuiltInDataset, field: string): string => {
    switch (field) {
      case "name":
        // Group by first letter
        return dataset.name?.charAt(0).toUpperCase() || "Other";
      case "prompts": {
        const count = dataset.promptCount ?? 0;
        if (count === 0) return "No prompts";
        if (count <= 10) return "1-10 prompts";
        if (count <= 50) return "11-50 prompts";
        if (count <= 100) return "51-100 prompts";
        return "100+ prompts";
      }
      case "createdAt": {
        if (!dataset.createdAt) return "Unknown";
        const date = new Date(dataset.createdAt);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays <= 7) return "This week";
        if (diffDays <= 30) return "This month";
        return "Older";
      }
      default:
        return "Other";
    }
  }, []);

  const groupedDatasets = useTableGrouping({
    data: filteredDatasets,
    groupByField: datasetsGroupBy,
    sortOrder: datasetsGroupSortOrder,
    getGroupKey: getDatasetGroupKey,
  });

  // Action menu handlers
  const handleActionMenuClose = () => {
    setActionAnchor(null);
    setActionDataset(null);
  };

  const handleViewPrompts = async (dataset: BuiltInDataset) => {
    handleActionMenuClose();
    setSelectedDataset(dataset);
    setDrawerOpen(true);
    try {
      setLoadingPrompts(true);
      const res = await readDataset(dataset.path);
      setDatasetPrompts(res.prompts || []);
    } catch (err) {
      console.error("Failed to load dataset prompts", err);
      setDatasetPrompts([]);
    } finally {
      setLoadingPrompts(false);
    }
  };

  const handleOpenInEditor = async (dataset: BuiltInDataset) => {
    handleActionMenuClose();
    try {
      setLoadingEditor(true);
      const res = await readDataset(dataset.path);
      setEditablePrompts(res.prompts || []);
      // Use the dataset name directly (already cleaned by backend)
      setEditDatasetName(dataset.name);
      setEditingDataset(dataset);
      setEditorOpen(true);
    } catch (err) {
      console.error("Failed to load dataset for editing", err);
      setAlert({ variant: "error", body: "Failed to load dataset for editing" });
      setTimeout(() => setAlert(null), 5000);
    } finally {
      setLoadingEditor(false);
    }
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setEditingDataset(null);
    setEditablePrompts([]);
    setEditDatasetName("");
  };

  const handleSaveDataset = async () => {
    try {
      setSavingDataset(true);
      const json = JSON.stringify(editablePrompts, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const slug = editDatasetName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const finalName = slug ? `${slug}.json` : "dataset.json";
      const file = new File([blob], finalName, { type: "application/json" });
      const datasetType = editingDataset?.datasetType || "chatbot";

      // If editing an existing user dataset, delete the old one first
      if (editingDataset?.isUserDataset && editingDataset?.path) {
        try {
          await deleteDatasets([editingDataset.path]);
        } catch (deleteErr) {
          console.warn("Could not delete old dataset, proceeding with save:", deleteErr);
        }
      }

      const turnType =
        editablePrompts.length > 0 && !isSingleTurnPrompt(editablePrompts[0])
          ? "multi-turn"
          : "single-turn";
      await uploadDataset(file, datasetType, turnType, orgId || undefined);
      setAlert({ variant: "success", body: `Dataset "${editDatasetName}" saved successfully!` });
      setTimeout(() => setAlert(null), 3000);
      handleCloseEditor();
      void loadMyDatasets();
    } catch (err) {
      console.error("Failed to save dataset", err);
      type AxiosLike = { response?: { data?: unknown } };
      const axiosErr = err as AxiosLike | Error;
      const resData = (axiosErr as AxiosLike)?.response?.data as
        | Record<string, unknown>
        | undefined;
      const serverMsg =
        (resData && (String(resData.message ?? "") || String(resData.detail ?? ""))) ||
        (axiosErr instanceof Error ? axiosErr.message : null);
      setAlert({ variant: "error", body: serverMsg || "Save failed. Check dataset structure." });
      setTimeout(() => setAlert(null), 6000);
    } finally {
      setSavingDataset(false);
    }
  };

  const isValidToSave = useMemo(() => {
    if (!editablePrompts || editablePrompts.length === 0 || !editDatasetName.trim()) return false;
    // Check if any record has valid content (single-turn prompt or multi-turn turns)
    return editablePrompts.some((p) => {
      if (isSingleTurnPrompt(p)) {
        return p.prompt.trim().length > 0;
      } else if (isMultiTurnConversation(p)) {
        return p.turns && p.turns.length > 0 && p.turns.some((t) => t.content.trim().length > 0);
      }
      return false;
    });
  }, [editablePrompts, editDatasetName]);

  const handleAddPrompt = () => {
    const newPrompt: DatasetPromptRecord = {
      id: `prompt_${Date.now()}`,
      category: "General",
      prompt: "",
      expected_output: "",
      expected_keywords: [],
      retrieval_context: [],
    };
    setEditablePrompts((prev) => [...prev, newPrompt]);
    // Open the drawer with the new prompt
    setSelectedPromptIndex(editablePrompts.length);
    setPromptDrawerOpen(true);
  };

  const handleDeletePrompt = (idx: number) => {
    setEditablePrompts((prev) => prev.filter((_, i) => i !== idx));
    if (selectedPromptIndex === idx) {
      setPromptDrawerOpen(false);
      setSelectedPromptIndex(null);
    } else if (selectedPromptIndex !== null && selectedPromptIndex > idx) {
      setSelectedPromptIndex(selectedPromptIndex - 1);
    }
  };

  const handleRemoveDataset = (dataset: BuiltInDataset) => {
    handleActionMenuClose();
    setDatasetToDelete(dataset);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!datasetToDelete) return;
    try {
      await deleteDatasets([datasetToDelete.path]);
      setAlert({ variant: "success", body: "Dataset removed" });
      setTimeout(() => setAlert(null), 3000);
      void loadMyDatasets();
    } catch (err) {
      console.error("Failed to remove dataset", err);
      setAlert({ variant: "error", body: "Failed to remove dataset" });
      setTimeout(() => setAlert(null), 5000);
    } finally {
      setDeleteModalOpen(false);
      setDatasetToDelete(null);
    }
  };

  const handleRowClick = async (dataset: BuiltInDataset) => {
    // Navigate directly to editor when clicking on a row
    await handleOpenInEditor(dataset);
  };

  const handleDownloadDataset = async (dataset: BuiltInDataset) => {
    handleActionMenuClose();
    try {
      const res = await readDataset(dataset.path);
      const json = JSON.stringify(res.prompts || [], null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug =
        dataset.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "dataset";
      a.download = `${slug}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download dataset", err);
      setAlert({ variant: "error", body: "Failed to download dataset" });
      setTimeout(() => setAlert(null), 5000);
    }
  };

  // Metadata is now pre-computed by backend - no need to load individually

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedDataset(null);
    setDatasetPrompts([]);
  };

  const handleUploadClick = () => {
    setUploadModalOpen(true);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Example dataset type for download / upload metadata
  const [exampleDatasetType, setExampleDatasetType] = useState<ExampleUseCase>("chatbot");
  const [datasetTurnType, setDatasetTurnType] = useState<ExampleTurnType>("single-turn");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadModalOpen(false);
      const resp = await uploadDataset(
        file,
        exampleDatasetType,
        datasetTurnType,
        orgId || undefined,
      );
      setAlert({ variant: "success", body: `Uploaded ${resp.filename}` });
      setTimeout(() => setAlert(null), 4000);
      void loadMyDatasets();
    } catch (err) {
      console.error("Upload failed", err);
      setAlert({
        variant: "error",
        body: err instanceof Error ? err.message : "Upload failed",
      });
      setTimeout(() => setAlert(null), 6000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // If editor is loading, show spinner
  if (loadingEditor) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}
      >
        <CircularProgress sx={{ color: palette.brand.primary }} />
      </Box>
    );
  }

  // Inline editor view
  if (editorOpen && editingDataset) {
    return (
      <Box>
        {alert && <Alert variant={alert.variant} body={alert.body} />}

        {/* Header with back button and save */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton size="small" onClick={handleCloseEditor} aria-label="Back">
              <ArrowLeft size={18} />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "16px" }}>
              Edit dataset
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <CustomizableButton
              variant="outlined"
              onClick={async () => {
                try {
                  const json = JSON.stringify(editablePrompts, null, 2);
                  await navigator.clipboard.writeText(json);
                  setCopiedJson(true);
                  setTimeout(() => setCopiedJson(false), 2000);
                } catch {
                  setAlert({ variant: "error", body: "Failed to copy to clipboard" });
                  setTimeout(() => setAlert(null), 3000);
                }
              }}
              startIcon={copiedJson ? <Check size={16} /> : <Copy size={16} />}
              text={copiedJson ? "Copied!" : "Copy JSON"}
              sx={{
                "color": copiedJson ? palette.status.success.text : palette.text.secondary,
                "borderColor": copiedJson ? palette.status.success.text : palette.border.dark,
                "&:hover": {
                  borderColor: palette.text.disabled,
                  backgroundColor: palette.background.accent,
                },
              }}
            />
            <CustomizableButton
              variant="outlined"
              onClick={() => {
                const json = JSON.stringify(editablePrompts, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const slug =
                  editDatasetName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")
                    .replace(/^_+|_+$/g, "") || "dataset";
                a.download = `${slug}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              startIcon={<Download size={16} />}
              text="Download"
              sx={{
                "color": palette.text.secondary,
                "borderColor": palette.border.dark,
                "&:hover": {
                  borderColor: palette.text.disabled,
                  backgroundColor: palette.background.accent,
                },
              }}
            />
            <CustomizableButton
              variant="contained"
              isDisabled={!isValidToSave || savingDataset}
              startIcon={<SaveIcon size={16} />}
              onClick={handleSaveDataset}
              text={savingDataset ? "Saving..." : "Save"}
            />
          </Stack>
        </Stack>

        {/* Dataset name input */}
        <Stack spacing={2} sx={{ mb: 3 }}>
          <Field
            label="Dataset name"
            value={editDatasetName}
            onChange={(e) => setEditDatasetName(e.target.value)}
            placeholder="Enter a descriptive name for this dataset"
            isRequired
          />
          <Typography variant="body2" sx={{ color: palette.text.tertiary, fontSize: "13px" }}>
            Edit the prompts below, then click Save to update your dataset.
          </Typography>
        </Stack>

        {/* Prompts/Conversations table */}
        <TableContainer>
          <Table sx={{ ...singleTheme.tableStyles.primary.frame, tableLayout: "fixed" }}>
            <TableHead
              sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}
            >
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.header.cell,
                    width: "70px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  ID
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.header.cell,
                    width: "35%",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {editablePrompts.length > 0 && isMultiTurnConversation(editablePrompts[0])
                    ? "SCENARIO / TURNS"
                    : "PROMPT"}
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.header.cell,
                    width: "12%",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {editablePrompts.length > 0 && isMultiTurnConversation(editablePrompts[0])
                    ? "TURNS"
                    : "DIFFICULTY"}
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.header.cell,
                    width: "33%",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {editablePrompts.length > 0 && isMultiTurnConversation(editablePrompts[0])
                    ? "OUTCOME"
                    : "CATEGORY"}
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.header.cell,
                    width: "50px",
                    textAlign: "center",
                  }}
                ></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {editablePrompts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: "center", py: 4 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      No prompts in this dataset yet.
                    </Typography>
                    <CustomizableButton
                      variant="outlined"
                      startIcon={<Plus size={16} />}
                      onClick={handleAddPrompt}
                      text="Add your first prompt"
                      sx={{
                        "color": palette.brand.primary,
                        "borderColor": palette.brand.primary,
                        "&:hover": {
                          borderColor: palette.brand.primaryHover,
                          backgroundColor: palette.brand.primaryLight,
                        },
                      }}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                editablePrompts.map((p, idx) => {
                  const isMultiTurn = isMultiTurnConversation(p);
                  const displayText = isMultiTurn
                    ? (p as MultiTurnConversation).scenario ||
                      (p as MultiTurnConversation).turns?.[0]?.content ||
                      "Empty conversation"
                    : (p as SingleTurnPrompt).prompt || "Empty prompt - click to edit";
                  const hasContent = isMultiTurn
                    ? (p as MultiTurnConversation).turns?.length > 0
                    : !!(p as SingleTurnPrompt).prompt;

                  return (
                    <TableRow
                      key={p.id || idx}
                      onClick={() => {
                        setSelectedPromptIndex(idx);
                        setPromptDrawerOpen(true);
                      }}
                      sx={{
                        ...singleTheme.tableStyles.primary.body.row,
                        "cursor": "pointer",
                        "&:hover": { backgroundColor: palette.background.hover },
                      }}
                    >
                      <TableCell
                        sx={{
                          ...singleTheme.tableStyles.primary.body.cell,
                          width: "70px",
                          textAlign: "center",
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: "12px",
                            fontFamily: "monospace",
                            color: palette.text.tertiary,
                          }}
                        >
                          {p.id || (isMultiTurn ? `conv_${idx + 1}` : `prompt_${idx + 1}`)}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          ...singleTheme.tableStyles.primary.body.cell,
                          width: "35%",
                          textAlign: "center",
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: "13px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            color: hasContent ? palette.text.secondary : palette.text.disabled,
                            fontStyle: hasContent ? "normal" : "italic",
                          }}
                        >
                          {displayText}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          ...singleTheme.tableStyles.primary.body.cell,
                          width: "12%",
                          textAlign: "center",
                        }}
                      >
                        {isMultiTurn ? (
                          <Chip
                            label={`${(p as MultiTurnConversation).turns?.length || 0} turns`}
                            variant="info"
                            uppercase={false}
                          />
                        ) : (p as SingleTurnPrompt).difficulty ? (
                          <Chip
                            label={(p as SingleTurnPrompt).difficulty!}
                            variant={
                              (p as SingleTurnPrompt).difficulty === "easy"
                                ? "success"
                                : (p as SingleTurnPrompt).difficulty === "medium"
                                  ? "medium"
                                  : (p as SingleTurnPrompt).difficulty === "hard"
                                    ? "error"
                                    : "default"
                            }
                            uppercase={false}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell
                        sx={{
                          ...singleTheme.tableStyles.primary.body.cell,
                          width: "33%",
                          textAlign: "center",
                        }}
                      >
                        {isMultiTurn ? (
                          <Typography
                            sx={{
                              fontSize: "12px",
                              color: palette.text.tertiary,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {(p as MultiTurnConversation).expected_outcome || "-"}
                          </Typography>
                        ) : (
                          <Chip
                            label={(p as SingleTurnPrompt).category || "uncategorized"}
                            variant="default"
                            uppercase={false}
                          />
                        )}
                      </TableCell>
                      <TableCell
                        sx={{
                          ...singleTheme.tableStyles.primary.body.cell,
                          width: "50px",
                          textAlign: "center",
                        }}
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePrompt(idx);
                          }}
                          sx={{
                            "color": palette.status.error.text,
                            "&:hover": { backgroundColor: palette.status.error.bg },
                          }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Add prompt button */}
        {editablePrompts.length > 0 && (
          <CustomizableButton
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={handleAddPrompt}
            fullWidth
            text="Add prompt"
            sx={{
              "mt": 2,
              "color": palette.brand.primary,
              "borderColor": palette.border.dark,
              "borderStyle": "dashed",
              "py": 1.5,
              "&:hover": {
                borderColor: palette.brand.primary,
                backgroundColor: palette.brand.primaryLight,
                borderStyle: "dashed",
              },
            }}
          />
        )}

        {/* Prompt Edit Drawer */}
        <Drawer
          anchor="right"
          open={promptDrawerOpen}
          onClose={() => {
            setPromptDrawerOpen(false);
            setSelectedPromptIndex(null);
          }}
        >
          <Stack
            sx={{
              width: 500,
              maxHeight: "100vh",
              overflowY: "auto",
              p: theme.spacing(10),
              bgcolor: theme.palette.background.paper,
            }}
          >
            {/* Drawer Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography fontWeight={600} color={theme.palette.text.primary} fontSize="16px">
                Edit prompt
              </Typography>
              <Box
                onClick={() => {
                  setPromptDrawerOpen(false);
                  setSelectedPromptIndex(null);
                }}
                sx={{ cursor: "pointer" }}
              >
                <X size={20} color={theme.palette.text.secondary} />
              </Box>
            </Stack>
            <Divider sx={{ mb: 3, mx: `calc(-1 * ${theme.spacing(10)})` }} />

            {selectedPromptIndex !== null && editablePrompts[selectedPromptIndex] && (
              <Stack spacing={3}>
                {/* Multi-turn conversation editor */}
                {isMultiTurnConversation(editablePrompts[selectedPromptIndex]) ? (
                  <>
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}
                      >
                        Scenario
                      </Typography>
                      <Field
                        value={
                          (editablePrompts[selectedPromptIndex] as MultiTurnConversation)
                            .scenario || ""
                        }
                        onChange={(e) => {
                          const next = [...editablePrompts];
                          next[selectedPromptIndex] = {
                            ...next[selectedPromptIndex],
                            scenario: e.target.value,
                          };
                          setEditablePrompts(next);
                        }}
                        placeholder="Describe the conversation scenario"
                        type="description"
                      />
                    </Box>

                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}
                      >
                        Expected Outcome
                      </Typography>
                      <Field
                        value={
                          (editablePrompts[selectedPromptIndex] as MultiTurnConversation)
                            .expected_outcome || ""
                        }
                        onChange={(e) => {
                          const next = [...editablePrompts];
                          next[selectedPromptIndex] = {
                            ...next[selectedPromptIndex],
                            expected_outcome: e.target.value,
                          };
                          setEditablePrompts(next);
                        }}
                        placeholder="What should the conversation achieve?"
                        type="description"
                      />
                    </Box>

                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, fontSize: "13px", mb: 2 }}
                      >
                        Conversation Turns
                      </Typography>

                      {/* Chat conversation container */}
                      <Box
                        sx={{
                          border: `1px solid ${palette.accent.purple.border}`,
                          borderRadius: "12px",
                          backgroundColor: palette.accent.purple.bg,
                          p: 2,
                          minHeight: "200px",
                        }}
                      >
                        <Stack spacing={2}>
                          {(
                            (editablePrompts[selectedPromptIndex] as MultiTurnConversation).turns ||
                            []
                          ).map((turn, turnIdx) => (
                            <Box
                              key={turnIdx}
                              sx={{
                                display: "flex",
                                flexDirection: turn.role === "user" ? "row-reverse" : "row",
                              }}
                            >
                              <Box
                                sx={{
                                  width: "85%",
                                  p: 1.5,
                                  borderRadius:
                                    turn.role === "user"
                                      ? "12px 12px 4px 12px"
                                      : "12px 12px 12px 4px",
                                  backgroundColor:
                                    turn.role === "user"
                                      ? palette.status.success.bg
                                      : palette.accent.blue.bg,
                                  border: "1px solid",
                                  borderColor:
                                    turn.role === "user"
                                      ? palette.status.success.border
                                      : palette.accent.blue.border,
                                }}
                              >
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                  alignItems="center"
                                  sx={{ mb: 1 }}
                                >
                                  <Stack direction="row" alignItems="center" spacing={1}>
                                    <Box
                                      sx={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: "4px",
                                        backgroundColor:
                                          turn.role === "user"
                                            ? palette.status.success.text
                                            : palette.accent.blue.text,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      {turn.role === "user" ? (
                                        <User size={12} color={palette.background.main} />
                                      ) : (
                                        <Bot size={12} color={palette.background.main} />
                                      )}
                                    </Box>
                                    <Typography
                                      sx={{
                                        fontSize: "11px",
                                        fontWeight: 600,
                                        color:
                                          turn.role === "user"
                                            ? palette.status.success.text
                                            : palette.accent.blue.text,
                                      }}
                                    >
                                      {turn.role === "user" ? "User" : "Assistant"}
                                    </Typography>
                                  </Stack>
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      const next = [...editablePrompts];
                                      const conv = next[
                                        selectedPromptIndex
                                      ] as MultiTurnConversation;
                                      const turns = [...(conv.turns || [])];
                                      turns.splice(turnIdx, 1);
                                      next[selectedPromptIndex] = { ...conv, turns };
                                      setEditablePrompts(next);
                                    }}
                                    sx={{
                                      "p": 0.5,
                                      "color": palette.status.error.text,
                                      "&:hover": { backgroundColor: palette.status.error.bg },
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </IconButton>
                                </Stack>
                                <Field
                                  value={turn.content}
                                  onChange={(e) => {
                                    const next = [...editablePrompts];
                                    const conv = next[selectedPromptIndex] as MultiTurnConversation;
                                    const turns = [...(conv.turns || [])];
                                    turns[turnIdx] = { ...turns[turnIdx], content: e.target.value };
                                    next[selectedPromptIndex] = { ...conv, turns };
                                    setEditablePrompts(next);
                                  }}
                                  placeholder={
                                    turn.role === "user"
                                      ? "What does the user say?"
                                      : "How should the assistant respond?"
                                  }
                                  type="description"
                                />
                              </Box>
                            </Box>
                          ))}

                          {/* Empty state when no turns */}
                          {(
                            (editablePrompts[selectedPromptIndex] as MultiTurnConversation).turns ||
                            []
                          ).length === 0 && (
                            <Box sx={{ py: 4, textAlign: "center" }}>
                              <Typography sx={{ fontSize: "13px", color: palette.text.disabled }}>
                                No conversation turns yet. Add a turn to start building the
                                conversation.
                              </Typography>
                            </Box>
                          )}
                        </Stack>
                      </Box>

                      {/* Add turn button - at the bottom with more spacing */}
                      <CustomizableButton
                        fullWidth
                        variant="outlined"
                        startIcon={<Plus size={14} />}
                        onClick={() => {
                          const next = [...editablePrompts];
                          const conv = next[selectedPromptIndex] as MultiTurnConversation;
                          const turns = [...(conv.turns || [])];
                          const lastRole =
                            turns.length > 0 ? turns[turns.length - 1].role : "assistant";
                          turns.push({
                            role: lastRole === "user" ? "assistant" : "user",
                            content: "",
                          });
                          next[selectedPromptIndex] = { ...conv, turns };
                          setEditablePrompts(next);
                        }}
                        sx={{
                          "mt": 3,
                          "mb": 2,
                          "color": palette.brand.primary,
                          "borderColor": palette.border.dark,
                          "borderStyle": "dashed",
                          "py": 2,
                          "&:hover": {
                            borderColor: palette.brand.primary,
                            backgroundColor: palette.status.success.bg,
                            borderStyle: "dashed",
                          },
                        }}
                      >
                        Add{" "}
                        {((editablePrompts[selectedPromptIndex] as MultiTurnConversation).turns
                          ?.length || 0) > 0
                          ? (
                              editablePrompts[selectedPromptIndex] as MultiTurnConversation
                            ).turns?.slice(-1)[0]?.role === "user"
                            ? "assistant"
                            : "user"
                          : "user"}{" "}
                        turn
                      </CustomizableButton>
                    </Box>
                  </>
                ) : (
                  /* Single-turn prompt editor */
                  <>
                    <Field
                      label="Prompt"
                      value={
                        (editablePrompts[selectedPromptIndex] as SingleTurnPrompt).prompt || ""
                      }
                      onChange={(e) => {
                        const next = [...editablePrompts];
                        next[selectedPromptIndex] = {
                          ...next[selectedPromptIndex],
                          prompt: e.target.value,
                        };
                        setEditablePrompts(next);
                      }}
                      placeholder="Enter the prompt text"
                      isRequired
                      type="description"
                    />

                    <Field
                      label="Expected output"
                      value={
                        (editablePrompts[selectedPromptIndex] as SingleTurnPrompt)
                          .expected_output || ""
                      }
                      onChange={(e) => {
                        const next = [...editablePrompts];
                        next[selectedPromptIndex] = {
                          ...next[selectedPromptIndex],
                          expected_output: e.target.value,
                        };
                        setEditablePrompts(next);
                      }}
                      placeholder="Enter the expected response"
                      type="description"
                    />

                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}
                      >
                        Difficulty
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        {(["easy", "medium", "hard"] as const).map((diff) => {
                          const isSelected =
                            (editablePrompts[selectedPromptIndex] as SingleTurnPrompt)
                              .difficulty === diff;
                          return (
                            <Box
                              key={diff}
                              onClick={() => {
                                const next = [...editablePrompts];
                                next[selectedPromptIndex] = {
                                  ...next[selectedPromptIndex],
                                  difficulty: diff,
                                };
                                setEditablePrompts(next);
                              }}
                              sx={{ cursor: "pointer" }}
                            >
                              <Chip
                                label={diff.charAt(0).toUpperCase() + diff.slice(1)}
                                variant={
                                  isSelected
                                    ? diff === "easy"
                                      ? "success"
                                      : diff === "medium"
                                        ? "medium"
                                        : "error"
                                    : "default"
                                }
                                uppercase={false}
                              />
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>

                    <Field
                      label="Category"
                      value={
                        (editablePrompts[selectedPromptIndex] as SingleTurnPrompt).category || ""
                      }
                      onChange={(e) => {
                        const next = [...editablePrompts];
                        next[selectedPromptIndex] = {
                          ...next[selectedPromptIndex],
                          category: e.target.value,
                        };
                        setEditablePrompts(next);
                      }}
                      placeholder="e.g., general_knowledge, coding, etc."
                    />

                    <Field
                      label="Keywords"
                      value={(
                        (editablePrompts[selectedPromptIndex] as SingleTurnPrompt)
                          .expected_keywords || []
                      ).join(", ")}
                      onChange={(e) => {
                        const value = e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const next = [...editablePrompts];
                        next[selectedPromptIndex] = {
                          ...next[selectedPromptIndex],
                          expected_keywords: value,
                        };
                        setEditablePrompts(next);
                      }}
                      placeholder="Comma separated keywords"
                    />

                    {/* Only show retrieval context for RAG datasets */}
                    {editingDataset?.datasetType === "rag" && (
                      <Field
                        label="Retrieval context"
                        value={(
                          (editablePrompts[selectedPromptIndex] as SingleTurnPrompt)
                            .retrieval_context || []
                        ).join("\n")}
                        onChange={(e) => {
                          const lines = e.target.value.split("\n");
                          const next = [...editablePrompts];
                          next[selectedPromptIndex] = {
                            ...next[selectedPromptIndex],
                            retrieval_context: lines,
                          };
                          setEditablePrompts(next);
                        }}
                        placeholder="One entry per line"
                        type="description"
                      />
                    )}
                  </>
                )}

                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ mt: 4, pt: 3, borderTop: `1px solid ${palette.border.dark}` }}
                >
                  <CustomizableButton
                    variant="outlined"
                    startIcon={<Trash2 size={14} />}
                    onClick={() => {
                      if (selectedPromptIndex !== null) {
                        handleDeletePrompt(selectedPromptIndex);
                      }
                    }}
                    text="Delete"
                    sx={{
                      "color": palette.status.error.text,
                      "borderColor": palette.status.error.text,
                      "&:hover": {
                        borderColor: palette.status.error.text,
                        backgroundColor: palette.status.error.bg,
                      },
                      "minHeight": "40px",
                    }}
                  />
                  <CustomizableButton
                    variant="contained"
                    onClick={() => {
                      setPromptDrawerOpen(false);
                      setSelectedPromptIndex(null);
                    }}
                    text="Done"
                    sx={{
                      minHeight: "40px",
                      flex: 1,
                    }}
                  />
                </Stack>
              </Stack>
            )}
          </Stack>
        </Drawer>
      </Box>
    );
  }

  // Default table view
  return (
    <Stack sx={{ width: "100%" }}>
      {alert && <Alert variant={alert.variant} body={alert.body} />}

      <PageHeader
        title="Datasets"
        description="Datasets contain the prompts or conversations used to evaluate your models. Create custom datasets or use templates to get started quickly."
        rightContent={<HelperIcon articlePath="llm-evals/managing-datasets" />}
      />
      <Box sx={{ mt: "18px" }}>
        <TipBox entityName="evals-datasets" />
      </Box>

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={handleFileChange}
      />

      {/* Tab bar for My datasets / Templates */}
      <TabContext value={activeTab}>
        <Box sx={{ mb: "18px" }}>
          <TabBar
            tabs={[
              {
                label: "My datasets",
                value: "my",
                icon: "Database",
                count: datasets.length,
              },
              {
                label: "Templates",
                value: "templates",
                icon: "LayoutTemplate",
                count: flattenedTemplates.length,
              },
            ]}
            activeTab={activeTab}
            onChange={(_e, value) => {
              setActiveTab(value as "my" | "templates");
              setSelectedTemplate(null);
            }}
          />
        </Box>
      </TabContext>

      {/* My datasets view */}
      {activeTab === "my" && (
        <>
          {/* Filters + search + upload + create */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={2}
            sx={{ marginBottom: "18px" }}
          >
            <Stack direction="row" alignItems="center" gap={2}>
              <FilterBy columns={filterColumns} onFilterChange={handleFilterChange} />
              <GroupBy
                options={[
                  { id: "name", label: "Name" },
                  { id: "prompts", label: "Prompts" },
                  { id: "createdAt", label: "Created" },
                ]}
                onGroupChange={handleDatasetsGroupChange}
              />
              <SearchBox
                placeholder="Search datasets..."
                value={searchTerm}
                onChange={setSearchTerm}
                inputProps={{ "aria-label": "Search datasets" }}
                fullWidth={false}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <CustomizableButton
                variant="outlined"
                text={uploading ? "Uploading..." : "Upload dataset"}
                icon={<Upload size={16} />}
                onClick={handleUploadClick}
                isDisabled={uploading || !canUploadDataset}
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  color: palette.text.secondary,
                  gap: 2,
                }}
              />
              <CustomizableButton
                variant="contained"
                text="Add dataset"
                icon={<Plus size={16} />}
                onClick={() => setCreateDatasetModalOpen(true)}
                isDisabled={!canUploadDataset}
                sx={{
                  backgroundColor: palette.brand.primary,
                  border: `1px solid ${palette.brand.primary}`,
                  gap: 2,
                }}
              />
            </Stack>
          </Stack>

          {/* Table of user datasets */}
          <Box mb={4}>
            <GroupedTableView
              groupedData={groupedDatasets}
              ungroupedData={filteredDatasets}
              renderTable={(data, options) => (
                <DatasetsTable
                  rows={data.map(
                    (dataset): DatasetRow => ({
                      key: dataset.path,
                      name: dataset.name,
                      path: dataset.path,
                      type: dataset.turnType,
                      useCase: dataset.use_case || dataset.datasetType,
                      createdAt: dataset.createdAt,
                      metadata: {
                        promptCount: dataset.promptCount ?? 0,
                        avgDifficulty: "Medium", // Default - only shown for user datasets
                        loading: false,
                      },
                    }),
                  )}
                  onRowClick={
                    canUploadDataset
                      ? (row) => {
                          const dataset = data.find((d) => d.path === row.path);
                          if (dataset) handleRowClick(dataset);
                        }
                      : undefined
                  }
                  onView={(row) => {
                    const dataset = data.find((d) => d.path === row.path);
                    if (dataset) handleViewPrompts(dataset);
                  }}
                  onEdit={
                    canUploadDataset
                      ? (row) => {
                          const dataset = data.find((d) => d.path === row.path);
                          if (dataset) handleOpenInEditor(dataset);
                        }
                      : undefined
                  }
                  onDelete={
                    canDeleteDataset
                      ? (row) => {
                          const dataset = data.find((d) => d.path === row.path);
                          if (dataset) {
                            setDatasetToDelete(dataset);
                            setDeleteModalOpen(true);
                          }
                        }
                      : undefined
                  }
                  onDownload={(row: DatasetRow) => {
                    const dataset = data.find((d) => d.path === row.path);
                    if (dataset) handleDownloadDataset(dataset);
                  }}
                  loading={loading}
                  hidePagination={options?.hidePagination}
                />
              )}
            />
          </Box>
        </>
      )}

      {/* Templates view */}
      {activeTab === "templates" && (
        <Box>
          {/* Filter + search toolbar */}
          <Stack direction="row" alignItems="center" gap={2} sx={{ marginBottom: "18px" }}>
            <FilterBy columns={templateFilterColumns} onFilterChange={handleTemplateFilterChange} />
            <GroupBy
              options={[
                { id: "category", label: "Category" },
                { id: "difficulty", label: "Difficulty" },
              ]}
              onGroupChange={() => {}}
            />
            <SearchBox
              placeholder="Search templates..."
              value={templateSearchTerm}
              onChange={setTemplateSearchTerm}
              inputProps={{ "aria-label": "Search templates" }}
              fullWidth={false}
            />
          </Stack>

          <TemplatesTable
            rows={filteredAndSortedTemplates.map((ds) => ({
              key: ds.key,
              name: ds.name,
              path: ds.path,
              type: ds.type as "single-turn" | "multi-turn" | "simulated" | undefined,
              category: ds.category,
              test_count: ds.test_count,
              difficulty: ds.difficulty,
              description: ds.description,
            }))}
            loading={loadingTemplatesList}
            onRowClick={(template) =>
              handleViewTemplate(
                templateGroups[template.category]?.find((t) => t.key === template.key) ||
                  (template as unknown as BuiltInDataset),
              )
            }
            onUse={(template) =>
              handleOpenCopyModal(
                templateGroups[template.category]?.find((t) => t.key === template.key) ||
                  (template as unknown as BuiltInDataset),
              )
            }
            copyingTemplate={copyingTemplate}
            emptyMessage={
              flattenedTemplates.length === 0
                ? "No template datasets available"
                : "No templates match your search"
            }
          />
        </Box>
      )}

      {/* Action menu */}
      <Menu
        anchorEl={actionAnchor}
        open={Boolean(actionAnchor)}
        onClose={handleActionMenuClose}
        slotProps={{
          paper: { sx: { ...singleTheme.dropDownStyles.primary, p: "8px", minWidth: 200 } },
        }}
      >
        <Stack spacing={1}>
          <CustomizableButton
            variant="outlined"
            onClick={() => {
              actionDataset && handleViewPrompts(actionDataset);
              handleActionMenuClose();
            }}
            startIcon={<Eye size={14} />}
            sx={{
              "height": "34px",
              "fontSize": "13px",
              "fontWeight": 500,
              "color": palette.text.secondary,
              "borderColor": palette.border.dark,
              "backgroundColor": "transparent",
              "justifyContent": "flex-start",
              "&:hover": {
                backgroundColor: palette.status.success.bg,
                borderColor: palette.brand.primary,
                color: palette.brand.primary,
              },
            }}
          >
            View prompts
          </CustomizableButton>
          <CustomizableButton
            variant="outlined"
            onClick={() => {
              actionDataset && handleOpenInEditor(actionDataset);
              handleActionMenuClose();
            }}
            startIcon={<Edit3 size={14} />}
            sx={{
              "height": "34px",
              "fontSize": "13px",
              "fontWeight": 500,
              "color": palette.text.secondary,
              "borderColor": palette.border.dark,
              "backgroundColor": "transparent",
              "justifyContent": "flex-start",
              "&:hover": {
                backgroundColor: palette.status.success.bg,
                borderColor: palette.brand.primary,
                color: palette.brand.primary,
              },
            }}
          >
            Open in editor
          </CustomizableButton>
          <CustomizableButton
            variant="outlined"
            onClick={() => {
              actionDataset && handleDownloadDataset(actionDataset);
              handleActionMenuClose();
            }}
            startIcon={<Download size={14} />}
            sx={{
              "height": "34px",
              "fontSize": "13px",
              "fontWeight": 500,
              "color": palette.text.secondary,
              "borderColor": palette.border.dark,
              "backgroundColor": "transparent",
              "justifyContent": "flex-start",
              "&:hover": {
                backgroundColor: palette.status.success.bg,
                borderColor: palette.brand.primary,
                color: palette.brand.primary,
              },
            }}
          >
            Download
          </CustomizableButton>
          <CustomizableButton
            variant="outlined"
            onClick={() => {
              actionDataset && handleRemoveDataset(actionDataset);
              handleActionMenuClose();
            }}
            startIcon={<Trash2 size={14} />}
            sx={{
              "height": "34px",
              "fontSize": "13px",
              "fontWeight": 500,
              "color": palette.status.error.text,
              "borderColor": palette.border.dark,
              "backgroundColor": "transparent",
              "justifyContent": "flex-start",
              "&:hover": {
                backgroundColor: palette.status.error.bg,
                borderColor: palette.status.error.text,
                color: palette.status.error.text,
              },
            }}
          >
            Delete
          </CustomizableButton>
        </Stack>
      </Menu>

      {/* Delete confirmation modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete this dataset?"
        body={`Are you sure you want to remove "${datasetToDelete?.name || "this dataset"}" from your project? This action cannot be undone.`}
        cancelText="Cancel"
        proceedText="Delete"
        onCancel={() => {
          setDeleteModalOpen(false);
          setDatasetToDelete(null);
        }}
        onProceed={handleConfirmDelete}
        proceedButtonColor="error"
        proceedButtonVariant="contained"
      />

      {/* Copy template confirmation modal */}
      <ConfirmationModal
        isOpen={copyModalOpen}
        title="Copy to my datasets?"
        TitleFontSize={16}
        body={
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            This will copy &quot;{templateToCopy?.name || "this template"}&quot; to your datasets.
            You can then edit and use it in your experiments.
          </Typography>
        }
        cancelText="Cancel"
        proceedText="Copy"
        onCancel={() => {
          setCopyModalOpen(false);
          setTemplateToCopy(null);
        }}
        onProceed={handleConfirmCopy}
        proceedButtonColor="primary"
        proceedButtonVariant="contained"
      />

      <UploadDatasetModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        turnType={datasetTurnType}
        onTurnTypeChange={setDatasetTurnType}
        useCase={exampleDatasetType}
        onUseCaseChange={setExampleDatasetType}
        onUploadClick={handleFileSelect}
      />

      <DatasetPreviewDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        datasetName={selectedDataset?.name}
        prompts={datasetPrompts}
        loading={loadingPrompts}
      />

      <TemplatePreviewDrawer
        open={templateDrawerOpen}
        onClose={handleCloseTemplateDrawer}
        templateName={selectedTemplate?.name}
        prompts={templatePrompts}
        loading={loadingTemplatePrompts}
        copying={copyingTemplate}
        onCopy={() => {
          if (selectedTemplate) {
            handleOpenCopyModal(selectedTemplate);
          }
        }}
      />

      <CreateDatasetModals
        choiceOpen={createDatasetModalOpen}
        onChoiceClose={() => setCreateDatasetModalOpen(false)}
        onOpenTypeSelection={() => {
          setCreateDatasetModalOpen(false);
          setCreateTypeSelectionOpen(true);
        }}
        onChooseUpload={() => {
          setCreateDatasetModalOpen(false);
          setUploadModalOpen(true);
        }}
        onChooseTemplate={() => {
          setCreateDatasetModalOpen(false);
          setActiveTab("templates");
        }}
        typeSelectionOpen={createTypeSelectionOpen}
        onTypeSelectionClose={() => setCreateTypeSelectionOpen(false)}
        onCreate={(draft) => {
          setEditablePrompts(draft.prompts);
          setEditDatasetName("");
          setEditingDataset({
            key: "new",
            name: "New Dataset",
            path: "",
            use_case: draft.useCase,
            datasetType: draft.useCase,
            turnType: draft.turnType,
          });
          setEditorOpen(true);
        }}
      />
    </Stack>
  );
}
