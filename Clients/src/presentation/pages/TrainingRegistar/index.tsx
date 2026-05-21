import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, Stack, Fade } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { logEngine } from "../../../application/tools/log.engine";
import {
  getAllEntities,
  deleteEntityById,
  getEntityById,
  updateEntityById,
} from "../../../application/repository/entity.repository";

// Import the table and modal components specific to Training
import TrainingTable from "./trainingTable";
import NewTraining from "../../../presentation/components/Modals/NewTraining";
import { createTraining } from "../../../application/repository/trainingregistar.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { SearchBox } from "../../components/Search";
import PageTour from "../../components/PageTour";
import TrainingSteps from "./TrainingSteps";
import {
  TrainingRegistarModel,
  TrainingRegistarDTO,
} from "../../../domain/models/Common/trainingRegistar/trainingRegistar.model";
import { GroupBy } from "../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { ExportMenu } from "../../components/Table/ExportMenu";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import TabBar from "../../components/TabBar";
import EvidenceHubTable from "../ModelInventory/evidenceHubTable";
import NewTrainingEvidence from "../../../presentation/components/Modals/NewTrainingEvidence";
import { EvidenceHubModel } from "../../../domain/models/Common/evidenceHub/evidenceHub.model";
import { createEvidenceHub } from "../../../application/repository/evidenceHub.repository";
import { FilePreviewPanel } from "../FileManager/components/FilePreviewPanel";
import { FileMetadata } from "../../../application/repository/file.repository";
import { User } from "../../../domain/types/User";

import Alert from "../../../presentation/components/Alert";

// Types (Type Safety)
type AlertVariant = "success" | "info" | "warning" | "error";

interface AlertState {
  variant: AlertVariant;
  title?: string;
  body: string;
}

// Utility: Map TrainingRegistarModel to form data DTO (DRY)
// Returns complete DTO (id is already optional in DTO definition)
const mapTrainingToFormData = (training: TrainingRegistarModel): TrainingRegistarDTO => {
  return {
    training_name: training.training_name,
    duration: training.duration,
    provider: training.provider,
    department: training.department,
    status: training.status,
    numberOfPeople: training.numberOfPeople,
    description: training.description,
  };
};

// Utility: Show alert with auto-dismiss (DRY)
const createAlert = (variant: AlertVariant, body: string, title?: string): AlertState => ({
  variant,
  body,
  title,
});

// Year-first format ("2026 Q1") keeps chronological order under localeCompare.
const getQuarterLabel = (raw: unknown): string => {
  if (!raw) return "Undated";
  const d = new Date(raw as string | number | Date);
  if (Number.isNaN(d.getTime())) return "Undated";
  const quarter = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()} Q${quarter}`;
};

// Column type for Training table
type TrainingColumn =
  | "training_name"
  | "duration"
  | "provider"
  | "department"
  | "status"
  | "numberOfPeople"
  | "actions";

const TRAINING_COLUMNS: ColumnConfig<TrainingColumn>[] = [
  { key: "training_name", label: "Training name", defaultVisible: true, alwaysVisible: true },
  { key: "duration", label: "Duration", defaultVisible: true },
  { key: "provider", label: "Provider", defaultVisible: true },
  { key: "department", label: "Department", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "numberOfPeople", label: "People", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

type EvidenceColumn =
  | "evidence_name"
  | "evidence_type"
  | "mapped_trainings"
  | "uploaded_by"
  | "uploaded_on"
  | "expiry_date"
  | "actions";

const EVIDENCE_COLUMNS: ColumnConfig<EvidenceColumn>[] = [
  { key: "evidence_name", label: "Evidence name", defaultVisible: true, alwaysVisible: true },
  { key: "evidence_type", label: "Type", defaultVisible: true },
  { key: "mapped_trainings", label: "Mapped trainings", defaultVisible: true },
  { key: "uploaded_by", label: "Uploaded by", defaultVisible: true },
  { key: "uploaded_on", label: "Uploaded on", defaultVisible: true },
  { key: "expiry_date", label: "Expiry", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

type TrainingTab = "trainings" | "evidence-hub";

const getTabFromPath = (pathname: string): TrainingTab => {
  if (pathname.includes("/evidence-hub")) return "evidence-hub";
  return "trainings";
};

const Training: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [trainingData, setTrainingData] = useState<TrainingRegistarModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewTrainingModalOpen, setIsNewTrainingModalOpen] = useState(false);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null);
  const [selectedTraining, setSelectedTraining] = useState<TrainingRegistarModel | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  const { userRoleName } = useAuth();
  // Assuming a similar permission structure for 'training' as 'vendors'
  const isCreatingDisabled = !userRoleName || !["Admin", "Editor"].includes(userRoleName); // Example permission check
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Column visibility
  const { visibleColumns, allColumns, toggleColumn, resetToDefaults } =
    useColumnVisibility<TrainingColumn>({
      tableId: "training-registry-table",
      columns: TRAINING_COLUMNS,
    });

  // Evidence tab column visibility
  const {
    visibleColumns: evidenceVisibleColumns,
    allColumns: evidenceAllColumns,
    toggleColumn: evidenceToggleColumn,
    resetToDefaults: evidenceResetToDefaults,
  } = useColumnVisibility<EvidenceColumn>({
    tableId: "training-evidence-hub-table",
    columns: EVIDENCE_COLUMNS,
  });

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // GroupBy state - evidence tab
  const {
    groupBy: groupByEvidence,
    groupSortOrder: groupSortOrderEvidence,
    handleGroupChange: handleGroupChangeEvidence,
  } = useGroupByState();

  // Tabs
  const [activeTab, setActiveTab] = useState<TrainingTab>(() => getTabFromPath(location.pathname));

  useEffect(() => {
    setActiveTab(getTabFromPath(location.pathname));
  }, [location.pathname]);

  const handleTabChange = (_e: React.SyntheticEvent, newValue: string) => {
    const next = newValue as TrainingTab;
    setActiveTab(next);
    if (next === "trainings") {
      navigate("/training");
    } else if (next === "evidence-hub") {
      navigate("/training/evidence-hub");
    }
  };

  // Evidence tab state
  const [evidenceHubData, setEvidenceHubData] = useState<EvidenceHubModel[]>([]);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [isEvidenceHubModalOpen, setIsEvidenceHubModalOpen] = useState(false);
  const [selectedEvidenceHub, setSelectedEvidenceHub] = useState<EvidenceHubModel | null>(null);
  const [deletingEvidenceId, setDeletingEvidenceId] = useState<number | null>(null);
  const [evidenceSearchTerm, setEvidenceSearchTerm] = useState("");
  const [evidenceUsers, setEvidenceUsers] = useState<User[]>([]);
  const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
  const [previewFiles, setPreviewFiles] = useState<FileMetadata[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [isEvidencePreviewOpen, setIsEvidencePreviewOpen] = useState(false);

  const fetchTrainingData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getAllEntities({ routeUrl: "/training" });
      if (response?.data) {
        setTrainingData(response.data);
      }
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to fetch training data: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to load training data. Please try again later.",
      });
      setShowAlert(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  const fetchEvidenceData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsEvidenceLoading(true);
    try {
      const response = await getAllEntities({ routeUrl: "/evidenceHub" });
      if (response?.data) {
        const trainingScoped = (response.data as EvidenceHubModel[]).filter(
          (e) => Array.isArray(e.mapped_training_ids) && e.mapped_training_ids.length > 0,
        );
        setEvidenceHubData(trainingScoped);
      }
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to fetch evidence data: ${error}`,
      });
    } finally {
      if (showLoading) setIsEvidenceLoading(false);
    }
  }, []);

  const fetchEvidenceUsers = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      if (response?.data) setEvidenceUsers(response.data);
    } catch (error) {
      logEngine({ type: "error", message: `Failed to fetch users: ${error}` });
    }
  }, []);

  useEffect(() => {
    if (activeTab === "evidence-hub") {
      fetchEvidenceData();
      fetchEvidenceUsers();
    }
  }, [activeTab, fetchEvidenceData, fetchEvidenceUsers]);

  // Evidence handlers
  const handleNewUploadEvidenceClick = useCallback(() => {
    setSelectedEvidenceHub(null);
    setIsEvidenceHubModalOpen(true);
  }, []);

  const handleEditEvidence = useCallback(async (id: number) => {
    try {
      const response = await getEntityById({ routeUrl: `/evidenceHub/${id}` });
      if (response?.data) {
        setSelectedEvidenceHub(response.data);
        setIsEvidenceHubModalOpen(true);
      }
    } catch (error) {
      logEngine({ type: "error", message: `Failed to load evidence: ${error}` });
      setAlert({
        variant: "error",
        body: "Failed to load evidence details. Please try again.",
      });
    }
  }, []);

  const handleDeleteEvidence = useCallback(
    async (id: number) => {
      try {
        setDeletingEvidenceId(id);
        await deleteEntityById({ routeUrl: `/evidenceHub/${id}` });
        await fetchEvidenceData(false);
        setAlert({ variant: "success", body: "Evidence deleted successfully!" });
      } catch (error) {
        logEngine({ type: "error", message: `Failed to delete evidence: ${error}` });
        setAlert({ variant: "error", body: "Failed to delete evidence. Please try again." });
      } finally {
        setDeletingEvidenceId(null);
      }
    },
    [fetchEvidenceData],
  );

  const handleCloseEvidenceModal = useCallback(() => {
    setIsEvidenceHubModalOpen(false);
    setSelectedEvidenceHub(null);
  }, []);

  const handleEvidenceUploadSuccess = useCallback(
    async (formData: EvidenceHubModel) => {
      try {
        if (selectedEvidenceHub) {
          await updateEntityById({
            routeUrl: `/evidenceHub/${selectedEvidenceHub.id}`,
            body: formData,
          });
          setAlert({ variant: "success", body: "Evidence updated successfully!" });
        } else {
          await createEvidenceHub("/evidenceHub", formData);
          setAlert({ variant: "success", body: "New evidence added successfully!" });
        }
        await fetchEvidenceData(false);
        setSelectedEvidenceHub(null);
        setIsEvidenceHubModalOpen(false);
      } catch (error) {
        logEngine({ type: "error", message: `Failed to save evidence: ${error}` });
        setAlert({
          variant: "error",
          body: selectedEvidenceHub
            ? "Failed to update evidence. Please try again."
            : "Failed to add new evidence. Please try again.",
        });
      }
    },
    [selectedEvidenceHub, fetchEvidenceData],
  );

  const handlePreviewEvidence = useCallback(
    (id: number, fileIndex: number = 0) => {
      const evidence = evidenceHubData.find((e) => e.id === id);
      const rawFiles: any[] = Array.isArray(evidence?.evidence_files)
        ? (evidence!.evidence_files as any[])
        : [];
      if (rawFiles.length === 0) {
        setAlert({
          variant: "info",
          body: "This evidence has no file attached to preview.",
        });
        return;
      }
      const fileMetas: FileMetadata[] = rawFiles.map((rawFile) => {
        const filename = rawFile.filename ?? rawFile.fileName;
        const uploadDate = rawFile.upload_date ?? rawFile.uploaded_time;
        const sizeRaw = rawFile.size;
        const size = typeof sizeRaw === "string" ? parseInt(sizeRaw, 10) || 0 : (sizeRaw ?? 0);
        const mimetype: string | undefined = rawFile.mimetype;
        const uploader = evidenceUsers.find(
          (u: any) => String(u.id) === String(rawFile.uploaded_by),
        );
        return {
          id: String(rawFile.id),
          filename: filename || "Unknown file",
          size,
          mimetype: mimetype || "application/octet-stream",
          upload_date: uploadDate,
          uploaded_by: String(rawFile.uploaded_by),
          uploader_name: uploader?.name,
          uploader_surname: uploader?.surname,
          tags: evidence?.tags,
          expiry_date: evidence?.expiry_date
            ? new Date(evidence.expiry_date).toISOString()
            : undefined,
          description: evidence?.description ?? undefined,
        };
      });
      const safeIndex = Math.max(0, Math.min(fileIndex, fileMetas.length - 1));
      setPreviewFiles(fileMetas);
      setPreviewIndex(safeIndex);
      setPreviewFile(fileMetas[safeIndex]);
      setIsEvidencePreviewOpen(true);
    },
    [evidenceHubData, evidenceUsers],
  );

  const handleCloseEvidencePreview = useCallback(() => {
    setIsEvidencePreviewOpen(false);
    setPreviewFile(null);
    setPreviewFiles([]);
    setPreviewIndex(0);
  }, []);

  useEffect(() => {
    if (alert) {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300); // Wait for fade out animation
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Check for openCreateModal state from navigation
  useEffect(() => {
    const state = location.state as { openCreateModal?: boolean } | null;
    if (state?.openCreateModal) {
      setIsNewTrainingModalOpen(true);
      // Clear the state to prevent modal from opening again on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Dependencies: location contains state from mega dropdown navigation, navigate used for state clearing
  }, [location, navigate]);

  // Handle trainingId URL param to open edit modal from Wise Search
  useEffect(() => {
    const trainingId = searchParams.get("trainingId");
    if (trainingId && !hasProcessedUrlParam.current && !isLoading) {
      hasProcessedUrlParam.current = true;
      // Use existing handleEditTraining pattern which fetches details and opens modal
      handleEditTraining(trainingId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, isLoading, setSearchParams]);

  const handleNewTrainingClick = () => {
    setIsNewTrainingModalOpen(true);
  };

  const handleEditTraining = (id: string) => {
    setSelectedTrainingId(id);
    setIsNewTrainingModalOpen(true);
  };
  // Fetch training data when modal opens with an ID
  useEffect(() => {
    const fetchTrainingDetails = async () => {
      if (selectedTrainingId && isNewTrainingModalOpen) {
        try {
          const response = await getEntityById({
            routeUrl: `/training/training-id/${selectedTrainingId}`,
          });
          if (response?.data) {
            setSelectedTraining(response.data);
          }
        } catch (error) {
          logEngine({
            type: "error",
            message: `Failed to fetch training details: ${error}`,
          });
          setAlert({
            variant: "error",
            body: "This training no longer exists or you do not have access to it.",
          });
          setIsNewTrainingModalOpen(false);
          setSelectedTrainingId(null);
        }
      }
    };

    fetchTrainingDetails();
  }, [selectedTrainingId, isNewTrainingModalOpen]);

  const handleCloseModal = () => {
    setIsNewTrainingModalOpen(false);
    setSelectedTraining(null);
    setSelectedTrainingId(null);
  };

  // Handler: Create/Update training with proper typing and defensive programming
  // ENTERPRISE: Handle response differences between create/update APIs
  // Returns Promise<boolean>: true on success, false on failure
  // Uses DTO for data transfer (plain object), not Model (class instance)
  // Receives complete DTO after form validation (all required fields validated)
  const handleTrainingSuccess = useCallback(
    async (formData: TrainingRegistarDTO): Promise<boolean> => {
      try {
        // DEFENSIVE: formData already has numberOfPeople from model
        // Server expects numberOfPeople (controller maps it to 'people' for DB)
        let payload: TrainingRegistarModel | undefined;
        let successMessage: string;

        if (selectedTraining) {
          // Defensive: Ensure training has an ID before updating
          if (!selectedTraining.id) {
            logEngine({
              type: "error",
              message: "Cannot update training without ID",
            });
            setAlert(createAlert("error", "Cannot update training: Missing ID"));
            return false;
          }

          // Update existing training
          const res = await updateEntityById({
            routeUrl: `/training/${selectedTraining.id}`,
            body: formData,
          });
          // DEFENSIVE: updateEntityById returns AxiosResponse, extract data
          payload = res?.data;
          successMessage = "Training updated successfully!";
        } else {
          // Create new training
          // DEFENSIVE: createTraining returns response.data directly
          const created = await createTraining("/training", formData);
          payload = created;
          successMessage = "Training created successfully!";
        }

        // Defensive: Check response validity
        if (payload) {
          setAlert(createAlert("success", successMessage));
          await fetchTrainingData();
          handleCloseModal();
          return true;
        } else {
          // API returned but without data - unexpected state
          logEngine({
            type: "error",
            message: "API response missing data",
          });
          setAlert(
            createAlert(
              "error",
              selectedTraining
                ? "Failed to update training. Please try again."
                : "Failed to create training. Please try again.",
            ),
          );
          return false;
        }
      } catch (error) {
        logEngine({
          type: "error",
          message: `Failed to ${selectedTraining ? "update" : "create"} training: ${error}`,
        });
        setAlert(
          createAlert(
            "error",
            selectedTraining
              ? "Failed to update training. Please try again."
              : "Failed to create training. Please try again.",
          ),
        );
        return false;
      }
    },
    [selectedTraining, fetchTrainingData],
  );

  const handleDeleteTraining = async (id: string) => {
    try {
      await deleteEntityById({ routeUrl: `/training/${id}` });
      await fetchTrainingData();
      setAlert({
        variant: "success",
        body: "Training deleted successfully!",
      });
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to delete training: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to delete training. Please try again.",
      });
    }
  };

  // FilterBy - Dynamic options generators
  const getUniqueProviders = useCallback(() => {
    const providers = new Set<string>();
    trainingData.forEach((training) => {
      if (training.provider) {
        providers.add(training.provider);
      }
    });
    return Array.from(providers)
      .sort()
      .map((provider) => ({
        value: provider,
        label: provider,
      }));
  }, [trainingData]);

  const getUniqueDepartments = useCallback(() => {
    const departments = new Set<string>();
    trainingData.forEach((training) => {
      if (training.department) {
        departments.add(training.department);
      }
    });
    return Array.from(departments)
      .sort()
      .map((department) => ({
        value: department,
        label: department,
      }));
  }, [trainingData]);

  // FilterBy - Filter columns configuration
  const trainingFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "training_name",
        label: "Training name",
        type: "text" as const,
      },
      {
        id: "status",
        label: "Status",
        type: "select" as const,
        options: [
          { value: "Planned", label: "Planned" },
          { value: "In Progress", label: "In progress" },
          { value: "Completed", label: "Completed" },
        ],
      },
      {
        id: "provider",
        label: "Provider",
        type: "select" as const,
        options: getUniqueProviders(),
      },
      {
        id: "department",
        label: "Department",
        type: "select" as const,
        options: getUniqueDepartments(),
      },
      {
        id: "duration",
        label: "Duration",
        type: "text" as const,
      },
    ],
    [getUniqueProviders, getUniqueDepartments],
  );

  // FilterBy - Field value getter
  const getTrainingFieldValue = useCallback(
    (item: TrainingRegistarModel, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "training_name":
          return item.training_name;
        case "status":
          return item.status;
        case "provider":
          return item.provider;
        case "department":
          return item.department;
        case "duration":
          return item.duration;
        default:
          return null;
      }
    },
    [],
  );

  // FilterBy - Initialize hook
  const { filterData: filterTrainingData, handleFilterChange: handleTrainingFilterChange } =
    useFilterBy<TrainingRegistarModel>(getTrainingFieldValue);

  // Evidence filter
  const evidenceFilterColumns: FilterColumn[] = useMemo(() => {
    const uniqueTypes = new Set<string>();
    evidenceHubData.forEach((e) => {
      if (e.evidence_type) uniqueTypes.add(e.evidence_type);
    });
    return [
      { id: "evidence_name", label: "Evidence name", type: "text" as const },
      {
        id: "evidence_type",
        label: "Type",
        type: "select" as const,
        options: Array.from(uniqueTypes)
          .sort()
          .map((t) => ({ value: t, label: t })),
      },
    ];
  }, [evidenceHubData]);

  const getEvidenceFieldValue = useCallback(
    (item: EvidenceHubModel, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "evidence_name":
          return item.evidence_name;
        case "evidence_type":
          return item.evidence_type;
        default:
          return null;
      }
    },
    [],
  );

  const { filterData: filterEvidenceData, handleFilterChange: handleEvidenceFilterChange } =
    useFilterBy<EvidenceHubModel>(getEvidenceFieldValue);

  // Filtered trainings using FilterBy and search
  const filteredTraining = useMemo(() => {
    // First apply FilterBy conditions
    let result = filterTrainingData(trainingData);

    // Apply search filter last
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter((training) => {
        const trainingName = training.training_name?.toLowerCase() ?? "";
        return trainingName.includes(search);
      });
    }

    return result;
  }, [filterTrainingData, trainingData, searchTerm]);

  // Define how to get the group key for each training
  const getTrainingGroupKey = (
    training: TrainingRegistarModel,
    field: string,
  ): string | string[] => {
    switch (field) {
      case "status":
        return training.status || "Unknown Status";
      case "provider":
        return training.provider || "Unknown Provider";
      case "department":
        return training.department || "Unknown Department";
      case "quarter": {
        // created_at is included in the API response but absent from the client model class.
        const raw =
          (training as any).created_at ?? (training as any).createdAt ?? (training as any).created;
        return getQuarterLabel(raw);
      }
      default:
        return "Other";
    }
  };

  // Apply grouping to filtered training data
  const groupedTraining = useTableGrouping({
    data: filteredTraining,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getTrainingGroupKey,
  });

  // Filter + group evidence
  const filteredEvidence = useMemo(() => {
    let result = filterEvidenceData(evidenceHubData);
    if (evidenceSearchTerm.trim()) {
      const q = evidenceSearchTerm.toLowerCase();
      result = result.filter(
        (e) =>
          (e.evidence_name || "").toLowerCase().includes(q) ||
          (e.evidence_type || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [filterEvidenceData, evidenceHubData, evidenceSearchTerm]);

  const trainingNameById = useMemo(() => {
    const map = new Map<number, string>();
    trainingData.forEach((t) => {
      const idNum = typeof t.id === "string" ? Number(t.id) : t.id;
      if (typeof idNum === "number" && !Number.isNaN(idNum)) {
        map.set(idNum, t.training_name || `Training ${idNum}`);
      }
    });
    return map;
  }, [trainingData]);

  const getEvidenceGroupKey = useCallback(
    (item: EvidenceHubModel, field: string): string | string[] => {
      switch (field) {
        case "evidence_type":
          return item.evidence_type || "Unknown type";
        case "training": {
          const ids = item.mapped_training_ids || [];
          if (ids.length === 0) return "Unmapped";
          return ids.map((id) => trainingNameById.get(id) || `Training ${id}`);
        }
        default:
          return "Other";
      }
    },
    [trainingNameById],
  );

  const groupedEvidence = useTableGrouping({
    data: filteredEvidence,
    groupByField: groupByEvidence,
    sortOrder: groupSortOrderEvidence,
    getGroupKey: getEvidenceGroupKey,
  });

  // Define export columns for training table
  const exportColumns = useMemo(() => {
    return [
      { id: "training_name", label: "Training name" },
      { id: "duration", label: "Duration" },
      { id: "provider", label: "Provider" },
      { id: "department", label: "Department" },
      { id: "status", label: "Status" },
      { id: "numberOfPeople", label: "People" },
    ];
  }, []);

  // Prepare export data - format the data for export
  const exportData = useMemo(() => {
    return filteredTraining.map((training: TrainingRegistarModel) => {
      return {
        training_name: training.training_name || "-",
        duration: training.duration || "-",
        provider: training.provider || "-",
        department: training.department || "-",
        status: training.status || "-",
        numberOfPeople: training.numberOfPeople?.toString() || "-",
      };
    });
  }, [filteredTraining]);

  // Evidence export
  const evidenceExportColumns = useMemo(() => {
    return [
      { id: "evidence_name", label: "Evidence name" },
      { id: "evidence_type", label: "Type" },
      { id: "mapped_trainings", label: "Mapped trainings" },
      { id: "expiry_date", label: "Expiry" },
    ];
  }, []);

  const evidenceExportData = useMemo(() => {
    return filteredEvidence.map((e) => ({
      evidence_name: e.evidence_name || "-",
      evidence_type: e.evidence_type || "-",
      mapped_trainings: e.mapped_training_ids?.length
        ? e.mapped_training_ids.map((id) => trainingNameById.get(id) || `Training ${id}`).join(", ")
        : "-",
      expiry_date: e.expiry_date ? new Date(e.expiry_date as any).toLocaleDateString() : "-",
    }));
  }, [filteredEvidence, trainingNameById]);

  return (
    <PageHeaderExtended
      title="AI Training Registry"
      description="This registry lists all AI-related training programs available to your organization. You can view, add, and manage training details here."
      helpArticlePath="training/training-tracking"
      tipBoxEntity="training"
      alert={
        alert && (
          <Fade
            in={showAlert}
            timeout={300}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1000,
            }}
          >
            <Box mb={2}>
              <Alert
                variant={alert.variant}
                title={alert.title}
                body={alert.body}
                isToast={true}
                onClick={() => {
                  setShowAlert(false);
                  setTimeout(() => setAlert(null), 300);
                }}
              />
            </Box>
          </Fade>
        )
      }
    >
      <TabContext value={activeTab}>
        <Box sx={{ marginBottom: 3 }}>
          <TabBar
            tabs={[
              {
                label: "Trainings",
                value: "trainings",
                icon: "Box",
                count: trainingData.length,
                isLoading: isLoading,
                tooltip: "All AI-related training programs",
              },
              {
                label: "Evidence hub",
                value: "evidence-hub",
                icon: "Database" as const,
                count: evidenceHubData.length,
                isLoading: isEvidenceLoading,
                tooltip: "Compliance evidence linked to trainings",
              },
            ]}
            activeTab={activeTab}
            onChange={handleTabChange}
            dataJoyrideId="training-tabs"
          />
        </Box>
      </TabContext>

      {activeTab === "trainings" && (
        <>
          {/* Filter + Search row */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ gap: "20px" }}
          >
            {/* Left side: FilterBy, GroupBy, Search */}
            <Stack direction="row" spacing={2} alignItems="center">
              <FilterBy
                columns={trainingFilterColumns}
                onFilterChange={handleTrainingFilterChange}
              />

              <GroupBy
                options={[
                  { id: "status", label: "Status" },
                  { id: "provider", label: "Provider" },
                  { id: "department", label: "Department" },
                  { id: "quarter", label: "Quarter (year)" },
                ]}
                onGroupChange={handleGroupChange}
              />

              <ColumnSelector
                columns={allColumns}
                visibleColumns={visibleColumns}
                onToggleColumn={toggleColumn}
                onResetToDefaults={resetToDefaults}
              />

              <SearchBox
                placeholder="Search trainings..."
                value={searchTerm}
                onChange={setSearchTerm}
                inputProps={{ "aria-label": "Search trainings" }}
                fullWidth={false}
              />
            </Stack>

            {/* Right side: Export and Add Button */}
            <Stack direction="row" gap="8px" alignItems="center">
              <ExportMenu
                data={exportData}
                columns={exportColumns}
                filename="training-registry"
                title="Training Registry"
              />
              <Box data-joyride-id="add-training-button">
                <CustomizableButton
                  variant="contained"
                  sx={{
                    backgroundColor: "brand.primary",
                    border: "1px solid brand.primary",
                    gap: 2,
                  }}
                  text="New training"
                  icon={<AddCircleOutlineIcon size={16} />}
                  onClick={handleNewTrainingClick}
                  isDisabled={isCreatingDisabled}
                />
              </Box>
            </Stack>
          </Stack>

          {/* Table */}
          <GroupedTableView
            groupedData={groupedTraining}
            ungroupedData={filteredTraining}
            renderTable={(data, options) => (
              <TrainingTable
                data={data}
                isLoading={isLoading}
                onEdit={handleEditTraining}
                onDelete={handleDeleteTraining}
                hidePagination={options?.hidePagination}
                visibleColumns={visibleColumns as Set<string>}
              />
            )}
          />
        </>
      )}

      {activeTab === "evidence-hub" && (
        <>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ gap: "20px" }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <FilterBy
                columns={evidenceFilterColumns}
                onFilterChange={handleEvidenceFilterChange}
              />
              <GroupBy
                options={[
                  { id: "evidence_type", label: "Evidence type" },
                  { id: "training", label: "Training" },
                ]}
                onGroupChange={handleGroupChangeEvidence}
              />
              <ColumnSelector
                columns={evidenceAllColumns}
                visibleColumns={evidenceVisibleColumns}
                onToggleColumn={evidenceToggleColumn}
                onResetToDefaults={evidenceResetToDefaults}
              />
              <SearchBox
                placeholder="Search evidence..."
                value={evidenceSearchTerm}
                onChange={setEvidenceSearchTerm}
                inputProps={{ "aria-label": "Search evidence" }}
                fullWidth={false}
              />
            </Stack>

            <Stack direction="row" gap="8px" alignItems="center">
              <ExportMenu
                data={evidenceExportData}
                columns={evidenceExportColumns}
                filename="training-evidence-hub"
                title="Training Evidence Hub"
              />
              <CustomizableButton
                variant="contained"
                sx={{
                  backgroundColor: "brand.primary",
                  border: "1px solid brand.primary",
                  gap: 2,
                }}
                text="Upload evidence"
                icon={<AddCircleOutlineIcon size={16} />}
                onClick={handleNewUploadEvidenceClick}
                isDisabled={isCreatingDisabled}
              />
            </Stack>
          </Stack>

          <GroupedTableView
            groupedData={groupedEvidence}
            ungroupedData={filteredEvidence}
            renderTable={(data, options) => (
              <EvidenceHubTable
                data={data}
                isLoading={isEvidenceLoading}
                onEdit={handleEditEvidence}
                onDelete={handleDeleteEvidence}
                onPreview={handlePreviewEvidence}
                modelInventoryData={[]}
                trainingData={trainingData as any}
                deletingId={deletingEvidenceId}
                hidePagination={options?.hidePagination}
                visibleColumns={evidenceVisibleColumns as Set<string>}
              />
            )}
          />
        </>
      )}

      {/* Modal */}
      <NewTraining
        isOpen={isNewTrainingModalOpen}
        setIsOpen={handleCloseModal}
        onSuccess={handleTrainingSuccess}
        initialData={selectedTraining ? mapTrainingToFormData(selectedTraining) : undefined}
        isEdit={!!selectedTraining}
        entityId={selectedTraining?.id ? Number(selectedTraining.id) : undefined}
      />

      <NewTrainingEvidence
        isOpen={isEvidenceHubModalOpen}
        setIsOpen={handleCloseEvidenceModal}
        onSuccess={handleEvidenceUploadSuccess}
        initialData={selectedEvidenceHub || undefined}
        isEdit={!!selectedEvidenceHub}
      />

      <FilePreviewPanel
        isOpen={isEvidencePreviewOpen}
        onClose={handleCloseEvidencePreview}
        file={previewFile}
        files={previewFiles}
        currentIndex={previewIndex}
        onNavigate={(newIndex: number) => {
          if (newIndex < 0 || newIndex >= previewFiles.length) return;
          setPreviewIndex(newIndex);
          setPreviewFile(previewFiles[newIndex]);
        }}
      />

      <PageTour steps={TrainingSteps} run={true} tourKey="training-tour" />
    </PageHeaderExtended>
  );
};

export default Training;
