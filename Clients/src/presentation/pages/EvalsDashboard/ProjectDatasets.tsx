import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MenuItem,
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
  Database,
  Plus,
  User,
  Bot,
  Check,
  MessageSquare,
  GitBranch,
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
import ModalStandard from "../../components/Modals/StandardModal";
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
import SelectableCard from "../../components/SelectableCard";
import { useAuth } from "../../../application/hooks/useAuth";
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
  const { userRoleName } = useAuth();
  const canUploadDataset = allowedRoles.evals.uploadDataset.includes(userRoleName);
  const canDeleteDataset = allowedRoles.evals.deleteDataset.includes(userRoleName);

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

  // Expanded prompt rows in template preview
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set());

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

  // Create from scratch type selection modal
  const [createTypeSelectionOpen, setCreateTypeSelectionOpen] = useState(false);
  const [newDatasetUseCase, setNewDatasetUseCase] = useState<"chatbot" | "rag">("chatbot");
  const [newDatasetTurnType, setNewDatasetTurnType] = useState<"single-turn" | "multi-turn">(
    "single-turn",
  );

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
    setExpandedPromptIds(new Set()); // Reset expanded state
  };

  // Close template drawer
  const handleCloseTemplateDrawer = () => {
    setTemplateDrawerOpen(false);
    setSelectedTemplate(null);
    setTemplatePrompts([]);
    setExpandedPromptIds(new Set()); // Reset expanded state
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

  // Example dataset type for download
  const [exampleDatasetType, setExampleDatasetType] = useState<"chatbot" | "rag" | "agent">(
    "chatbot",
  );
  const [datasetTurnType, setDatasetTurnType] = useState<
    "single-turn" | "multi-turn" | "simulated"
  >("single-turn");

  const handleDownloadExample = (type: "chatbot" | "rag" | "agent" = exampleDatasetType) => {
    // Single-turn examples
    const singleTurnDatasets = {
      chatbot: [
        {
          id: "chatbot_001",
          category: "general_knowledge",
          prompt: "What is the capital of France?",
          expected_output: "The capital of France is Paris.",
          expected_keywords: ["Paris", "capital", "France"],
          difficulty: "easy",
        },
        {
          id: "chatbot_002",
          category: "coding",
          prompt: "Write a Python function to reverse a string.",
          expected_output: "def reverse_string(s):\n    return s[::-1]",
          expected_keywords: ["def", "return"],
          difficulty: "medium",
        },
      ],
      rag: [
        {
          id: "rag_001",
          category: "document_qa",
          prompt: "What are the key benefits of renewable energy?",
          expected_output:
            "The key benefits include reduced carbon emissions and energy independence.",
          expected_keywords: ["carbon emissions", "energy independence"],
          difficulty: "medium",
          retrieval_context: [
            "Renewable energy sources offer significant environmental benefits by reducing greenhouse gas emissions.",
            "Countries that invest in renewable energy achieve greater energy independence.",
          ],
        },
      ],
      agent: [
        {
          id: "agent_001",
          category: "task_execution",
          prompt: "Search for the weather in New York and summarize it.",
          expected_output:
            "I searched for the current weather in New York. The temperature is 72°F.",
          expected_keywords: ["weather", "New York", "temperature"],
          difficulty: "medium",
          tools_available: ["web_search", "calculator", "calendar"],
          expected_tools: ["web_search"],
        },
      ],
    };

    // Multi-turn examples
    const multiTurnDatasets = {
      chatbot: [
        {
          scenario: "Customer asking about product features",
          expected_outcome: "Successfully explain product features and answer follow-up questions",
          turns: [
            {
              role: "user",
              content: "Hi, I'm interested in your premium plan. What features does it include?",
            },
            {
              role: "assistant",
              content:
                "Hello! Our premium plan includes unlimited storage, priority support, and advanced analytics. Would you like details on any specific feature?",
            },
            { role: "user", content: "Yes, tell me more about the advanced analytics." },
            {
              role: "assistant",
              content:
                "Our advanced analytics provides real-time dashboards, custom reports, and predictive insights powered by AI.",
            },
          ],
        },
        {
          scenario: "Technical troubleshooting conversation",
          expected_outcome: "Guide user through troubleshooting steps",
          turns: [
            { role: "user", content: "My app keeps crashing when I try to upload files." },
            {
              role: "assistant",
              content:
                "I'm sorry to hear that. Let me help you troubleshoot. What type of files are you trying to upload, and what's their size?",
            },
            { role: "user", content: "PDFs, around 50MB each." },
            {
              role: "assistant",
              content:
                "That file size should work fine. Can you try clearing your browser cache and attempting the upload again?",
            },
          ],
        },
      ],
      rag: [
        {
          scenario: "Document-based Q&A about company policies",
          expected_outcome: "Accurately answer questions using retrieved context",
          context: [
            "Employees are entitled to 20 days of paid time off per year.",
            "Remote work is permitted up to 3 days per week with manager approval.",
          ],
          turns: [
            { role: "user", content: "How many vacation days do I get per year?" },
            {
              role: "assistant",
              content:
                "According to the company policy, employees are entitled to 20 days of paid time off per year.",
            },
            { role: "user", content: "Can I work from home?" },
            {
              role: "assistant",
              content:
                "Yes, remote work is permitted up to 3 days per week, but you'll need your manager's approval.",
            },
          ],
        },
      ],
      agent: [
        {
          scenario: "Planning a trip with multiple tools",
          expected_outcome: "Successfully use tools to help plan a trip",
          tools_available: ["web_search", "calendar", "weather_api"],
          turns: [
            { role: "user", content: "Help me plan a trip to Paris next month." },
            {
              role: "assistant",
              content:
                "I'd be happy to help! Let me check the weather forecast for Paris next month. [uses weather_api]",
            },
            { role: "user", content: "What are the must-see attractions?" },
            {
              role: "assistant",
              content:
                "Let me search for top Paris attractions. [uses web_search] The top attractions include the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral.",
            },
          ],
        },
      ],
    };

    // Simulated examples (scenario-only, no turns - AI generates the conversation)
    const simulatedDatasets = {
      chatbot: [
        {
          scenario: "User wants to book a flight to Paris",
          expected_outcome:
            "Successfully complete flight booking with date, class, and seat preference confirmed",
          user_description: "Frequent business traveler, prefers aisle seats, flexible on dates",
          max_turns: 8,
        },
        {
          scenario: "Customer complaining about a defective product",
          expected_outcome:
            "Resolve complaint with appropriate compensation (refund or replacement)",
          user_description:
            "Frustrated customer who bought the item last week, wants quick resolution",
          max_turns: 6,
        },
        {
          scenario: "New user asking for help getting started with the platform",
          expected_outcome: "User understands core features and can navigate the dashboard",
          user_description: "First-time user, not very tech-savvy, prefers step-by-step guidance",
        },
      ],
      rag: [
        {
          scenario: "Employee asking HR questions about benefits and policies",
          expected_outcome: "Provide accurate information from company documents",
          user_description: "New employee unfamiliar with company policies",
          max_turns: 8,
        },
        {
          scenario: "User researching a technical topic using documentation",
          expected_outcome: "Synthesize information from multiple documents accurately",
          user_description: "Developer looking for API integration guidance",
        },
      ],
      agent: [
        {
          scenario: "User planning a multi-city vacation with budget constraints",
          expected_outcome: "Create complete itinerary using search, calendar, and weather tools",
          user_description:
            "Budget-conscious traveler, flexible dates, prefers cultural experiences",
          max_turns: 10,
        },
        {
          scenario: "Manager scheduling a team meeting across time zones",
          expected_outcome: "Find optimal meeting time using calendar integration",
          user_description: "Busy manager with team members in 3 different time zones",
        },
      ],
    };

    const exampleData =
      datasetTurnType === "single-turn"
        ? singleTurnDatasets[type]
        : datasetTurnType === "multi-turn"
          ? multiTurnDatasets[type]
          : simulatedDatasets[type];
    const filename = `example_${datasetTurnType}_${type}_dataset.json`;

    const blob = new Blob([JSON.stringify(exampleData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
                color: copiedJson ? palette.status.success.text : palette.text.secondary,
                borderColor: copiedJson ? palette.status.success.text : palette.border.dark,
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
                color: palette.text.secondary,
                borderColor: palette.border.dark,
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
                        color: palette.brand.primary,
                        borderColor: palette.brand.primary,
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
                        cursor: "pointer",
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
                            color: palette.status.error.text,
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
              mt: 2,
              color: palette.brand.primary,
              borderColor: palette.border.dark,
              borderStyle: "dashed",
              py: 1.5,
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
                                      p: 0.5,
                                      color: palette.status.error.text,
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
                          mt: 3,
                          mb: 2,
                          color: palette.brand.primary,
                          borderColor: palette.border.dark,
                          borderStyle: "dashed",
                          py: 2,
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
                      color: palette.status.error.text,
                      borderColor: palette.status.error.text,
                      "&:hover": {
                        borderColor: palette.status.error.text,
                        backgroundColor: palette.status.error.bg,
                      },
                      minHeight: "40px",
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
          paper: {
            sx: singleTheme.dropDownStyles.primary,
          },
        }}
      >
        <MenuItem onClick={() => actionDataset && handleViewPrompts(actionDataset)}>
          View prompts
        </MenuItem>
        <MenuItem onClick={() => actionDataset && handleOpenInEditor(actionDataset)}>
          Open in editor
        </MenuItem>
        <MenuItem onClick={() => actionDataset && handleDownloadDataset(actionDataset)}>
          Download
        </MenuItem>
        <MenuItem
          onClick={() => actionDataset && handleRemoveDataset(actionDataset)}
          sx={{ color: palette.status.error.text }}
        >
          Remove
        </MenuItem>
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

      {/* Upload instructions modal */}
      <ModalStandard
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload dataset"
        description="Upload a custom dataset in JSON format for your evaluations"
        customFooter={
          <Stack direction="row" spacing={2} justifyContent="flex-end" width="100%">
            <CustomizableButton
              variant="outlined"
              text="Cancel"
              onClick={() => setUploadModalOpen(false)}
              sx={{
                minWidth: "80px",
                height: "34px",
                border: `1px solid ${palette.border.dark}`,
                color: palette.text.secondary,
                "&:hover": {
                  backgroundColor: palette.background.accent,
                  border: `1px solid ${palette.border.dark}`,
                },
              }}
            />
            <CustomizableButton
              variant="contained"
              text="Upload file"
              onClick={handleFileSelect}
              startIcon={<Upload size={16} />}
              sx={{
                minWidth: "120px",
                height: "34px",
                backgroundColor: palette.brand.primary,
                "&:hover": {
                  backgroundColor: palette.brand.primaryHover,
                },
              }}
            />
          </Stack>
        }
      >
        <Stack spacing={3} sx={{ p: 2 }}>
          {/* Turn type selector - NEW */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1.5 }}>
              Conversation type
            </Typography>
            <Stack direction="row" spacing={1}>
              <Box onClick={() => setDatasetTurnType("single-turn")} sx={{ cursor: "pointer" }}>
                <Chip
                  label="Single-Turn"
                  uppercase={false}
                  backgroundColor={
                    datasetTurnType === "single-turn"
                      ? palette.status.warning.bg
                      : palette.background.hover
                  }
                  textColor={
                    datasetTurnType === "single-turn"
                      ? palette.status.warning.text
                      : palette.text.tertiary
                  }
                />
              </Box>
              <Box onClick={() => setDatasetTurnType("multi-turn")} sx={{ cursor: "pointer" }}>
                <Chip
                  label="Multi-Turn"
                  uppercase={false}
                  backgroundColor={
                    datasetTurnType === "multi-turn" || datasetTurnType === "simulated"
                      ? palette.accent.blue.bg
                      : palette.background.hover
                  }
                  textColor={
                    datasetTurnType === "multi-turn" || datasetTurnType === "simulated"
                      ? palette.accent.blue.text
                      : palette.text.tertiary
                  }
                />
              </Box>
            </Stack>

            {/* Multi-turn sub-options: Default or Simulated */}
            {(datasetTurnType === "multi-turn" || datasetTurnType === "simulated") && (
              <Box
                sx={{ mt: 1.5, ml: 2, pl: 2, borderLeft: `2px solid ${palette.accent.blue.bg}` }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontSize: "11px", color: palette.text.tertiary, mb: 1 }}
                >
                  Multi-turn mode:
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Box onClick={() => setDatasetTurnType("multi-turn")} sx={{ cursor: "pointer" }}>
                    <Chip
                      label="Default"
                      size="small"
                      uppercase={false}
                      backgroundColor={
                        datasetTurnType === "multi-turn"
                          ? palette.accent.blue.bg
                          : palette.background.hover
                      }
                      textColor={
                        datasetTurnType === "multi-turn"
                          ? palette.accent.blue.text
                          : palette.text.tertiary
                      }
                    />
                  </Box>
                  <Box onClick={() => setDatasetTurnType("simulated")} sx={{ cursor: "pointer" }}>
                    <Chip
                      label="Simulated"
                      size="small"
                      uppercase={false}
                      backgroundColor={
                        datasetTurnType === "simulated"
                          ? palette.accent.purple.bg
                          : palette.background.hover
                      }
                      textColor={
                        datasetTurnType === "simulated"
                          ? palette.accent.purple.text
                          : palette.text.tertiary
                      }
                    />
                  </Box>
                </Stack>
              </Box>
            )}

            <Typography
              variant="body2"
              sx={{ fontSize: "12px", color: palette.text.tertiary, mt: 1.5 }}
            >
              {datasetTurnType === "single-turn"
                ? "Simple prompt → response pairs. Best for RAG and basic Q&A evaluation."
                : datasetTurnType === "multi-turn"
                  ? "Multi-turn conversations with scenario and turns. Best for chatbot and agent evaluation."
                  : "Define scenarios only — the AI will simulate full conversations dynamically during evaluation."}
            </Typography>
          </Box>

          {/* Dataset type selector */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1.5 }}>
              Use case
            </Typography>
            <Stack direction="row" spacing={1}>
              {/* Agent evaluation now supported per DeepEval docs */}
              {(["chatbot", "rag", "agent"] as const).map((type) => {
                const isSelected = exampleDatasetType === type;
                return (
                  <Box
                    key={type}
                    onClick={() => setExampleDatasetType(type)}
                    sx={{ cursor: "pointer" }}
                  >
                    <Chip
                      label={type === "rag" ? "RAG" : type.charAt(0).toUpperCase() + type.slice(1)}
                      uppercase={false}
                      backgroundColor={
                        isSelected
                          ? type === "chatbot"
                            ? palette.accent.blue.bg
                            : type === "rag"
                              ? palette.accent.indigo.bg
                              : palette.status.error.bg
                          : palette.background.hover
                      }
                      textColor={
                        isSelected
                          ? type === "chatbot"
                            ? palette.accent.blue.text
                            : type === "rag"
                              ? palette.accent.indigo.text
                              : palette.status.error.text
                          : palette.text.tertiary
                      }
                    />
                  </Box>
                );
              })}
            </Stack>
            <Typography
              variant="body2"
              sx={{ fontSize: "12px", color: palette.text.tertiary, mt: 1 }}
            >
              {exampleDatasetType === "chatbot" &&
                "Standard Q&A datasets for evaluating chatbot responses."}
              {exampleDatasetType === "rag" &&
                "Datasets with retrieval_context for RAG faithfulness & relevancy metrics."}
              {exampleDatasetType === "agent" &&
                "Datasets with tools_available for evaluating agent reasoning, tool usage, and task completion."}
            </Typography>
          </Box>

          {/* JSON structure based on turn type */}
          <Box>
            <Box
              sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px" }}>
                {datasetTurnType === "single-turn"
                  ? "Single-Turn"
                  : datasetTurnType === "multi-turn"
                    ? "Multi-Turn"
                    : "Simulated"}{" "}
                JSON format
              </Typography>
              <CustomizableButton
                size="small"
                variant="text"
                startIcon={<Download size={14} />}
                onClick={() => handleDownloadExample(exampleDatasetType)}
                text="Download example"
                sx={{
                  fontSize: "12px",
                  color: palette.brand.primary,
                  "&:hover": {
                    backgroundColor: "rgba(19, 113, 91, 0.08)",
                  },
                }}
              />
            </Box>
            <Box
              sx={{
                backgroundColor: palette.background.accent,
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "6px",
                p: 2,
                fontFamily: "monospace",
                fontSize: "11px",
                overflow: "auto",
                maxHeight: "220px",
              }}
            >
              <pre style={{ margin: 0 }}>
                {datasetTurnType === "single-turn"
                  ? `[
  {
    "id": "prompt_001",
    "category": "general",
    "prompt": "What is machine learning?",
    "expected_output": "Machine learning is...",
    "expected_keywords": ["algorithm", "data"],
    "difficulty": "easy"${
      exampleDatasetType === "rag"
        ? `,
    "retrieval_context": [
      "Context document 1...",
      "Context document 2..."
    ]`
        : exampleDatasetType === "agent"
          ? `,
    "tools_available": ["web_search"],
    "expected_tools": ["web_search"]`
          : ""
    }
  }
]`
                  : datasetTurnType === "multi-turn"
                    ? `[
  {
    "scenario": "Customer asking for help",
    "expected_outcome": "Successfully assist customer",${
      exampleDatasetType === "rag"
        ? `
    "context": ["Relevant document..."],`
        : ""
    }${
      exampleDatasetType === "agent"
        ? `
    "tools_available": ["search", "calendar"],`
        : ""
    }
    "turns": [
      { "role": "user", "content": "Hi, I need help" },
      { "role": "assistant", "content": "Hello! How can I assist you today?" },
      { "role": "user", "content": "I have a question about..." },
      { "role": "assistant", "content": "I'd be happy to help with that." }
    ]
  }
]`
                    : `[
  {
    "scenario": "User wants to book a flight to Paris",
    "expected_outcome": "Successfully complete flight booking",
    "user_description": "Frequent traveler, prefers window seats",
    "max_turns": 8
  },
  {
    "scenario": "Customer complaining about a defective product",
    "expected_outcome": "Resolve complaint with refund or replacement",
    "user_description": "Frustrated customer, bought item last week"
  }
]`}
              </pre>
            </Box>
            {datasetTurnType === "simulated" && (
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  backgroundColor: palette.accent.purple.bg,
                  borderRadius: "6px",
                  border: `1px solid ${palette.accent.purple.border}`,
                }}
              >
                <Typography
                  sx={{ fontSize: "12px", color: palette.accent.purple.text, fontWeight: 500 }}
                >
                  How Simulated Mode Works
                </Typography>
                <Typography sx={{ fontSize: "11px", color: palette.accent.purple.text, mt: 0.5 }}>
                  You provide scenarios only — no need to write conversations. During evaluation,
                  the AI will:
                  <br />• Simulate a user based on your description
                  <br />• Generate realistic multi-turn conversations
                  <br />• Evaluate the assistant's responses automatically
                </Typography>
              </Box>
            )}
          </Box>

          {/* Field descriptions based on turn type */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}>
              {datasetTurnType === "single-turn"
                ? "Single-Turn"
                : datasetTurnType === "multi-turn"
                  ? "Multi-Turn"
                  : "Simulated"}{" "}
              fields
            </Typography>
            <Stack spacing={0.75}>
              <Box>
                <Typography
                  component="span"
                  sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}
                >
                  id
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}
                >
                  (required) Unique identifier
                </Typography>
              </Box>
              <Box>
                <Typography
                  component="span"
                  sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}
                >
                  prompt
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}
                >
                  (required) The input question or task
                </Typography>
              </Box>
              <Box>
                <Typography
                  component="span"
                  sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}
                >
                  expected_output
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}
                >
                  (required) Expected model response
                </Typography>
              </Box>
              {exampleDatasetType === "rag" && (
                <Box
                  sx={{ backgroundColor: palette.accent.indigo.bg, p: 1, borderRadius: 1, mt: 0.5 }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: "12px",
                      fontWeight: 600,
                      fontFamily: "monospace",
                      color: palette.accent.indigo.text,
                    }}
                  >
                    retrieval_context
                  </Typography>
                  <Typography
                    component="span"
                    sx={{ fontSize: "12px", color: palette.accent.indigo.text, ml: 1 }}
                  >
                    (required for RAG) Array of retrieved context documents
                  </Typography>
                </Box>
              )}
              {/* Agent not supported yet */}
              {/* {exampleDatasetType === "agent" && (
                <>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      scenario
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) Description of the conversation scenario
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      turns
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) Array of {"{ role, content }"} messages
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      expected_outcome
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (optional) Expected result of the conversation
                    </Typography>
                  </Box>
                </>
              ) : (
                <>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      scenario
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) Description of what the user wants to accomplish
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      expected_outcome
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) What counts as a successful conversation
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      user_description
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (optional) Persona for the simulated user
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      max_turns
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (optional) Maximum turns to simulate (default: 6)
                    </Typography>
                  </Box>
                </>
              )} */}
            </Stack>
          </Box>
        </Stack>
      </ModalStandard>

      {/* Dataset Content Drawer */}
      <Drawer anchor="right" open={drawerOpen} onClose={handleCloseDrawer}>
        <Stack
          sx={{
            width: 700,
            maxHeight: "100vh",
            overflowY: "auto",
            p: theme.spacing(10),
            bgcolor: theme.palette.background.paper,
          }}
        >
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Database size={18} color={palette.brand.primary} />
              <Typography fontWeight={600} color={theme.palette.text.primary}>
                {selectedDataset?.name || "Dataset"}
              </Typography>
              {datasetPrompts.length > 0 && (
                <Chip
                  label={`${datasetPrompts.length} prompts`}
                  variant="default"
                  uppercase={false}
                />
              )}
            </Stack>
            <Box onClick={handleCloseDrawer} sx={{ cursor: "pointer" }}>
              <X size={20} color={theme.palette.text.secondary} />
            </Box>
          </Stack>
          <Divider sx={{ mb: 4, mx: `calc(-1 * ${theme.spacing(10)})` }} />

          {/* Loading State */}
          {loadingPrompts && (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 8 }}>
              <CircularProgress size={32} sx={{ color: palette.brand.primary }} />
            </Box>
          )}

          {/* Empty State */}
          {!loadingPrompts && datasetPrompts.length === 0 && (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography variant="body2" color="text.secondary">
                No prompts found in this dataset.
              </Typography>
            </Box>
          )}

          {/* Dataset Prompts Table */}
          {!loadingPrompts && datasetPrompts.length > 0 && (
            <TableContainer>
              <Table sx={{ ...singleTheme.tableStyles.primary.frame, tableLayout: "fixed" }}>
                <TableHead
                  sx={{
                    backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                  }}
                >
                  <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "80px" }}
                    >
                      ID
                    </TableCell>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "100px" }}
                    >
                      {isMultiTurnConversation(datasetPrompts[0]) ? "Turns" : "Category"}
                    </TableCell>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "360px" }}
                    >
                      {isMultiTurnConversation(datasetPrompts[0]) ? "Scenario" : "Prompt"}
                    </TableCell>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "80px" }}
                    >
                      {isMultiTurnConversation(datasetPrompts[0]) ? "Outcome" : "Difficulty"}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {datasetPrompts.map((prompt: DatasetPromptRecord, index: number) => {
                    const isMultiTurn = isMultiTurnConversation(prompt);
                    return (
                      <TableRow
                        key={prompt.id || index}
                        sx={singleTheme.tableStyles.primary.body.row}
                      >
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Typography
                            sx={{
                              fontSize: "12px",
                              fontFamily: "monospace",
                              color: palette.text.tertiary,
                            }}
                          >
                            {prompt.id ||
                              (isMultiTurn ? `conv_${index + 1}` : `prompt_${index + 1}`)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {isMultiTurn ? (
                            <Chip
                              label={`${(prompt as MultiTurnConversation).turns?.length || 0} turns`}
                              variant="info"
                              uppercase={false}
                            />
                          ) : (
                            <Chip
                              label={(prompt as SingleTurnPrompt).category || "-"}
                              variant="default"
                              uppercase={false}
                            />
                          )}
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Typography
                            sx={{
                              fontSize: "13px",
                              color: theme.palette.text.primary,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {isMultiTurn
                              ? (prompt as MultiTurnConversation).scenario ||
                                (prompt as MultiTurnConversation).turns?.[0]?.content ||
                                "-"
                              : (prompt as SingleTurnPrompt).prompt || "-"}
                          </Typography>
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {isMultiTurn ? (
                            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                              {(prompt as MultiTurnConversation).expected_outcome?.substring(
                                0,
                                20,
                              ) || "-"}
                            </Typography>
                          ) : (
                            (prompt as SingleTurnPrompt).difficulty && (
                              <Chip
                                label={(prompt as SingleTurnPrompt).difficulty!}
                                variant={
                                  (prompt as SingleTurnPrompt).difficulty === "easy"
                                    ? "success"
                                    : (prompt as SingleTurnPrompt).difficulty === "medium"
                                      ? "medium"
                                      : (prompt as SingleTurnPrompt).difficulty === "hard"
                                        ? "error"
                                        : "default"
                                }
                                uppercase={false}
                              />
                            )
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Drawer>

      {/* Template Content Drawer */}
      <Drawer anchor="right" open={templateDrawerOpen} onClose={handleCloseTemplateDrawer}>
        <Stack
          sx={{
            width: 700,
            maxHeight: "100vh",
            overflowY: "auto",
            p: theme.spacing(10),
            bgcolor: theme.palette.background.paper,
          }}
        >
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Database size={18} color={palette.brand.primary} />
              <Typography fontWeight={600} color={theme.palette.text.primary}>
                {selectedTemplate?.name || "Template"}
              </Typography>
              {templatePrompts.length > 0 && (
                <Chip
                  label={`${templatePrompts.length} prompts`}
                  variant="default"
                  uppercase={false}
                />
              )}
            </Stack>
            <Box onClick={handleCloseTemplateDrawer} sx={{ cursor: "pointer" }}>
              <X size={20} color={theme.palette.text.secondary} />
            </Box>
          </Stack>
          <Divider sx={{ mb: 4, mx: `calc(-1 * ${theme.spacing(10)})` }} />

          {/* Loading State */}
          {loadingTemplatePrompts && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress size={32} sx={{ color: palette.brand.primary }} />
            </Box>
          )}

          {/* Empty State */}
          {!loadingTemplatePrompts && templatePrompts.length === 0 && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 12,
                px: 4,
                textAlign: "center",
              }}
            >
              <Database size={48} color={palette.text.disabled} />
              <Typography sx={{ mt: 2, color: palette.text.tertiary, fontWeight: 500 }}>
                No prompts found
              </Typography>
              <Typography sx={{ mt: 0.5, color: palette.text.disabled, fontSize: "13px" }}>
                This template doesn&apos;t contain any prompts
              </Typography>
            </Box>
          )}

          {/* Prompts/Conversations Table */}
          {!loadingTemplatePrompts &&
            templatePrompts.length > 0 &&
            (() => {
              // Check if this is a multi-turn dataset by looking at the first item
              const isMultiTurn =
                templatePrompts[0] &&
                ("scenario" in templatePrompts[0] || "turns" in templatePrompts[0]);

              if (isMultiTurn) {
                // Multi-turn dataset display - cast to any for flexible access
                const conversations = templatePrompts as unknown as Array<{
                  scenario?: string;
                  category?: string;
                  expected_outcome?: string;
                  turns?: Array<{ role: string; content: string }>;
                }>;

                return (
                  <TableContainer sx={{ maxWidth: "100%", overflowX: "hidden" }}>
                    <Table
                      sx={{
                        ...singleTheme.tableStyles.primary.frame,
                        tableLayout: "fixed",
                        width: "100%",
                      }}
                    >
                      <TableHead
                        sx={{
                          backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                        }}
                      >
                        <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                          <TableCell
                            sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "8%" }}
                          >
                            #
                          </TableCell>
                          <TableCell
                            sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "18%" }}
                          >
                            Category
                          </TableCell>
                          <TableCell
                            sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "54%" }}
                          >
                            Scenario
                          </TableCell>
                          <TableCell
                            sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "20%" }}
                          >
                            Turns
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {conversations.map((conversation, index) => {
                          const convKey = `conv-${index}`;
                          const isExpanded = expandedPromptIds.has(convKey);
                          const turns = conversation.turns || [];
                          const scenarioText = conversation.scenario || `Conversation ${index + 1}`;
                          const isLongScenario = scenarioText.length > 50;
                          // Try to infer category from scenario or use a default
                          const category =
                            conversation.category ||
                            (scenarioText.toLowerCase().includes("troubleshoot")
                              ? "SUPPORT"
                              : scenarioText.toLowerCase().includes("install")
                                ? "SETUP"
                                : scenarioText.toLowerCase().includes("api")
                                  ? "TECHNICAL"
                                  : scenarioText.toLowerCase().includes("crash")
                                    ? "DEBUG"
                                    : "GENERAL");

                          return (
                            <Fragment key={convKey}>
                              <TableRow
                                onClick={() => {
                                  setExpandedPromptIds((prev) => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(convKey)) {
                                      newSet.delete(convKey);
                                    } else {
                                      newSet.add(convKey);
                                    }
                                    return newSet;
                                  });
                                }}
                                sx={{
                                  ...singleTheme.tableStyles.primary.body.row,
                                  cursor: "pointer",
                                  "&:hover": { backgroundColor: palette.background.accent },
                                  verticalAlign: "top",
                                }}
                              >
                                <TableCell
                                  sx={{
                                    ...singleTheme.tableStyles.primary.body.cell,
                                    width: "8%",
                                    verticalAlign: "top",
                                    pt: 1.5,
                                  }}
                                >
                                  <Typography
                                    sx={{ fontSize: "12px", color: palette.text.tertiary }}
                                  >
                                    {index + 1}
                                  </Typography>
                                </TableCell>
                                <TableCell
                                  sx={{
                                    ...singleTheme.tableStyles.primary.body.cell,
                                    width: "18%",
                                    overflow: "hidden",
                                    verticalAlign: "top",
                                    pt: 1.5,
                                  }}
                                >
                                  <Box title={category}>
                                    <Chip
                                      label={
                                        category.length > 10
                                          ? `${category.substring(0, 10)}...`
                                          : category
                                      }
                                      size="small"
                                      backgroundColor={palette.border.dark}
                                      textColor={palette.text.secondary}
                                    />
                                  </Box>
                                </TableCell>
                                <TableCell
                                  sx={{
                                    ...singleTheme.tableStyles.primary.body.cell,
                                    width: "54%",
                                    overflow: "hidden",
                                    verticalAlign: "top",
                                    pt: 1.5,
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      fontSize: "13px",
                                      color: theme.palette.text.primary,
                                      overflow: isExpanded ? "visible" : "hidden",
                                      textOverflow: isExpanded ? "clip" : "ellipsis",
                                      whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                                      maxWidth: "100%",
                                      wordBreak: isExpanded ? "break-word" : "normal",
                                      lineHeight: 1.5,
                                    }}
                                    title={isExpanded ? undefined : scenarioText}
                                  >
                                    {isExpanded
                                      ? scenarioText
                                      : isLongScenario
                                        ? `${scenarioText.substring(0, 50)}...`
                                        : scenarioText}
                                  </Typography>
                                  {(isLongScenario || turns.length > 0) && (
                                    <Typography
                                      sx={{
                                        fontSize: "11px",
                                        color: palette.text.disabled,
                                        mt: 0.5,
                                      }}
                                    >
                                      {isExpanded ? "Collapse" : "Expand"}
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    ...singleTheme.tableStyles.primary.body.cell,
                                    width: "20%",
                                    verticalAlign: "top",
                                    pt: 1.5,
                                  }}
                                >
                                  <Chip
                                    label={`${turns.length} TURNS`}
                                    size="small"
                                    backgroundColor={palette.accent.blue.bg}
                                    textColor={palette.accent.blue.text}
                                  />
                                </TableCell>
                              </TableRow>

                              {/* Expanded conversation turns */}
                              {isExpanded && (
                                <TableRow>
                                  <TableCell colSpan={4} sx={{ p: 0, border: "none" }}>
                                    <Box
                                      sx={{
                                        p: 2,
                                        backgroundColor: palette.background.accent,
                                        borderBottom: `1px solid ${palette.border.dark}`,
                                      }}
                                    >
                                      {conversation.expected_outcome && (
                                        <Box
                                          sx={{
                                            mb: 2,
                                            p: 1.5,
                                            backgroundColor: palette.status.success.bg,
                                            borderRadius: "6px",
                                          }}
                                        >
                                          <Typography
                                            sx={{
                                              fontSize: "11px",
                                              fontWeight: 600,
                                              color: palette.status.success.text,
                                              mb: 0.5,
                                            }}
                                          >
                                            Expected Outcome
                                          </Typography>
                                          <Typography
                                            sx={{
                                              fontSize: "12px",
                                              color: palette.status.success.text,
                                            }}
                                          >
                                            {conversation.expected_outcome}
                                          </Typography>
                                        </Box>
                                      )}
                                      <Stack spacing={1.5}>
                                        {turns.map((turn, turnIdx) => (
                                          <Box
                                            key={turnIdx}
                                            sx={{
                                              display: "flex",
                                              flexDirection:
                                                turn.role === "user" ? "row" : "row-reverse",
                                            }}
                                          >
                                            <Box
                                              sx={{
                                                maxWidth: "85%",
                                                p: 1.5,
                                                borderRadius: "8px",
                                                backgroundColor:
                                                  turn.role === "user"
                                                    ? palette.background.hover
                                                    : palette.accent.blue.bg,
                                              }}
                                            >
                                              <Typography
                                                sx={{
                                                  fontSize: "10px",
                                                  fontWeight: 600,
                                                  color:
                                                    turn.role === "user"
                                                      ? palette.text.tertiary
                                                      : palette.accent.blue.text,
                                                  mb: 0.5,
                                                }}
                                              >
                                                {turn.role === "user" ? "User" : "Assistant"}
                                              </Typography>
                                              <Typography
                                                sx={{
                                                  fontSize: "12px",
                                                  color: palette.text.secondary,
                                                  whiteSpace: "pre-wrap",
                                                }}
                                              >
                                                {turn.content}
                                              </Typography>
                                            </Box>
                                          </Box>
                                        ))}
                                      </Stack>
                                    </Box>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                );
              }

              // Single-turn dataset display (original table)
              const singleTurnPrompts = templatePrompts as SingleTurnPrompt[];
              return (
                <TableContainer sx={{ maxWidth: "100%", overflowX: "hidden" }}>
                  <Table
                    sx={{
                      ...singleTheme.tableStyles.primary.frame,
                      tableLayout: "fixed",
                      width: "100%",
                    }}
                  >
                    <TableHead
                      sx={{
                        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                      }}
                    >
                      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "8%" }}
                        >
                          #
                        </TableCell>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "22%" }}
                        >
                          Category
                        </TableCell>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "48%" }}
                        >
                          Prompt
                        </TableCell>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "22%" }}
                        >
                          Difficulty
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {singleTurnPrompts.map((prompt, index) => {
                        const promptKey = prompt.id || `prompt-${index}`;
                        const isExpanded = expandedPromptIds.has(promptKey);
                        const promptText = prompt.prompt || "";
                        const isLongPrompt = promptText.length > 40;

                        return (
                          <TableRow
                            key={promptKey}
                            onClick={() => {
                              if (isLongPrompt) {
                                setExpandedPromptIds((prev) => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(promptKey)) {
                                    newSet.delete(promptKey);
                                  } else {
                                    newSet.add(promptKey);
                                  }
                                  return newSet;
                                });
                              }
                            }}
                            sx={{
                              ...singleTheme.tableStyles.primary.body.row,
                              cursor: isLongPrompt ? "pointer" : "default",
                              "&:hover": isLongPrompt
                                ? { backgroundColor: palette.background.accent }
                                : {},
                              verticalAlign: "top",
                            }}
                          >
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                width: "8%",
                                verticalAlign: "top",
                                pt: 1.5,
                              }}
                            >
                              <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                                {index + 1}
                              </Typography>
                            </TableCell>
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                width: "22%",
                                overflow: "hidden",
                                verticalAlign: "top",
                                pt: 1.5,
                              }}
                            >
                              <Box title={prompt.category || ""}>
                                <Chip
                                  label={
                                    (prompt.category?.length || 0) > 8
                                      ? `${prompt.category.substring(0, 8)}...`
                                      : prompt.category || "-"
                                  }
                                  size="small"
                                  backgroundColor={palette.border.dark}
                                  textColor={palette.text.secondary}
                                />
                              </Box>
                            </TableCell>
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                width: "48%",
                                overflow: "hidden",
                                verticalAlign: "top",
                                pt: 1.5,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: "13px",
                                  color: theme.palette.text.primary,
                                  overflow: isExpanded ? "visible" : "hidden",
                                  textOverflow: isExpanded ? "clip" : "ellipsis",
                                  whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                                  maxWidth: "100%",
                                  wordBreak: isExpanded ? "break-word" : "normal",
                                  lineHeight: 1.5,
                                }}
                                title={isExpanded ? undefined : promptText}
                              >
                                {isExpanded
                                  ? promptText
                                  : isLongPrompt
                                    ? `${promptText.substring(0, 40)}...`
                                    : promptText}
                              </Typography>
                              {isLongPrompt && (
                                <Typography
                                  sx={{ fontSize: "11px", color: palette.text.disabled, mt: 0.5 }}
                                >
                                  {isExpanded ? "Collapse" : "Expand"}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                width: "22%",
                                verticalAlign: "top",
                                pt: 1.5,
                              }}
                            >
                              {prompt.difficulty && (
                                <Chip
                                  label={prompt.difficulty}
                                  size="small"
                                  uppercase={false}
                                  variant={
                                    prompt.difficulty === "easy"
                                      ? "success"
                                      : prompt.difficulty === "medium"
                                        ? "warning"
                                        : prompt.difficulty === "hard"
                                          ? "error"
                                          : "default"
                                  }
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            })()}

          {/* Copy Button */}
          {!loadingTemplatePrompts && templatePrompts.length > 0 && selectedTemplate && (
            <CustomizableButton
              fullWidth
              variant="contained"
              startIcon={<Copy size={14} />}
              onClick={() => handleOpenCopyModal(selectedTemplate)}
              isDisabled={copyingTemplate}
              text={copyingTemplate ? "Copying..." : "Copy to my datasets"}
              sx={{
                mt: 4,
                minHeight: "40px",
              }}
            />
          )}
        </Stack>
      </Drawer>

      {/* Create Dataset Modal - Choice between Editor and Upload */}
      <ModalStandard
        isOpen={createDatasetModalOpen}
        onClose={() => setCreateDatasetModalOpen(false)}
        title="Add dataset"
        description="Choose how you want to add a new dataset"
        maxWidth="480px"
      >
        <Stack spacing="8px">
          {/* Create from scratch option */}
          <SelectableCard
            isSelected={false}
            onClick={() => {
              setCreateDatasetModalOpen(false);
              setCreateTypeSelectionOpen(true);
            }}
            icon={<Edit3 size={14} color={palette.text.disabled} />}
            title="Create from scratch"
            description="Choose format and manually add prompts"
          />

          {/* Upload JSON option */}
          <SelectableCard
            isSelected={false}
            onClick={() => {
              setCreateDatasetModalOpen(false);
              setUploadModalOpen(true);
            }}
            icon={<Upload size={14} color={palette.text.disabled} />}
            title="Upload JSON file"
            description="Import existing dataset in JSON format"
          />

          {/* Use template option */}
          <SelectableCard
            isSelected={false}
            onClick={() => {
              setCreateDatasetModalOpen(false);
              setActiveTab("templates");
            }}
            icon={<Database size={14} color={palette.text.disabled} />}
            title="Start from template"
            description="Browse pre-built evaluation templates"
          />
        </Stack>
      </ModalStandard>

      {/* Create from scratch - Type Selection Modal */}
      <ModalStandard
        isOpen={createTypeSelectionOpen}
        onClose={() => setCreateTypeSelectionOpen(false)}
        title="Choose dataset format"
        description="Select the type and format for your new dataset"
        maxWidth="520px"
      >
        <Stack spacing="20px">
          {/* Use Case Selection */}
          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: palette.text.secondary, mb: 1.5 }}
            >
              Use Case
            </Typography>
            <Stack direction="row" spacing={1}>
              <Box
                onClick={() => setNewDatasetUseCase("chatbot")}
                sx={{ cursor: "pointer", flex: 1 }}
              >
                <SelectableCard
                  isSelected={newDatasetUseCase === "chatbot"}
                  onClick={() => setNewDatasetUseCase("chatbot")}
                  icon={
                    <MessageSquare
                      size={14}
                      color={
                        newDatasetUseCase === "chatbot"
                          ? palette.brand.primary
                          : palette.text.disabled
                      }
                    />
                  }
                  title="Chatbot"
                  description="Standard Q&A evaluation"
                />
              </Box>
              <Box onClick={() => setNewDatasetUseCase("rag")} sx={{ cursor: "pointer", flex: 1 }}>
                <SelectableCard
                  isSelected={newDatasetUseCase === "rag"}
                  onClick={() => setNewDatasetUseCase("rag")}
                  icon={
                    <Database
                      size={14}
                      color={
                        newDatasetUseCase === "rag" ? palette.brand.primary : palette.text.disabled
                      }
                    />
                  }
                  title="RAG"
                  description="With retrieval context"
                />
              </Box>
            </Stack>
          </Box>

          {/* Turn Type Selection */}
          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: palette.text.secondary, mb: 1.5 }}
            >
              Conversation Format
            </Typography>
            <Stack direction="row" spacing={1}>
              <Box
                onClick={() => setNewDatasetTurnType("single-turn")}
                sx={{ cursor: "pointer", flex: 1 }}
              >
                <SelectableCard
                  isSelected={newDatasetTurnType === "single-turn"}
                  onClick={() => setNewDatasetTurnType("single-turn")}
                  icon={
                    <MessageSquare
                      size={14}
                      color={
                        newDatasetTurnType === "single-turn"
                          ? palette.brand.primary
                          : palette.text.disabled
                      }
                    />
                  }
                  title="Single-turn"
                  description="One prompt, one response"
                />
              </Box>
              <Box
                onClick={() => setNewDatasetTurnType("multi-turn")}
                sx={{ cursor: "pointer", flex: 1 }}
              >
                <SelectableCard
                  isSelected={newDatasetTurnType === "multi-turn"}
                  onClick={() => setNewDatasetTurnType("multi-turn")}
                  icon={
                    <GitBranch
                      size={14}
                      color={
                        newDatasetTurnType === "multi-turn"
                          ? palette.brand.primary
                          : palette.text.disabled
                      }
                    />
                  }
                  title="Multi-turn"
                  description="Conversation with multiple exchanges"
                />
              </Box>
            </Stack>
          </Box>

          {/* Format Preview */}
          <Box sx={{ backgroundColor: palette.background.accent, borderRadius: "8px", p: 2 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: palette.text.secondary, mb: 1 }}
            >
              Format Preview
            </Typography>
            <Typography variant="body2" sx={{ color: palette.text.tertiary, fontSize: "12px" }}>
              {newDatasetTurnType === "single-turn"
                ? newDatasetUseCase === "rag"
                  ? "Prompts with expected output, category, difficulty, and retrieval_context fields"
                  : "Prompts with expected output, category, and difficulty fields"
                : newDatasetUseCase === "rag"
                  ? "Conversations with scenario, multiple turns (user/assistant), expected outcome, and context"
                  : "Conversations with scenario, multiple turns (user/assistant), and expected outcome"}
            </Typography>
          </Box>

          {/* Action Buttons */}
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <CustomizableButton
              variant="text"
              text="Cancel"
              onClick={() => setCreateTypeSelectionOpen(false)}
              sx={{ color: palette.text.tertiary }}
            />
            <CustomizableButton
              variant="contained"
              text="Create Dataset"
              onClick={() => {
                setCreateTypeSelectionOpen(false);

                // Initialize with appropriate format based on selection
                if (newDatasetTurnType === "single-turn") {
                  const singleTurnPrompt: SingleTurnPrompt = {
                    id: "prompt_1",
                    category: "general",
                    prompt: "",
                    expected_output: "",
                    difficulty: "medium",
                    ...(newDatasetUseCase === "rag" ? { retrieval_context: [] } : {}),
                  };
                  setEditablePrompts([singleTurnPrompt]);
                } else {
                  const multiTurnConversation: MultiTurnConversation = {
                    id: "conversation_1",
                    scenario: "",
                    expected_outcome: "",
                    turns: [{ role: "user", content: "" }],
                    ...(newDatasetUseCase === "rag" ? { context: [] } : {}),
                  };
                  setEditablePrompts([multiTurnConversation]);
                }

                setEditDatasetName("");
                setEditingDataset({
                  key: "new",
                  name: "New Dataset",
                  path: "",
                  use_case: newDatasetUseCase,
                  datasetType: newDatasetUseCase,
                  turnType: newDatasetTurnType,
                });
                setEditorOpen(true);
              }}
            />
          </Stack>
        </Stack>
      </ModalStandard>
    </Stack>
  );
}
