/**
 * @fileoverview State, loaders, filters, and CRUD handlers for the Project Datasets page.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/useProjectDatasets
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listMyDatasets,
  listDatasets,
  readDataset,
  uploadDataset,
  deleteDatasets,
  type DatasetPromptRecord,
} from "../../../../application/repository/deepEval.repository";
import {
  isSingleTurnPrompt,
  isMultiTurnConversation,
} from "../../../../application/repository/deepEval.repository";
import type { FilterColumn } from "../../../components/Table/FilterBy";
import { useTableGrouping, useGroupByState } from "../../../../application/hooks/useTableGrouping";
import { useFilterBy } from "../../../../application/hooks/useFilterBy";
import { useAuth } from "../../../../application/hooks/useAuth";
import allowedRoles from "../../../../application/constants/permissions";
import type { ExampleTurnType, ExampleUseCase } from "./exampleDatasetPayloads";
import type { BuiltInDataset, TemplateWithCategory } from "./types";

export type UseProjectDatasetsArgs = {
  orgId?: string | null;
};

export function useProjectDatasets({ orgId }: UseProjectDatasetsArgs) {
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

  // Template drawer state
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);

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

  // Example dataset type for download / upload metadata
  const [exampleDatasetType, setExampleDatasetType] = useState<ExampleUseCase>("chatbot");
  const [datasetTurnType, setDatasetTurnType] = useState<ExampleTurnType>("single-turn");

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

  const handleViewPrompts = async (dataset: BuiltInDataset) => {
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
        Record<string, unknown> | undefined;
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

  const handleRequestDelete = (dataset: BuiltInDataset) => {
    setDatasetToDelete(dataset);
    setDeleteModalOpen(true);
  };

  return {
    // RBAC
    canUploadDataset,
    canDeleteDataset,

    // Tabs
    activeTab,
    setActiveTab,

    // My datasets
    datasets,
    loading,
    searchTerm,
    setSearchTerm,
    filterColumns,
    handleFilterChange,
    handleDatasetsGroupChange,
    filteredDatasets,
    groupedDatasets,

    // Templates
    loadingTemplatesList,
    templateGroups,
    flattenedTemplates,
    templateFilterColumns,
    handleTemplateFilterChange,
    templateSearchTerm,
    setTemplateSearchTerm,
    filteredAndSortedTemplates,
    selectedTemplate,
    setSelectedTemplate,
    templatePrompts,
    loadingTemplatePrompts,
    copyingTemplate,
    templateDrawerOpen,
    handleViewTemplate,
    handleCloseTemplateDrawer,
    handleOpenCopyModal,
    copyModalOpen,
    setCopyModalOpen,
    templateToCopy,
    setTemplateToCopy,
    handleConfirmCopy,

    // Alert
    alert,
    setAlert,

    // Upload
    uploading,
    uploadModalOpen,
    setUploadModalOpen,
    fileInputRef,
    exampleDatasetType,
    setExampleDatasetType,
    datasetTurnType,
    setDatasetTurnType,
    handleUploadClick,
    handleFileSelect,
    handleFileChange,

    // Preview drawer
    drawerOpen,
    selectedDataset,
    datasetPrompts,
    loadingPrompts,
    handleViewPrompts,
    handleCloseDrawer,

    // Delete
    deleteModalOpen,
    setDeleteModalOpen,
    datasetToDelete,
    setDatasetToDelete,
    handleConfirmDelete,
    handleRequestDelete,

    // Editor
    editorOpen,
    setEditorOpen,
    editingDataset,
    setEditingDataset,
    editablePrompts,
    setEditablePrompts,
    editDatasetName,
    setEditDatasetName,
    savingDataset,
    loadingEditor,
    copiedJson,
    setCopiedJson,
    isValidToSave,
    promptDrawerOpen,
    setPromptDrawerOpen,
    selectedPromptIndex,
    setSelectedPromptIndex,
    handleOpenInEditor,
    handleCloseEditor,
    handleSaveDataset,
    handleAddPrompt,
    handleDeletePrompt,
    handleRowClick,
    handleDownloadDataset,

    // Create modals
    createDatasetModalOpen,
    setCreateDatasetModalOpen,
    createTypeSelectionOpen,
    setCreateTypeSelectionOpen,
  };
}
