/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useEffect,
  Suspense,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Box,
  Stack,
  Fade,
  Modal,
  Typography,
  useTheme,
  IconButton,
} from "@mui/material";
import { CirclePlus as AddCircleOutlineIcon, BarChart3 } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { CustomizableButton } from "../../components/button/customizable-button";
import { logEngine } from "../../../application/tools/log.engine";
import {
  getAllEntities,
  deleteEntityById,
  getEntityById,
  updateEntityById,
  createNewUser,
} from "../../../application/repository/entity.repository";
import { createModelInventory } from "../../../application/repository/modelInventory.repository";
import { getShareLinksForResource } from "../../../application/repository/share.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import { usePluginRegistry } from "../../../application/contexts/PluginRegistry.context";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";
import { PluginSlot } from "../../components/PluginSlot";
import { apiServices } from "../../../infrastructure/api/networkServices";
// Import the table and modal components specific to ModelInventory
import ModelInventoryTable from "./modelInventoryTable";
// Note: LifecycleConfigEditor is now provided by the model-lifecycle plugin via plugin slots
import { IModelInventory } from "../../../domain/interfaces/i.modelInventory";
import NewModelInventory from "../../components/Modals/NewModelInventory";
import ModelRisksTable from "./ModelRisksTable";
import {
  IModelRisk,
  IModelRiskFormData,
  ModelRiskLevel,
} from "../../../domain/interfaces/i.modelRisk";
import NewModelRisk from "../../components/Modals/NewModelRisk";
import ModelInventorySummary from "./ModelInventorySummary";
import ModelRiskSummary from "./ModelRiskSummary";
import AnalyticsDrawer from "../../components/AnalyticsDrawer";
import PageTour from "../../components/PageTour";
import ModelInventorySteps from "./ModelInventorySteps";
import {
  mainStackStyle,
  filterButtonRowStyle,
  toastFadeStyle,
  statusFilterSelectStyle,
  addNewModelButtonStyle,
} from "./style";
import { ModelInventorySummary as Summary } from "../../../domain/interfaces/i.modelInventory";
import SelectComponent from "../../components/Inputs/Select";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import TabContext from "@mui/lab/TabContext";
import { SearchBox } from "../../components/Search";
import TabBar from "../../components/TabBar";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";
import { EvidenceHubModel } from "../../../domain/models/Common/evidenceHub/evidenceHub.model";
import NewEvidenceHub from "../../components/Modals/EvidenceHub";
import { createEvidenceHub } from "../../../application/repository/evidenceHub.repository";
import EvidenceHubTable from "./evidenceHubTable";
import ShareButton from "../../components/ShareViewDropdown/ShareButton";
import ShareViewDropdown, {
  ShareViewSettings,
} from "../../components/ShareViewDropdown";
import {
  useCreateShareLink,
  useUpdateShareLink,
} from "../../../application/hooks/useShare";
import { GroupBy } from "../../components/Table/GroupBy";
import {
  useTableGrouping,
  useGroupByState,
} from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { ExportMenu } from "../../components/Table/ExportMenu";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import { palette } from "../../themes/palette";

const Alert = React.lazy(() => import("../../components/Alert"));

// Constants
const REDIRECT_DELAY_MS = 2000;

// Column visibility management for Models tab
type ModelInventoryColumn =
  | "provider"
  | "model"
  | "version"
  | "approver"
  | "security_assessment"
  | "risks"
  | "status"
  | "status_date"
  | "actions";

const MODEL_INVENTORY_COLUMNS: ColumnConfig<ModelInventoryColumn>[] = [
  { key: "provider", label: "Provider", defaultVisible: true, alwaysVisible: true },
  { key: "model", label: "Model", defaultVisible: true, alwaysVisible: true },
  { key: "version", label: "Version", defaultVisible: true },
  { key: "approver", label: "Approver", defaultVisible: true },
  { key: "security_assessment", label: "Assessment", defaultVisible: true },
  { key: "risks", label: "Risks", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "status_date", label: "Status date", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

// Column visibility management for Model Risks tab
type ModelRiskColumn =
  | "risk_name"
  | "model_name"
  | "risk_level"
  | "status"
  | "owner"
  | "target_date"
  | "actions";

const MODEL_RISK_COLUMNS: ColumnConfig<ModelRiskColumn>[] = [
  { key: "risk_name", label: "Risk name", defaultVisible: true, alwaysVisible: true },
  { key: "model_name", label: "Model name", defaultVisible: true },
  { key: "risk_level", label: "Risk level", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "owner", label: "Owner", defaultVisible: true },
  { key: "target_date", label: "Next review date", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

// Column visibility management for Evidence Hub tab
type EvidenceHubColumn =
  | "evidence_name"
  | "evidence_type"
  | "mapped_models"
  | "uploaded_by"
  | "uploaded_on"
  | "expiry_date"
  | "actions";

const EVIDENCE_HUB_COLUMNS: ColumnConfig<EvidenceHubColumn>[] = [
  { key: "evidence_name", label: "Evidence name", defaultVisible: true, alwaysVisible: true },
  { key: "evidence_type", label: "Type", defaultVisible: true },
  { key: "mapped_models", label: "Mapped models", defaultVisible: true },
  { key: "uploaded_by", label: "Uploaded by", defaultVisible: true },
  { key: "uploaded_on", label: "Uploaded on", defaultVisible: true },
  { key: "expiry_date", label: "Expiry", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const ModelInventory: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [modelInventoryData, setModelInventoryData] = useState<
    IModelInventory[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewModelInventoryModalOpen, setIsNewModelInventoryModalOpen] =
    useState(false);
  // Note: Lifecycle config is now provided by the model-lifecycle plugin via plugin slots

  const [selectedModelInventory, setSelectedModelInventory] =
    useState<IModelInventory | null>(null);

  // Model Risks state
  const [modelRisksData, setModelRisksData] = useState<IModelRisk[]>([]);
  const [isModelRisksLoading, setIsModelRisksLoading] = useState(false);
  const [isNewModelRiskModalOpen, setIsNewModelRiskModalOpen] = useState(false);
  const [selectedModelRiskId, setSelectedModelRiskId] = useState<number | null>(
    null
  );
  const [selectedModelRisk, setSelectedModelRisk] = useState<IModelRisk | null>(
    null
  );
  const [modelRiskStatusFilter, setModelRiskStatusFilter] = useState<
    "active" | "deleted" | "all"
  >("active");
  const [deletingModelRiskId, setDeletingModelRiskId] = useState<number | null>(
    null
  );
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [showAlert, setShowAlert] = useState(false);


  const { userRoleName } = useAuth();
  const isCreatingDisabled =
    !userRoleName || !["Admin", "Editor"].includes(userRoleName);
  const theme = useTheme();

  // Get plugin tabs dynamically from the plugin registry
  const { getPluginTabs } = usePluginRegistry();
  const pluginTabs = useMemo(
    () => getPluginTabs(PLUGIN_SLOTS.MODELS_TABS),
    [getPluginTabs]
  );

  // Share link mutations
  const createShareMutation = useCreateShareLink();
  const updateShareMutation = useUpdateShareLink();

  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  const [isAnalyticsDrawerOpen, setIsAnalyticsDrawerOpen] = useState(false);
  const [tableKey, setTableKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flashRowId, setFlashRowId] = useState<number | string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  const {
    visibleColumns: modelVisibleColumns,
    allColumns: modelAllColumns,
    toggleColumn: modelToggleColumn,
    resetToDefaults: modelResetToDefaults,
  } = useColumnVisibility<ModelInventoryColumn>({
    tableId: "model-inventory-table",
    columns: MODEL_INVENTORY_COLUMNS,
  });

  const {
    visibleColumns: riskVisibleColumns,
    allColumns: riskAllColumns,
    toggleColumn: riskToggleColumn,
    resetToDefaults: riskResetToDefaults,
  } = useColumnVisibility<ModelRiskColumn>({
    tableId: "model-risks-table",
    columns: MODEL_RISK_COLUMNS,
  });

  const {
    visibleColumns: evidenceVisibleColumns,
    allColumns: evidenceAllColumns,
    toggleColumn: evidenceToggleColumn,
    resetToDefaults: evidenceResetToDefaults,
  } = useColumnVisibility<EvidenceHubColumn>({
    tableId: "evidence-hub-table",
    columns: EVIDENCE_HUB_COLUMNS,
  });

  // GroupBy state - models tab
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // GroupBy state - model risks tab
  const {
    groupBy: groupByRisk,
    groupSortOrder: groupSortOrderRisk,
    handleGroupChange: handleGroupChangeRisk,
  } = useGroupByState();

  // GroupBy state - evidence hub tab
  const {
    groupBy: groupByEvidence,
    groupSortOrder: groupSortOrderEvidence,
    handleGroupChange: handleGroupChangeEvidence,
  } = useGroupByState();

  // Preselected model ID for evidence creation (used by change history feature)
  const [preselectedModelId, setPreselectedModelId] = useState<
    number | undefined
  >(undefined);

  // FilterBy - Dynamic options generators for Models tab
  const getUniqueProviders = useCallback(() => {
    const providers = new Set<string>();
    modelInventoryData.forEach((item) => {
      if (item.provider) {
        providers.add(item.provider);
      }
    });
    return Array.from(providers)
      .sort()
      .map((provider) => ({ value: provider, label: provider }));
  }, [modelInventoryData]);

  const getUniqueApprovers = useCallback(() => {
    const approverIds = new Set<string>();
    modelInventoryData.forEach((item) => {
      if (item.approver) {
        approverIds.add(item.approver.toString());
      }
    });
    return Array.from(approverIds)
      .sort()
      .map((approverId) => {
        const user = users.find((u: any) => u.id.toString() === approverId);
        const userName = user
          ? `${user.name} ${user.surname}`.trim()
          : `User ${approverId}`;
        return { value: approverId, label: userName };
      });
  }, [modelInventoryData, users]);

  // FilterBy - Filter columns configuration for Models tab
  const modelFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "status",
        label: "Status",
        type: "select" as const,
        options: [
          { value: ModelInventoryStatus.APPROVED, label: "Approved" },
          { value: ModelInventoryStatus.RESTRICTED, label: "Restricted" },
          { value: ModelInventoryStatus.PENDING, label: "Pending" },
          { value: ModelInventoryStatus.BLOCKED, label: "Blocked" },
        ],
      },
      {
        id: "provider",
        label: "Provider",
        type: "select" as const,
        options: getUniqueProviders(),
      },
      {
        id: "model",
        label: "Model name",
        type: "text" as const,
      },
      {
        id: "approver",
        label: "Approver",
        type: "select" as const,
        options: getUniqueApprovers(),
      },
      {
        id: "security_assessment",
        label: "Security assessment",
        type: "select" as const,
        options: [
          { value: "true", label: "Assessed" },
          { value: "false", label: "Not assessed" },
        ],
      },
    ],
    [getUniqueProviders, getUniqueApprovers]
  );

  // FilterBy - Field value getter for Models tab
  const getModelFieldValue = useCallback(
    (
      item: IModelInventory,
      fieldId: string
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "status":
          return item.status;
        case "provider":
          return item.provider;
        case "model":
          return item.model;
        case "approver":
          return item.approver?.toString();
        case "security_assessment":
          return item.security_assessment ? "true" : "false";
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook for Models tab
  const {
    filterData: filterModelData,
    handleFilterChange: handleModelFilterChange,
  } = useFilterBy<IModelInventory>(getModelFieldValue);

  // FilterBy - Dynamic options generators for Model Risks tab
  const getUniqueRiskOwners = useCallback(() => {
    const ownerIds = new Set<string>();
    modelRisksData.forEach((item) => {
      if (item.owner) {
        ownerIds.add(item.owner.toString());
      }
    });
    return Array.from(ownerIds)
      .sort()
      .map((ownerId) => {
        const user = users.find((u: any) => u.id.toString() === ownerId);
        const userName = user
          ? `${user.name} ${user.surname}`.trim()
          : `User ${ownerId}`;
        return { value: ownerId, label: userName };
      });
  }, [modelRisksData, users]);

  const getUniqueRiskModels = useCallback(() => {
    const modelIds = new Set<string>();
    modelRisksData.forEach((item) => {
      if (item.model_id) {
        modelIds.add(item.model_id.toString());
      }
    });
    return Array.from(modelIds)
      .sort()
      .map((modelId) => {
        const model = modelInventoryData.find(
          (m: any) => m.id.toString() === modelId
        );
        const modelName = model ? model.model : `Model ${modelId}`;
        return { value: modelId, label: modelName };
      });
  }, [modelRisksData, modelInventoryData]);

  // FilterBy - Filter columns configuration for Model Risks tab
  const modelRiskFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "risk_name",
        label: "Risk name",
        type: "text" as const,
      },
      {
        id: "model_id",
        label: "Model name",
        type: "select" as const,
        options: getUniqueRiskModels(),
      },
      {
        id: "risk_level",
        label: "Risk level",
        type: "select" as const,
        options: [
          { value: "Low", label: "Low" },
          { value: "Medium", label: "Medium" },
          { value: "High", label: "High" },
          { value: "Critical", label: "Critical" },
        ],
      },
      {
        id: "status",
        label: "Status",
        type: "select" as const,
        options: [
          { value: "Open", label: "Open" },
          { value: "In Progress", label: "In progress" },
          { value: "Resolved", label: "Resolved" },
          { value: "Accepted", label: "Accepted" },
        ],
      },
      {
        id: "owner",
        label: "Owner",
        type: "select" as const,
        options: getUniqueRiskOwners(),
      },
      {
        id: "target_date",
        label: "Target date",
        type: "date" as const,
      },
    ],
    [getUniqueRiskModels, getUniqueRiskOwners]
  );

  // FilterBy - Field value getter for Model Risks tab
  const getModelRiskFieldValue = useCallback(
    (
      item: IModelRisk,
      fieldId: string
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "risk_name":
          return item.risk_name;
        case "model_id":
          return item.model_id?.toString();
        case "risk_level":
          return item.risk_level;
        case "status":
          return item.status;
        case "owner":
          return item.owner?.toString();
        case "target_date":
          return item.target_date;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook for Model Risks tab
  const {
    filterData: filterModelRiskData,
    handleFilterChange: handleModelRiskFilterChange,
  } = useFilterBy<IModelRisk>(getModelRiskFieldValue);

  const [evidenceHubData, setEvidenceHubData] = useState<EvidenceHubModel[]>(
    []
  );

  // Selected row for View/Edit modal
  const [selectedEvidenceHub, setSelectedEvidenceHub] =
    useState<EvidenceHubModel | null>(null);

  // Modal open/close flag
  const [isEvidenceHubModalOpen, setIsEvidenceHubModalOpen] = useState(false);

  // Search term for Evidence Hub
  const [searchTypeTerm, setSearchTypeTerm] = useState("");

  // FilterBy - Dynamic options generators for Evidence Hub tab
  const getUniqueEvidenceUploaders = useCallback(() => {
    const uploaderIds = new Set<string>();
    evidenceHubData.forEach((item) => {
      const uploadedById = item.evidence_files?.[0]?.uploaded_by;
      if (uploadedById) {
        uploaderIds.add(uploadedById.toString());
      }
    });
    return Array.from(uploaderIds)
      .sort()
      .map((uploaderId) => {
        const user = users.find((u: any) => u.id.toString() === uploaderId);
        const userName = user
          ? `${user.name} ${user.surname}`.trim()
          : `User ${uploaderId}`;
        return { value: uploaderId, label: userName };
      });
  }, [evidenceHubData, users]);

  const getUniqueEvidenceModels = useCallback(() => {
    const modelIds = new Set<string>();
    evidenceHubData.forEach((item) => {
      if (item.mapped_model_ids) {
        item.mapped_model_ids.forEach((modelId) => {
          modelIds.add(modelId.toString());
        });
      }
    });
    return Array.from(modelIds)
      .sort()
      .map((modelId) => {
        const model = modelInventoryData.find(
          (m: any) => m.id.toString() === modelId
        );
        const modelName = model
          ? `${model.provider} - ${model.model}`
          : `Model ${modelId}`;
        return { value: modelId, label: modelName };
      });
  }, [evidenceHubData, modelInventoryData]);

  // FilterBy - Filter columns configuration for Evidence Hub tab
  const evidenceFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "evidence_name",
        label: "Evidence name",
        type: "text" as const,
      },
      {
        id: "evidence_type",
        label: "Evidence type",
        type: "select" as const,
        options: [
          { value: "Model Card", label: "Model card" },
          { value: "Risk Assessment Report", label: "Risk assessment report" },
          {
            value: "Bias and Fairness Report",
            label: "Bias and fairness report",
          },
          {
            value: "Security Assessment Report",
            label: "Security assessment report",
          },
          {
            value: "Data Protection Impact Assessment",
            label: "Data protection impact assessment",
          },
          {
            value: "Robustness and Stress Test Report",
            label: "Robustness and stress test report",
          },
          {
            value: "Evaluation Metrics Summary",
            label: "Evaluation metrics summary",
          },
          { value: "Human Oversight Plan", label: "Human oversight plan" },
          {
            value: "Post-Market Monitoring Plan",
            label: "Post-market monitoring plan",
          },
          { value: "Version Change Log", label: "Version change log" },
          {
            value: "Third-Party Audit Report",
            label: "Third-party audit report",
          },
          {
            value: "Conformity Assessment Report",
            label: "Conformity assessment report",
          },
          {
            value: "Technical File / CE Documentation",
            label: "Technical file / CE documentation",
          },
          {
            value: "Vendor Model Documentation",
            label: "Vendor model documentation",
          },
          {
            value: "Internal Approval Record",
            label: "Internal approval record",
          },
        ],
      },
      {
        id: "mapped_model_ids",
        label: "Mapped models",
        type: "select" as const,
        options: getUniqueEvidenceModels(),
      },
      {
        id: "uploaded_by",
        label: "Uploaded by",
        type: "select" as const,
        options: getUniqueEvidenceUploaders(),
      },
      {
        id: "expiry_date",
        label: "Expiry date",
        type: "date" as const,
      },
    ],
    [getUniqueEvidenceModels, getUniqueEvidenceUploaders]
  );

  // FilterBy - Field value getter for Evidence Hub tab
  const getEvidenceFieldValue = useCallback(
    (
      item: EvidenceHubModel,
      fieldId: string
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "evidence_name":
          return item.evidence_name;
        case "evidence_type":
          return item.evidence_type;
        case "mapped_model_ids":
          // Return first mapped model ID for filtering (supports "is" operator)
          return item.mapped_model_ids?.[0]?.toString();
        case "uploaded_by":
          return item.evidence_files?.[0]?.uploaded_by?.toString();
        case "expiry_date":
          return item.expiry_date;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook for Evidence Hub tab
  const {
    filterData: filterEvidenceData,
    handleFilterChange: handleEvidenceFilterChange,
  } = useFilterBy<EvidenceHubModel>(getEvidenceFieldValue);

  const [isEvidenceLoading, setEvidenceLoading] = useState(false);

  const [deletingEvidenceId, setDeletingEvidenceId] = useState<number | null>(
    null
  );

  // Share view state
  const [shareAnchorEl, setShareAnchorEl] = useState<HTMLElement | null>(null);
  const [shareableLink, setShareableLink] = useState<string>("");
  const [shareLinkId, setShareLinkId] = useState<number | null>(null);
  const [shareSettings, setShareSettings] = useState<ShareViewSettings>({
    shareAllFields: true,
    allowDataExport: true,
    allowViewersToOpenRecords: false,
    displayToolbar: true,
  });
  const [isShareEnabled, setIsShareEnabled] = useState(false);
  const [showReplaceConfirmation, setShowReplaceConfirmation] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  // Determine the active tab based on the URL
  const getTabFromPath = useCallback((pathname: string, tabs: typeof pluginTabs) => {
    if (pathname.includes("model-risks")) return "model-risks";
    if (pathname.includes("evidence-hub")) return "evidence-hub";
    // Check for plugin tabs dynamically
    for (const tab of tabs) {
      if (pathname.includes(tab.value)) return tab.value;
    }
    return "models";
  }, []);

  const [activeTab, setActiveTab] = useState(() =>
    getTabFromPath(location.pathname, pluginTabs)
  );

  // Sync activeTab with URL changes (for browser back/forward navigation)
  useEffect(() => {
    const newTab = getTabFromPath(location.pathname, pluginTabs);

    // If trying to access a plugin tab but plugin is not installed, redirect to models
    const isPluginTab = pluginTabs.some((t) => t.value === newTab);
    const isBuiltInTab = ["models", "model-risks", "evidence-hub"].includes(newTab);

    if (!isBuiltInTab && !isPluginTab) {
      setActiveTab("models");
    } else {
      setActiveTab(newTab);
    }
  }, [location.pathname, pluginTabs, getTabFromPath]);

  // Calculate summary from data
  const summary: Summary = {
    approved: modelInventoryData.filter(
      (item) => item.status === ModelInventoryStatus.APPROVED
    ).length,
    restricted: modelInventoryData.filter(
      (item) => item.status === ModelInventoryStatus.RESTRICTED
    ).length,
    pending: modelInventoryData.filter(
      (item) => item.status === ModelInventoryStatus.PENDING
    ).length,
    blocked: modelInventoryData.filter(
      (item) => item.status === ModelInventoryStatus.BLOCKED
    ).length,
    total: modelInventoryData.length,
  };


  // Filter data using FilterBy, card filter, and search
  const filteredData = useMemo(() => {
    // Stage 1: Apply FilterBy conditions
    let data = filterModelData(modelInventoryData);

    // Stage 2: Apply card filter for status
    if (selectedStatus) {
      const statusMap: Record<string, string> = {
        approved: ModelInventoryStatus.APPROVED,
        restricted: ModelInventoryStatus.RESTRICTED,
        pending: ModelInventoryStatus.PENDING,
        blocked: ModelInventoryStatus.BLOCKED,
      };
      const targetStatus = statusMap[selectedStatus];
      if (targetStatus) {
        data = data.filter((item) => item.status === targetStatus);
      }
    }

    // Stage 3: Apply search filter
    if (searchTerm) {
      data = data.filter(
        (item) =>
          item.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.provider?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.version?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return data;
  }, [filterModelData, modelInventoryData, selectedStatus, searchTerm]);

  // Define how to get the group key for each model
  const getModelInventoryGroupKey = (
    model: IModelInventory,
    field: string
  ): string | string[] => {
    switch (field) {
      case "provider":
        return model.provider || "Unknown Provider";
      case "status":
        return model.status || "Unknown Status";
      case "security_assessment":
        return model.security_assessment ? "Assessed" : "Not Assessed";
      case "hosting_provider":
        return model.hosting_provider || "Unknown Hosting";
      case "approver":
        if (model.approver) {
          const user = users.find((u: any) => u.id === Number(model.approver));
          return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
        }
        return "No Approver";
      default:
        return "Other";
    }
  };

  // Apply grouping to filtered data
  const groupedModelInventory = useTableGrouping({
    data: filteredData,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getModelInventoryGroupKey,
  });

  // Define export columns for model inventory table
  const exportColumns = useMemo(() => {
    return [
      { id: "provider", label: "Provider" },
      { id: "model", label: "Model" },
      { id: "version", label: "Version" },
      { id: "approver", label: "Approver" },
      { id: "security_assessment", label: "Security assessment" },
      { id: "status", label: "Status" },
      { id: "status_date", label: "Status date" },
    ];
  }, []);

  // Prepare export data - format the data for export
  const exportData = useMemo(() => {
    return filteredData.map((model: IModelInventory) => {
      const approverUser = users.find(
        (user: any) => user.id === model.approver
      );
      const approverName = approverUser
        ? `${approverUser.name} ${approverUser.surname}`
        : "-";

      return {
        provider: model.provider || "-",
        model: model.model || "-",
        version: model.version || "-",
        approver: approverName,
        security_assessment: model.security_assessment ? "Yes" : "No",
        status: model.status || "-",
        status_date: model.status_date || "-",
      };
    });
  }, [filteredData, users]);

  // Function to fetch evidence data
  const fetchEvidenceData = async (showLoading = true) => {
    if (showLoading) {
      setEvidenceLoading(true);
    }
    try {
      const response = await getAllEntities({ routeUrl: "/evidenceHub" });
      if (response?.data) {
        setEvidenceHubData(response.data);
        if (showLoading) {
          setTableKey((prev) => prev + 1);
        }
      }
    } catch (error) {
      console.error("Error fetching evidence data:", error);
      logEngine({
        type: "error",
        message: `Failed to fetch evidence data: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to load evidence data. Please try again later.",
      });
      setShowAlert(true);
    } finally {
      if (showLoading) {
        setEvidenceLoading(false);
      }
    }
  };

  // Function to fetch model inventory data
  const fetchModelInventoryData = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const response = await getAllEntities({ routeUrl: "/modelInventory" });
      if (response?.data) {
        setModelInventoryData(response.data);
        // Only force table re-render if we're not in an optimistic update scenario
        if (showLoading) {
          setTableKey((prev) => prev + 1);
        }
      }
    } catch (error) {
      console.error("Error fetching model inventory data:", error);
      logEngine({
        type: "error",
        message: `Failed to fetch model inventory data: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to load model inventory data. Please try again later.",
      });
      setShowAlert(true);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  // Function to fetch model risks data
  const fetchModelRisksData = async (
    showLoading = true,
    filter = modelRiskStatusFilter
  ) => {
    if (showLoading) {
      setIsModelRisksLoading(true);
    }
    try {
      const response = await getAllEntities({
        routeUrl: `/modelRisks?filter=${filter}`,
      });
      // Handle both direct array and {message, data} format
      let modelRisksData = [];
      if (Array.isArray(response)) {
        modelRisksData = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        modelRisksData = response.data;
      } else if (response?.data) {
        modelRisksData = response.data;
      } else {
        console.warn("Unexpected model risks data format:", response);
        modelRisksData = [];
      }
      setModelRisksData(modelRisksData);
    } catch (error) {
      console.error("Error fetching model risks data:", error);
      logEngine({
        type: "error",
        message: `Failed to fetch model risks data: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to load model risks data. Please try again later.",
      });
      setShowAlert(true);
    } finally {
      if (showLoading) {
        setIsModelRisksLoading(false);
      }
    }
  };

  // Function to fetch users data
  const fetchUsersData = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      // Handle both direct array and {message, data} format
      let usersData = [];
      if (Array.isArray(response)) {
        usersData = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        usersData = response.data;
      } else if (response?.data) {
        usersData = response.data;
      } else {
        console.warn("Unexpected users data format:", response);
        usersData = [];
      }
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users data:", error);
    }
  };


  useEffect(() => {
    fetchModelInventoryData();
    fetchModelRisksData();
    fetchUsersData();
    fetchEvidenceData();
  }, []);

  // Refetch model risks when filter changes
  useEffect(() => {
    fetchModelRisksData(true, modelRiskStatusFilter);
  }, [modelRiskStatusFilter]);

  useEffect(() => {
    if (alert) {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Handle modelId and evidenceId URL params to open edit modal from Wise Search
  useEffect(() => {
    if (hasProcessedUrlParam.current || isLoading) return;

    const modelId = searchParams.get("modelId");
    const evidenceId = searchParams.get("evidenceId");

    if (modelId) {
      hasProcessedUrlParam.current = true;
      // Fetch model inventory and open edit modal
      getEntityById({ routeUrl: `/modelInventory/${modelId}` })
        .then((response) => {
          if (response?.data) {
            setSelectedModelInventory(response.data);
            setIsNewModelInventoryModalOpen(true);
            setSearchParams({}, { replace: true });
          }
        })
        .catch((err) => {
          console.error("Error fetching model from URL param:", err);
          setSearchParams({}, { replace: true });
        });
    } else if (evidenceId) {
      hasProcessedUrlParam.current = true;
      // Fetch evidence and open edit modal
      getEntityById({ routeUrl: `/evidenceHub/${evidenceId}` })
        .then((response) => {
          if (response?.data) {
            setSelectedEvidenceHub(response.data);
            setIsEvidenceHubModalOpen(true);
            setSearchParams({}, { replace: true });
          }
        })
        .catch((err) => {
          console.error("Error fetching evidence from URL param:", err);
          setSearchParams({}, { replace: true });
        });
    }
  }, [searchParams, isLoading, setSearchParams]);

  // Auto-open create model modal when navigating from "Add new..." dropdown
  useEffect(() => {
    // if (location.state?.openCreateModal) {
    //   setIsNewModelInventoryModalOpen(true);
    //   setSelectedModelInventory(null);
    if (location.state?.openCreateModal && !isLoading) {
      // Check if we're on the model-risks tab
      if (activeTab === "model-risks") {
        // Check if there are any models
        if (modelInventoryData.length === 0) {
          setAlert({
            variant: "info",
            title: "No models available",
            body: "Please create a model first before adding model risks. Redirecting to models tab...",
          });
          // Redirect to models tab
          setTimeout(() => {
            navigate("/model-inventory");
            setIsNewModelInventoryModalOpen(true);
            setSelectedModelInventory(null);
            // setSelectedModelInventoryId(null);
          }, REDIRECT_DELAY_MS);
        } else {
          setIsNewModelRiskModalOpen(true);
        }
      } else {
        setIsNewModelInventoryModalOpen(true);
        setSelectedModelInventory(null);
        // setSelectedModelInventoryId(null);
      }

      // Clear the navigation state to prevent re-opening on subsequent navigations
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Dependencies: location.state triggers the effect when openCreateModal is passed via navigation
    // navigate, location.pathname are needed for state clearing
    // activeTab, modelInventoryData.length, isLoading determine which modal to open or if validation is needed
  }, [
    location.state,
    navigate,
    location.pathname,
    activeTab,
    modelInventoryData.length,
    isLoading,
  ]);

  const handleNewModelInventoryClick = () => {
    setSelectedModelInventory(null);
    setIsNewModelInventoryModalOpen(true);
  };


  const handleNewUploadEvidenceClick = () => {
    setIsEvidenceHubModalOpen(true);
    setSelectedEvidenceHub(null);
  };

  const handleAddEvidence = (modelId?: number) => {
    setIsEvidenceHubModalOpen(true);
    setSelectedEvidenceHub(null);
    setPreselectedModelId(modelId);
  };

  const handleEditModelInventory = async (id: string) => {
    try {
      // Fetch the model inventory data first
      const response = await getEntityById({
        routeUrl: `/modelInventory/${id}`,
      });
      if (response?.data) {
        setSelectedModelInventory(response.data);
        // Only open modal after data is loaded
        setIsNewModelInventoryModalOpen(true);
      }
    } catch (error) {
      console.error("Error fetching model inventory details:", error);
      setAlert({
        variant: "error",
        body: "Failed to load model inventory details. Please try again.",
      });
    }
  };

  const handleViewModelDetails = useCallback(
    (id: string) => {
      handleEditModelInventory(id);
    },
    [handleEditModelInventory]
  );

  const handleEditEvidence = async (id: number) => {
    try {
      // Fetch the model inventory data first
      const response = await getEntityById({
        routeUrl: `/evidenceHub/${id}`,
      });
      if (response?.data) {
        setSelectedEvidenceHub(response.data || null); // if row provided = edit, else new
        setIsEvidenceHubModalOpen(true);
      }
    } catch (error) {
      console.error("Error fetching evidence model details:", error);
      setAlert({
        variant: "error",
        body: "Failed to load evidence model details. Please try again.",
      });
    }
  };

  // Fetch model risk data when modal opens with an ID
  useEffect(() => {
    const fetchModelRiskDetails = async () => {
      if (selectedModelRiskId && isNewModelRiskModalOpen) {
        try {
          const response = await getEntityById({
            routeUrl: `/modelRisks/${selectedModelRiskId}`,
          });
          if (response?.data) {
            setSelectedModelRisk(response.data);
          }
        } catch (error) {
          console.error("Error fetching model risk details:", error);
          setAlert({
            variant: "error",
            body: "Failed to load model risk details. Please try again.",
          });
        }
      }
    };

    fetchModelRiskDetails();
  }, [selectedModelRiskId, isNewModelRiskModalOpen]);

  const handleCloseModal = () => {
    setIsNewModelInventoryModalOpen(false);
    setSelectedModelInventory(null);
  };

  const handleClosEvidenceModal = () => {
    setSelectedEvidenceHub(null);
    setIsEvidenceHubModalOpen(false);
    setPreselectedModelId(undefined);
  };


  // Share view handlers
  const handleShareClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setShareAnchorEl(event.currentTarget);
  };

  const handleShareClose = () => {
    setShareAnchorEl(null);
  };

  const generateShareableLink = async (
    settings: ShareViewSettings
  ): Promise<string> => {
    // Prevent concurrent link creation
    if (isCreatingLink) {
      return shareableLink;
    }

    try {
      setIsCreatingLink(true);

      // Create share link via API
      const result = await createShareMutation.mutateAsync({
        resource_type: "model",
        resource_id: 0, // 0 = share entire Model Inventory table view
        settings,
      });

      const link = result.data?.shareable_url || "";
      const id = result.data?.id || null;
      setShareableLink(link);
      setShareLinkId(id);
      return link;
    } catch (error) {
      console.error("Error generating share link:", error);
      setAlert({
        variant: "error",
        body: "Failed to generate share link. Please try again.",
      });
      return "";
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleShareEnabledChange = async (enabled: boolean) => {
    setIsShareEnabled(enabled);
    if (enabled) {
      // Re-enable the existing share link or create a new one
      if (shareLinkId) {
        // Re-enable existing share link
        try {
          await updateShareMutation.mutateAsync({
            id: shareLinkId,
            is_enabled: true,
          });
        } catch (error) {
          // Revert the UI state if API call fails
          setIsShareEnabled(false);
          setAlert({
            variant: "error",
            body: "Failed to enable share link. Please try again.",
          });
          setTimeout(() => setAlert(null), 3000);
        }
      } else if (!shareableLink) {
        // Create new share link if none exists
        await generateShareableLink(shareSettings);
      }
    } else if (!enabled && shareLinkId) {
      // Disable the existing share link when toggled off
      try {
        await updateShareMutation.mutateAsync({
          id: shareLinkId,
          is_enabled: false,
        });
      } catch (error) {
        // Revert the UI state if API call fails
        setIsShareEnabled(true);
        setAlert({
          variant: "error",
          body: "Failed to disable share link. Please try again.",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    }
  };

  const handleShareSettingsChange = async (settings: ShareViewSettings) => {
    setShareSettings(settings);

    // If we have an existing share link, update its settings
    if (shareLinkId) {
      try {
        await updateShareMutation.mutateAsync({
          id: shareLinkId,
          settings,
        });
        setAlert({
          variant: "success",
          body: "Share link settings updated!",
        });
      } catch (error) {
        console.error("Error updating share link settings:", error);
        setAlert({
          variant: "error",
          body: "Failed to update settings. Please try again.",
        });
      }
    }
  };

  const handleCopyLink = (_link: string) => {
    setAlert({
      variant: "success",
      body: "Share link copied to clipboard!",
    });
  };

  const handleRefreshLink = () => {
    // Show confirmation dialog
    setShowReplaceConfirmation(true);
  };

  const handleConfirmReplace = async () => {
    setShowReplaceConfirmation(false);

    try {
      // Fetch ALL existing share links for this resource and disable them
      const existingLinksResponse: any = await getShareLinksForResource(
        "model",
        0
      );
      const existingLinks = existingLinksResponse?.data?.data || [];

      // Disable all existing links
      let disabledCount = 0;
      for (const link of existingLinks) {
        if (link.is_enabled) {
          try {
            await updateShareMutation.mutateAsync({
              id: link.id,
              is_enabled: false,
            });
            disabledCount++;
          } catch (updateError) {
            throw updateError;
          }
        }
      }

      // Create a new link
      await generateShareableLink(shareSettings);

      setAlert({
        variant: "success",
        body: `Share link replaced successfully! ${disabledCount} previous link(s) invalidated.`,
      });
    } catch (error) {
      console.error("Error replacing share link:", error);
      setAlert({
        variant: "error",
        body: "Failed to replace share link. Please try again.",
      });
    }
  };

  const handleOpenLink = (link: string) => {
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const handleModelInventorySuccess = async (formData: any) => {
    let modelId: number | null = null;

    if (selectedModelInventory) {
      // Update existing model inventory
      // Check if projects or frameworks are being deleted
      const oldProjects = selectedModelInventory.projects || [];
      const newProjects = formData.projects || [];
      const oldFrameworks = selectedModelInventory.frameworks || [];
      const newFrameworks = formData.frameworks || [];

      const deleteProjects = oldProjects.length > 0 && newProjects.length === 0;
      const deleteFrameworks =
        oldFrameworks.length > 0 && newFrameworks.length === 0;

      await updateEntityById({
        routeUrl: `/modelInventory/${selectedModelInventory.id}`,
        body: {
          ...formData,
          deleteProjects,
          deleteFrameworks,
        },
      });
      modelId = selectedModelInventory.id || null;
      setAlert({
        variant: "success",
        body: "Model inventory updated successfully!",
      });
    } else {
      // Create new model inventory
      const response = await createModelInventory("/modelInventory", formData);
      modelId = response?.data?.id || null;
      setAlert({
        variant: "success",
        body: "New model inventory added successfully!",
      });
    }
    await fetchModelInventoryData();

    // Flash the updated/created row
    if (modelId) {
      setFlashRowId(modelId);
      setTimeout(() => setFlashRowId(null), 3000);
    }
  };

  const handleModelInventoryError = (error: any) => {
    console.error("Model inventory operation error:", error);

    let errorMessage = selectedModelInventory
      ? "Failed to update model inventory. Please try again."
      : "Failed to add model inventory. Please try again.";

    // Check different error structures
    let errorData = null;

    // Check if it's an axios error with response.data first
    if (error?.response?.data) {
      errorData = error.response.data;
    }
    // Check if it's a CustomException with response property
    else if (error?.response) {
      errorData = error.response;
    }
    // Check if the error itself has the data structure
    else if (error?.status && error?.errors) {
      errorData = error;
    }

    if (errorData) {
      // Handle validation errors with specific field messages
      if (
        errorData.status === "error" &&
        errorData.errors &&
        Array.isArray(errorData.errors)
      ) {
        const validationMessages = errorData.errors
          .map((err: any) => {
            return err.message || "Validation error";
          })
          .join(", ");

        errorMessage = validationMessages;
      }
      // Handle general error message
      else if (errorData.message) {
        errorMessage = errorData.message;
      }
    }

    setAlert({
      variant: "error",
      body: errorMessage,
    });
  };

  const handleEvidenceUploadModalError = (error: any) => {
    console.error("Evidence operation error:", error);

    let errorMessage = selectedEvidenceHub
      ? "Failed to update evidence. Please try again."
      : "Failed to add new evidence. Please try again.";

    let errorData = null;

    if (error?.response?.data) {
      errorData = error.response.data;
    } else if (error?.response) {
      errorData = error.response;
    } else if (error?.status && error?.errors) {
      errorData = error;
    }

    if (errorData) {
      if (errorData.status === "error" && Array.isArray(errorData.errors)) {
        const validationMessages = errorData.errors
          .map((err: any) => err.message || "Validation error")
          .join(", ");
        errorMessage = validationMessages;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    }

    setAlert({
      variant: "error",
      body: errorMessage,
    });
  };

  const handleDeleteModelInventory = async (
    id: string,
    deleteRisks: boolean = false
  ) => {
    try {
      setDeletingId(id);

      // Optimistically remove the item from the local state for immediate UI feedback
      setModelInventoryData((prevData) => {
        const newData = prevData.filter((item) => item.id?.toString() !== id);
        return newData;
      });

      // If deleting risks, also optimistically remove related risks from the risks table
      if (deleteRisks) {
        setModelRisksData((prevData) =>
          prevData.filter((risk) => risk.model_id?.toString() !== id)
        );
      }

      await deleteEntityById({
        routeUrl: `/modelInventory/${id}${
          deleteRisks ? "?deleteRisks=true" : ""
        }`,
      });

      // Fetch fresh data to ensure consistency with server (without loading state)
      await fetchModelInventoryData(false);

      // If risks were deleted, also refresh the model risks data
      if (deleteRisks) {
        await fetchModelRisksData(false);
      }

      // Force a smooth table re-render after the data update
      setTableKey((prev) => prev + 1);

      setAlert({
        variant: "success",
        body: deleteRisks
          ? "Model inventory and associated risks deleted successfully!"
          : "Model inventory deleted successfully!",
      });
    } catch (error) {
      console.error("Error deleting model inventory:", error);

      // If delete failed, revert the optimistic update by fetching fresh data (without loading state)
      await fetchModelInventoryData(false);
      if (deleteRisks) {
        await fetchModelRisksData(false);
      }

      setAlert({
        variant: "error",
        body: "Failed to delete model inventory. Please try again.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteEvidence = async (id: number) => {
    try {
      setDeletingEvidenceId(id);

      // Optimistically remove the item from the local state
      setEvidenceHubData((prevData) =>
        prevData.filter((item) => item.id !== id)
      );

      // Perform the actual delete operation
      await deleteEntityById({ routeUrl: `/evidenceHub/${id}` });

      // Fetch fresh data to ensure consistency
      await fetchEvidenceData(false);

      setAlert({
        variant: "success",
        body: "Evidence deleted successfully!",
      });
    } catch (error) {
      console.error("Error deleting evidence:", error);

      // If delete failed, revert the optimistic update
      await fetchEvidenceData(false);

      setAlert({
        variant: "error",
        body: "Failed to delete evidence. Please try again.",
      });
    } finally {
      setDeletingEvidenceId(null);
    }
  };

  const handleCheckModelHasRisks = async (id: string): Promise<boolean> => {
    try {
      // First check local data for immediate response
      const numericId = parseInt(id);
      const hasLocalRisks = modelRisksData.some(
        (risk) => risk.model_id === numericId
      );

      // If local data shows risks, return true immediately
      if (hasLocalRisks) {
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error checking model risks:", error);
      return false;
    }
  };

  // Filter model risks using FilterBy and card filter
  const filteredModelRisks = useMemo(() => {
    // Stage 1: Apply FilterBy conditions
    let data = filterModelRiskData(modelRisksData);

    // Stage 2: Apply card filter for risk level
    if (selectedRiskLevel) {
      data = data.filter((risk) => risk.risk_level === selectedRiskLevel);
    }

    return data;
  }, [filterModelRiskData, modelRisksData, selectedRiskLevel]);

  // Define how to get the group key for each model risk
  const getModelRiskGroupKey = (
    risk: any,
    field: string
  ): string | string[] => {
    switch (field) {
      case "risk_level":
        return risk.risk_level || "Unknown";
      case "status":
        return risk.status || "Unknown";
      case "owner":
        if (risk.owner) {
          const user = users.find((u) => u.id == risk.owner);
          return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
        }
        return "Unassigned";
      case "model_name":
        if (risk.model_id) {
          const model = modelInventoryData.find((m) => m.id == risk.model_id);
          return model?.model || "Unknown Model";
        }
        return "No Model";
      default:
        return "Other";
    }
  };

  // Apply grouping to filtered model risks
  const groupedModelRisks = useTableGrouping({
    data: filteredModelRisks,
    groupByField: groupByRisk,
    sortOrder: groupSortOrderRisk,
    getGroupKey: getModelRiskGroupKey,
  });

  // Filter evidence hub using FilterBy and search
  const filteredEvidenceHub = useMemo(() => {
    // First apply FilterBy conditions
    let filtered = filterEvidenceData(evidenceHubData);

    // Then apply search filter
    if (searchTypeTerm?.trim()) {
      const lower = searchTypeTerm.toLowerCase();
      filtered = filtered.filter((e) =>
        e.evidence_name?.toLowerCase().includes(lower)
      );
    }

    return filtered;
  }, [filterEvidenceData, evidenceHubData, searchTypeTerm]);

  // Define how to get the group key for each evidence
  const getEvidenceGroupKey = (
    evidence: any,
    field: string
  ): string | string[] => {
    switch (field) {
      case "evidence_type":
        return evidence.evidence_type || "Unknown";
      case "uploaded_by":
        if (evidence.uploaded_by) {
          const user = users.find((u) => u.id == evidence.uploaded_by);
          return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
        }
        return "Unknown";
      case "model":
        if (evidence.model_id) {
          const model = modelInventoryData.find(
            (m) => m.id == evidence.model_id
          );
          return model?.model || "Unknown Model";
        }
        return "No Model";
      default:
        return "Other";
    }
  };

  // Apply grouping to filtered evidence hub
  const groupedEvidenceHub = useTableGrouping({
    data: filteredEvidenceHub,
    groupByField: groupByEvidence,
    sortOrder: groupSortOrderEvidence,
    getGroupKey: getEvidenceGroupKey,
  });

  // Export columns and data for Model Risks
  const modelRisksExportColumns = useMemo(() => {
    return [
      { id: "risk_name", label: "Risk name" },
      { id: "model_name", label: "Model name" },
      { id: "risk_category", label: "Category" },
      { id: "risk_level", label: "Risk level" },
      { id: "status", label: "Status" },
      { id: "owner", label: "Owner" },
      { id: "target_date", label: "Target date" },
    ];
  }, []);

  const modelRisksExportData = useMemo(() => {
    return filteredModelRisks.map((risk: IModelRisk) => {
      const ownerUser = users.find((user: any) => user.id == risk.owner);
      const ownerName = ownerUser
        ? `${ownerUser.name} ${ownerUser.surname}`
        : "-";

      const model = modelInventoryData.find((m) => m.id === risk.model_id);
      const modelName = model ? model.model : "-";

      return {
        risk_name: risk.risk_name || "-",
        model_name: modelName,
        risk_category: risk.risk_category || "-",
        risk_level: risk.risk_level || "-",
        status: risk.status || "-",
        owner: ownerName,
        target_date: risk.target_date || "-",
      };
    });
  }, [filteredModelRisks, users, modelInventoryData]);

  // Export columns and data for Evidence Hub
  const evidenceHubExportColumns = useMemo(() => {
    return [
      { id: "evidence_name", label: "Evidence name" },
      { id: "evidence_type", label: "Type" },
      { id: "mapped_models", label: "Mapped models" },
      { id: "uploaded_by", label: "Uploaded by" },
      { id: "uploaded_on", label: "Uploaded on" },
      { id: "expiry_date", label: "Expiry" },
    ];
  }, []);

  const evidenceHubExportData = useMemo(() => {
    return filteredEvidenceHub.map((evidence: EvidenceHubModel) => {
      // Get uploader from first evidence file
      const uploadedById = evidence.evidence_files?.[0]?.uploaded_by;
      const uploaderUser = users.find((user: any) => user.id === uploadedById);
      const uploaderName = uploaderUser
        ? `${uploaderUser.name} ${uploaderUser.surname}`
        : "-";

      // Get upload date from first evidence file
      const uploadDate = evidence.evidence_files?.[0]?.upload_date;
      const formattedUploadDate = uploadDate
        ? new Date(uploadDate).toISOString().split("T")[0]
        : "-";

      // Get mapped model names from mapped_model_ids
      const mappedModelNames =
        evidence.mapped_model_ids
          ?.map((modelId: number) => {
            const model = modelInventoryData.find((m) => m.id === modelId);
            return model ? `${model.provider} - ${model.model}` : null;
          })
          .filter(Boolean)
          .join(", ") || "-";

      // Format expiry date
      const formattedExpiryDate = evidence.expiry_date
        ? new Date(evidence.expiry_date).toISOString().split("T")[0]
        : "-";

      return {
        evidence_name: evidence.evidence_name || "-",
        evidence_type: evidence.evidence_type || "-",
        mapped_models: mappedModelNames,
        uploaded_by: uploaderName,
        uploaded_on: formattedUploadDate,
        expiry_date: formattedExpiryDate,
      };
    });
  }, [filteredEvidenceHub, users, modelInventoryData]);

  // Model Risk handlers
  const handleNewModelRiskClick = () => {
    setIsNewModelRiskModalOpen(true);
  };

  const handleEditModelRisk = (id: number) => {
    setSelectedModelRiskId(id);
    setIsNewModelRiskModalOpen(true);
  };

  const handleCloseModelRiskModal = () => {
    setIsNewModelRiskModalOpen(false);
    setSelectedModelRisk(null);
    setSelectedModelRiskId(null);
  };

  const handleEvidenceUploadModalSuccess = async (
    formData: EvidenceHubModel
  ) => {
    try {
      if (selectedEvidenceHub) {
        // Update existing Evidence
        await updateEntityById({
          routeUrl: `/evidenceHub/${selectedEvidenceHub.id}`,
          body: formData,
        });

        setEvidenceHubData((prev) =>
          prev.map((item) =>
            item.id === selectedEvidenceHub.id ? formData : item
          )
        );

        setAlert({
          variant: "success",
          body: "Evidence updated successfully!",
        });
      } else {
        // Create new Evidence
        const response = await createEvidenceHub("/evidenceHub", formData);

        if (response?.data) {
          setEvidenceHubData((prev) => [...prev, response.data]);
        } else {
          setEvidenceHubData((prev) => [...prev, formData]);
        }

        await fetchEvidenceData();

        setAlert({
          variant: "success",
          body: "New evidence added successfully!",
        });
      }

      // Close the modal and clear selected evidence
      setSelectedEvidenceHub(null);
      setIsEvidenceHubModalOpen(false);
    } catch (error) {
      setAlert({
        variant: "error",
        body: selectedEvidenceHub
          ? "Failed to update evidence. Please try again."
          : "Failed to add new evidence. Please try again.",
      });
    }
  };

  const handleModelRiskSuccess = async (formData: IModelRiskFormData) => {
    try {
      if (selectedModelRisk) {
        // Update existing model risk
        await updateEntityById({
          routeUrl: `/modelRisks/${selectedModelRisk.id}`,
          body: formData,
        });
        setAlert({
          variant: "success",
          body: "Model risk updated successfully!",
        });
      } else {
        // Create new model risk using apiServices
        await createNewUser({
          routeUrl: "/modelRisks",
          body: formData,
        });
        setAlert({
          variant: "success",
          body: "New model risk added successfully!",
        });
      }
      await fetchModelRisksData();
      handleCloseModelRiskModal();
    } catch (error) {
      setAlert({
        variant: "error",
        body: selectedModelRisk
          ? "Failed to update model risk. Please try again."
          : "Failed to add model risk. Please try again.",
      });
    }
  };

  const handleDeleteModelRisk = async (id: number) => {
    try {
      setDeletingModelRiskId(id);

      // Optimistically remove the item from the local state
      setModelRisksData((prevData) =>
        prevData.filter((item) => item.id !== id)
      );

      // Perform the actual delete operation
      await deleteEntityById({ routeUrl: `/modelRisks/${id}` });

      // Fetch fresh data to ensure consistency
      await fetchModelRisksData(false);

      setAlert({
        variant: "success",
        body: "Model risk deleted successfully!",
      });
    } catch (error) {
      console.error("Error deleting model risk:", error);

      // If delete failed, revert the optimistic update
      await fetchModelRisksData(false);

      setAlert({
        variant: "error",
        body: "Failed to delete model risk. Please try again.",
      });
    } finally {
      setDeletingModelRiskId(null);
    }
  };

  const handleModelRiskStatusFilterChange = (event: any) => {
    setModelRiskStatusFilter(event.target.value);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue); // Immediate UI update for better UX
    if (newValue === "models") {
      navigate("/model-inventory");
    } else if (newValue === "model-risks") {
      navigate("/model-inventory/model-risks");
    } else if (newValue === "evidence-hub") {
      navigate("/model-inventory/evidence-hub");
    } else {
      // Handle plugin tabs dynamically
      navigate(`/model-inventory/${newValue}`);
    }
  };

  const handleStatusCardClick = useCallback((statusKey: string) => {
    if (statusKey === 'total' || selectedStatus === statusKey) {
      setSelectedStatus(null);
      setAlert(null);
      setShowAlert(false);
    } else {
      setSelectedStatus(statusKey);
      const labelMap: Record<string, string> = {
        approved: 'Approved',
        restricted: 'Restricted',
        pending: 'Pending',
        blocked: 'Blocked',
      };
      setAlert({
        variant: 'info',
        title: `Filtering by ${labelMap[statusKey]} models`,
        body: 'Click the card again or click Total to see all models.',
      });
      setShowAlert(true);
      setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 5000);
    }
  }, [selectedStatus]);

  const handleRiskLevelCardClick = useCallback((riskLevelKey: string) => {
    if (riskLevelKey === 'total' || selectedRiskLevel === riskLevelKey) {
      setSelectedRiskLevel(null);
      setAlert(null);
      setShowAlert(false);
    } else {
      setSelectedRiskLevel(riskLevelKey);
      const labelMap: Record<string, string> = {
        [ModelRiskLevel.LOW]: 'Low',
        [ModelRiskLevel.MEDIUM]: 'Medium',
        [ModelRiskLevel.HIGH]: 'High',
        [ModelRiskLevel.CRITICAL]: 'Critical',
      };
      setAlert({
        variant: 'info',
        title: `Filtering by ${labelMap[riskLevelKey]} risk level`,
        body: 'Click the card again or click Total to see all risks.',
      });
      setShowAlert(true);
      setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 5000);
    }
  }, [selectedRiskLevel]);

  return (
    <Stack className="vwhome" sx={mainStackStyle}>
      {/* Replace Share Link Confirmation Modal */}
      <Modal
        open={showReplaceConfirmation}
        onClose={(_event, reason) => {
          if (reason !== "backdropClick") {
            setShowReplaceConfirmation(false);
          }
        }}
      >
        <Stack
          gap={theme.spacing(2)}
          color={theme.palette.text.secondary}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 450,
            bgcolor: theme.palette.background.modal,
            border: 1,
            borderColor: theme.palette.border.dark,
            borderRadius: theme.shape.borderRadius,
            boxShadow: 24,
            p: theme.spacing(15),
            "&:focus": {
              outline: "none",
            },
          }}
        >
          <Typography fontSize={16} fontWeight={600}>
            Replace Share Link?
          </Typography>
          <Typography fontSize={13} textAlign={"left"}>
            This will invalidate the current share link and generate a new one.
            Anyone with the old link will no longer be able to access the shared
            view.
          </Typography>
          <Typography fontSize={13} textAlign={"left"} mt={theme.spacing(4)}>
            Do you want to continue?
          </Typography>
          <Stack
            direction="row"
            gap={theme.spacing(4)}
            mt={theme.spacing(12)}
            justifyContent="flex-end"
          >
            <CustomizableButton
              variant="text"
              text="Cancel"
              onClick={() => setShowReplaceConfirmation(false)}
              sx={{
                width: 100,
                fontSize: 13,
                color: "inherit",
                "&:hover": {
                  backgroundColor: "transparent",
                },
              }}
            />
            <CustomizableButton
              variant="contained"
              text="Replace Link"
              onClick={handleConfirmReplace}
              sx={{
                width: 160,
                fontSize: 13,
              }}
            />
          </Stack>
        </Stack>
      </Modal>

      <PageHeaderExtended
        title="Model Inventory"
        description="This registry manages all AI/LLM models and their associated risks within your organization. You can view, add, and manage model details and track model-specific risks and mitigation plans."
        helpArticlePath="ai-governance/model-inventory"
        tipBoxEntity="model-inventory"
        summaryCards={
          activeTab === "models" ? (
            <ModelInventorySummary
              summary={summary}
              onCardClick={handleStatusCardClick}
              selectedStatus={selectedStatus}
            />
          ) : activeTab === "model-risks" ? (
            <ModelRiskSummary
              modelRisks={modelRisksData}
              onCardClick={handleRiskLevelCardClick}
              selectedRiskLevel={selectedRiskLevel}
            />
          ) : null
        }
        summaryCardsJoyrideId={
          activeTab === "models" ? "model-summary-cards" : undefined
        }
        alert={
          alert && (
            <Suspense fallback={<div>Loading...</div>}>
              <Fade in={showAlert} timeout={300} style={toastFadeStyle}>
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
            </Suspense>
          )
        }
      >
        {/* Tab Bar */}
        <TabContext value={activeTab}>
          <Box sx={{ marginBottom: 3 }}>
            <TabBar
              tabs={[
                {
                  label: "Models",
                  value: "models",
                  icon: "Box",
                  count: modelInventoryData.length,
                  isLoading: isLoading,
                  tooltip: "Catalog and track all registered AI/ML models",
                },
                {
                  label: "Model risks",
                  value: "model-risks",
                  icon: "AlertTriangle",
                  count: modelRisksData.length,
                  isLoading: isModelRisksLoading,
                  tooltip: "Risks identified for models in your inventory",
                },
                // Dynamically add plugin tabs
                ...pluginTabs.map((tab) => ({
                  label: tab.label,
                  value: tab.value,
                  icon: (tab.icon || "Database") as "Database" | "Box" | "AlertTriangle",
                })),
                {
                  label: "Evidence hub",
                  value: "evidence-hub",
                  icon: "Database" as const,
                  count: evidenceHubData.length,
                  isLoading: isEvidenceLoading,
                  tooltip: "Compliance evidence and documentation for audits",
                },
              ]}
              activeTab={activeTab}
              onChange={handleTabChange}
              dataJoyrideId="model-tabs"
            />
          </Box>
        </TabContext>

        {activeTab === "models" && (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={filterButtonRowStyle}
            >
              {/* Left side: FilterBy + Search + GroupBy */}
              <Stack direction="row" spacing={2} alignItems="center">
                <div data-joyride-id="model-status-filter">
                  <FilterBy
                    columns={modelFilterColumns}
                    onFilterChange={handleModelFilterChange}
                  />
                </div>

                <GroupBy
                  options={[
                    { id: "provider", label: "Provider" },
                    { id: "status", label: "Status" },
                    { id: "security_assessment", label: "Assessment" },
                    { id: "hosting_provider", label: "Hosting provider" },
                    { id: "approver", label: "Approver" },
                  ]}
                  onGroupChange={handleGroupChange}
                />

                <ColumnSelector
                  columns={modelAllColumns}
                  visibleColumns={modelVisibleColumns}
                  onToggleColumn={modelToggleColumn}
                  onResetToDefaults={modelResetToDefaults}
                />

                {/* Search */}
                <Box data-joyride-id="model-search">
                  <SearchBox
                    placeholder="Search models..."
                    value={searchTerm}
                    onChange={setSearchTerm}
                    inputProps={{
                      "aria-label": "Search models",
                    }}
                    fullWidth={false}
                  />
                </Box>
              </Stack>

              {/* Right side: Share, Export, Analytics & Add Model buttons */}
              <Stack direction="row" gap="8px" alignItems="center">
                <ShareButton
                  onClick={handleShareClick}
                  size="medium"
                  tooltip="Share view"
                />
                <ExportMenu
                  data={exportData}
                  columns={exportColumns}
                  filename="model-inventory"
                  title="Model Inventory"
                />
                <IconButton
                  onClick={() => setIsAnalyticsDrawerOpen(true)}
                  aria-label="Analytics"
                  sx={{
                    height: "34px",
                    width: "34px",
                    padding: "8px",
                    borderRadius: "4px",
                    border: `1px solid ${palette.border.light}`,
                    backgroundColor: palette.background.main,
                    "&:hover": {
                      backgroundColor: palette.background.accent,
                    },
                  }}
                >
                  <BarChart3 size={16} color={palette.text.secondary} />
                </IconButton>
                {/* Lifecycle config is now accessed via Plugin Settings page */}
                <div data-joyride-id="add-model-button">
                  <CustomizableButton
                    variant="contained"
                    sx={addNewModelButtonStyle}
                    text="Add new model"
                    icon={<AddCircleOutlineIcon size={16} />}
                    onClick={handleNewModelInventoryClick}
                    isDisabled={isCreatingDisabled}
                  />
                </div>
              </Stack>
            </Stack>

            <GroupedTableView
              groupedData={groupedModelInventory}
              ungroupedData={filteredData}
              renderTable={(data, options) => (
                <ModelInventoryTable
                  key={tableKey}
                  data={data}
                  isLoading={isLoading}
                  onEdit={handleEditModelInventory}
                  onDelete={handleDeleteModelInventory}
                  onCheckModelHasRisks={handleCheckModelHasRisks}
                  onViewDetails={handleViewModelDetails}
                  deletingId={deletingId}
                  hidePagination={options?.hidePagination}
                  modelRisks={modelRisksData}
                  flashRowId={flashRowId}
                  visibleColumns={modelVisibleColumns}
                />
              )}
            />
          </>
        )}

        {activeTab === "model-risks" && (
          <>
            {/* Model Risks Tab Content */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={filterButtonRowStyle}
            >
              <Stack direction="row" gap={2} alignItems="center">
                <div data-joyride-id="risk-category-filter">
                  <FilterBy
                    columns={modelRiskFilterColumns}
                    onFilterChange={handleModelRiskFilterChange}
                  />
                </div>
                <GroupBy
                  options={[
                    { id: "risk_level", label: "Risk level" },
                    { id: "status", label: "Status" },
                    { id: "model_name", label: "Model" },
                    { id: "owner", label: "Owner" },
                  ]}
                  onGroupChange={handleGroupChangeRisk}
                />
                <ColumnSelector
                  columns={riskAllColumns}
                  visibleColumns={riskVisibleColumns}
                  onToggleColumn={riskToggleColumn}
                  onResetToDefaults={riskResetToDefaults}
                />
                <SelectComponent
                  id="risk-status-filter"
                  value={modelRiskStatusFilter}
                  items={[
                    { _id: "active", name: "Active only" },
                    { _id: "all", name: "Active + deleted" },
                    { _id: "deleted", name: "Deleted only" },
                  ]}
                  onChange={handleModelRiskStatusFilterChange}
                  sx={statusFilterSelectStyle}
                  customRenderValue={(value, selectedItem) => {
                    if (value === "active") {
                      return selectedItem.name;
                    }
                    return `Show: ${selectedItem.name.toLowerCase()}`;
                  }}
                />
              </Stack>
              <Stack direction="row" gap="8px" alignItems="center">
                <ExportMenu
                  data={modelRisksExportData}
                  columns={modelRisksExportColumns}
                  filename="model-risks"
                  title="Model Risks"
                />
                <div data-joyride-id="add-model-risk-button">
                  <CustomizableButton
                    variant="contained"
                    sx={addNewModelButtonStyle}
                    text="Add model risk"
                    icon={<AddCircleOutlineIcon size={16} />}
                    onClick={handleNewModelRiskClick}
                    isDisabled={isCreatingDisabled}
                  />
                </div>
              </Stack>
            </Stack>

            <GroupedTableView
              groupedData={groupedModelRisks}
              ungroupedData={filteredModelRisks}
              renderTable={(data, options) => (
                <ModelRisksTable
                  data={data}
                  isLoading={isModelRisksLoading}
                  onEdit={handleEditModelRisk}
                  onDelete={handleDeleteModelRisk}
                  deletingId={deletingModelRiskId}
                  users={users}
                  models={modelInventoryData}
                  hidePagination={options?.hidePagination}
                  visibleColumns={riskVisibleColumns}
                />
              )}
            />
          </>
        )}

        {/* Render plugin tab content dynamically */}
        {pluginTabs.some((tab) => tab.value === activeTab) && (
          <PluginSlot
            id={PLUGIN_SLOTS.MODELS_TABS}
            renderType="tab"
            activeTab={activeTab}
            slotProps={{ apiServices }}
          />
        )}

        {activeTab === "evidence-hub" && (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={filterButtonRowStyle}
            >
              {/* Left side: FilterBy + Search + GroupBy */}
              <Stack direction="row" spacing={2} alignItems="center">
                <div data-joyride-id="evidence-type-filter">
                  <FilterBy
                    columns={evidenceFilterColumns}
                    onFilterChange={handleEvidenceFilterChange}
                  />
                </div>
                <GroupBy
                  options={[
                    { id: "evidence_type", label: "Evidence type" },
                    { id: "uploaded_by", label: "Uploaded by" },
                    { id: "model", label: "Model" },
                  ]}
                  onGroupChange={handleGroupChangeEvidence}
                />
                <ColumnSelector
                  columns={evidenceAllColumns}
                  visibleColumns={evidenceVisibleColumns}
                  onToggleColumn={evidenceToggleColumn}
                  onResetToDefaults={evidenceResetToDefaults}
                />
                {/* Search */}
                <Box data-joyride-id="evidence-search">
                  <SearchBox
                    placeholder="Search evidence..."
                    value={searchTypeTerm}
                    onChange={setSearchTypeTerm}
                    inputProps={{
                      "aria-label": "Search evidence",
                    }}
                    fullWidth={false}
                  />
                </Box>
              </Stack>

              {/* Right side: Export and Upload Evidence */}
              <Stack direction="row" gap="8px" alignItems="center">
                <ExportMenu
                  data={evidenceHubExportData}
                  columns={evidenceHubExportColumns}
                  filename="evidence-hub"
                  title="Evidence Hub"
                />
                <div data-joyride-id="add-model-button">
                  <CustomizableButton
                    variant="contained"
                    sx={addNewModelButtonStyle}
                    text="Upload evidence"
                    icon={<AddCircleOutlineIcon size={16} />}
                    onClick={handleNewUploadEvidenceClick}
                    isDisabled={isCreatingDisabled}
                  />
                </div>
              </Stack>
            </Stack>

            <GroupedTableView
              groupedData={groupedEvidenceHub}
              ungroupedData={filteredEvidenceHub}
              renderTable={(data, options) => (
                <EvidenceHubTable
                  key={tableKey}
                  isLoading={isLoading}
                  data={data}
                  onEdit={handleEditEvidence}
                  onDelete={handleDeleteEvidence}
                  modelInventoryData={modelInventoryData}
                  deletingId={deletingEvidenceId}
                  hidePagination={options?.hidePagination}
                  visibleColumns={evidenceVisibleColumns}
                />
              )}
            />
          </>
        )}

      {/* Analytics Drawer */}
      <AnalyticsDrawer
        open={isAnalyticsDrawerOpen}
        onClose={() => setIsAnalyticsDrawerOpen(false)}
        title="Analytics & Trends"
        description="Track your model inventory history over time"
        entityName="Model"
        availableParameters={[
          { value: "status", label: "Status" },
          // Add more parameters here as needed
        ]}
        defaultParameter="status"
      />

      <NewModelInventory
        isOpen={isNewModelInventoryModalOpen}
        setIsOpen={handleCloseModal}
        onSuccess={handleModelInventorySuccess}
        onError={handleModelInventoryError}
        selectedModelInventoryId={selectedModelInventory?.id}
        evidenceData={evidenceHubData}
        handleEditEvidence={handleEditEvidence}
        handleDeleteEvidence={handleDeleteEvidence}
        handleAddEvidence={handleAddEvidence}
        modelInventoryData={modelInventoryData}
        initialData={
          selectedModelInventory
            ? {
                provider_model: selectedModelInventory.provider_model || "",
                provider: selectedModelInventory.provider || "",
                model: selectedModelInventory.model || "",
                version: selectedModelInventory.version || "",
                approver: selectedModelInventory.approver,
                capabilities: selectedModelInventory.capabilities,
                security_assessment: selectedModelInventory.security_assessment,
                status: selectedModelInventory.status,
                status_date: selectedModelInventory.status_date
                  ? new Date(selectedModelInventory.status_date)
                      .toISOString()
                      .split("T")[0]
                  : new Date().toISOString().split("T")[0],
                reference_link: selectedModelInventory.reference_link || "",
                biases: selectedModelInventory.biases || "",
                limitations: selectedModelInventory.limitations || "",
                hosting_provider: selectedModelInventory.hosting_provider || "",
                projects: selectedModelInventory.projects || [],
                frameworks: selectedModelInventory.frameworks || [],
                security_assessment_data:
                  selectedModelInventory.security_assessment_data || [],
              }
            : undefined
        }
        isEdit={!!selectedModelInventory}
      />

      <NewModelRisk
        isOpen={isNewModelRiskModalOpen}
        setIsOpen={handleCloseModelRiskModal}
        onSuccess={handleModelRiskSuccess}
        initialData={
          selectedModelRisk
            ? {
                risk_name: selectedModelRisk.risk_name || "",
                risk_category: selectedModelRisk.risk_category,
                risk_level: selectedModelRisk.risk_level,
                status: selectedModelRisk.status,
                owner: selectedModelRisk.owner,
                target_date: selectedModelRisk.target_date
                  ? new Date(selectedModelRisk.target_date)
                      .toISOString()
                      .split("T")[0]
                  : new Date().toISOString().split("T")[0],
                description: selectedModelRisk.description || "",
                mitigation_plan: selectedModelRisk.mitigation_plan || "",
                impact: selectedModelRisk.impact || "",
                model_id: selectedModelRisk.model_id,
              }
            : undefined
        }
        isEdit={!!selectedModelRisk}
        entityId={selectedModelRisk?.id}
      />

      <NewEvidenceHub
        isOpen={isEvidenceHubModalOpen}
        setIsOpen={handleClosEvidenceModal}
        onSuccess={handleEvidenceUploadModalSuccess}
        onError={handleEvidenceUploadModalError}
        isEdit={!!selectedEvidenceHub}
        initialData={selectedEvidenceHub || undefined}
        preselectedModelId={preselectedModelId}
      />

      <PageTour
        steps={ModelInventorySteps}
        run={true}
        tourKey="model-inventory-tour"
      />

      {/* Share View Dropdown */}
      <ShareViewDropdown
        anchorEl={shareAnchorEl}
        onClose={handleShareClose}
        enabled={isShareEnabled}
        shareableLink={shareableLink}
        initialSettings={shareSettings}
        onEnabledChange={handleShareEnabledChange}
        onGenerateLink={generateShareableLink}
        onSettingsChange={handleShareSettingsChange}
        onCopyLink={handleCopyLink}
        onRefreshLink={handleRefreshLink}
        onOpenLink={handleOpenLink}
      />

      {/* Lifecycle Config is now provided by the model-lifecycle plugin */}
      </PageHeaderExtended>
    </Stack>
  );
};

export default ModelInventory;
