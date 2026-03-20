import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Box, Stack, Popover, Typography, IconButton } from "@mui/material";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import { CustomizableButton } from "../../components/button/customizable-button";
import { BarChart3, ChevronDown } from "lucide-react"
import ibmLogo from "../../assets/ibm_logo.svg";
import mitLogo from "../../assets/mit_logo.svg";
import VWProjectRisksTable from "../../components/Table/VWProjectRisksTable";
import SearchBox from "../../components/Search/SearchBox";
import AddNewRiskForm from "../../components/AddNewRiskForm";
import StandardModal from "../../components/Modals/StandardModal";
import { handleAlert } from "../../../application/tools/alertUtils";
import Alert from "../../components/Alert";
import { deleteEntityById, getEntityById } from "../../../application/repository/entity.repository";
import CustomizableToast from "../../components/Toast";
import CustomizableSkeleton from "../../components/Skeletons";
import allowedRoles from "../../../application/constants/permissions";
import AddNewRiskMITModal from "../../components/AddNewRiskMITForm";
import AddNewRiskIBMModal from "../../components/AddNewRiskIBMForm";
import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import useUsers from "../../../application/hooks/useUsers";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import PageTour from "../../components/PageTour";
import RiskManagementSteps from "./RiskManagementSteps";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import AnalyticsDrawer from "../../components/AnalyticsDrawer";
import { ExportMenu } from "../../components/Table/ExportMenu";
import { GroupBy } from "../../components/Table/GroupBy";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { FilterBy, FilterColumn, FilterCondition } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import { useEntityChangeHistory } from "../../../application/hooks/useEntityChangeHistory";
import { PluginSlot } from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";
import { usePluginRegistry } from "../../../application/contexts/PluginRegistry.context";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  riskMainStackStyle,
  riskFilterRowStyle,
  analyticsIconButtonStyle,
  addNewRiskButtonStyle,
  riskPopoverStyle,
  riskPopoverContentStyle,
  riskMenuItemStyle,
  riskMenuItemTitleStyle,
  riskMenuItemSubtitleStyle,
  riskDividerContainerStyle,
  riskDividerLineStyle,
  riskDividerTextStyle,
  riskCardsGridStyle,
  aiRiskCardBaseStyle,
  aiRiskCardIbmStyle,
  aiRiskCardRecommendedBadgeStyle,
  aiRiskCardLogoStyle,
  aiRiskCardTitleStyle,
  aiRiskCardCaptionStyle,
} from "./style";
import { text } from "../../themes/palette";

/**
 * Set initial loading status for all CRUD process
 */
interface LoadingStatus {
  loading: boolean;
  message: string;
}

const initialLoadingState: LoadingStatus = {
  loading: false,
  message: "",
};


const RiskManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const { userRoleName } = useAuth();
  const { users, loading: usersLoading } = useUsers();
  const [refreshKey, setRefreshKey] = useState(0); // Add refreshKey state
  const [projectRisks, setProjectRisks] = useState<RiskModel[]>([]);
  const [selectedRow, setSelectedRow] = useState<RiskModel[]>([]);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [, setShowAlert] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] =
    useState<LoadingStatus>(initialLoadingState);
  const [showCustomizableSkeleton, setShowCustomizableSkeleton] =
    useState<boolean>(false);
  const [currentRow, setCurrentRow] = useState<number | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isIBMModalOpen, setIsIBMModalOpen] = useState(false);
  const [insertFromMenuAnchor, setInsertFromMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedRiskData, setSelectedRiskData] = useState<{
    riskName: string;
    actionOwner: number;
    aiLifecyclePhase: number;
    riskDescription: string;
    riskCategory: number[];
    potentialImpact: string;
    assessmentMapping: number;
    controlsMapping: number;
    likelihood: number;
    riskSeverity: number;
    riskLevel: number;
    reviewNotes: string;
    applicableProjects: number[];
    applicableFrameworks: number[];
  } | null>(null);

  // State for filtering
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isAnalyticsDrawerOpen, setIsAnalyticsDrawerOpen] = useState(false);

  // Modal state for StandardModal pattern
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAiRiskModalOpen, setIsAiRiskModalOpen] = useState(false);
  const [isSubmitting] = useState(false);

  // Refs for form submission
  const onSubmitRef = useRef<(() => void) | null>(null);
  const onAiRiskSubmitRef = useRef<(() => void) | null>(null);

  // Check if risk-import plugin is installed via plugin registry
  const { getComponentsForSlot } = usePluginRegistry();
  const hasRiskImportPlugin = getComponentsForSlot(PLUGIN_SLOTS.RISKS_ACTIONS).length > 0;

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Column visibility management
  type RiskColumn = 'risk_name' | 'risk_owner' | 'severity' | 'mitigation_status' | 'risk_level_autocalculated' | 'deadline' | 'controls_mapping' | 'actions';

  const RISK_COLUMNS: ColumnConfig<RiskColumn>[] = useMemo(
    () => [
      { key: 'risk_name', label: 'Risk name', defaultVisible: true, alwaysVisible: true },
      { key: 'risk_owner', label: 'Owner', defaultVisible: true },
      { key: 'severity', label: 'Severity', defaultVisible: true },
      { key: 'mitigation_status', label: 'Mitigation status', defaultVisible: true },
      { key: 'risk_level_autocalculated', label: 'Risk level', defaultVisible: true },
      { key: 'deadline', label: 'Target date', defaultVisible: true },
      { key: 'controls_mapping', label: 'Controls', defaultVisible: true },
      { key: 'actions', label: 'Actions', defaultVisible: true, alwaysVisible: true },
    ],
    []
  );

  const { visibleColumns, allColumns, toggleColumn, resetToDefaults } =
    useColumnVisibility<RiskColumn>({
      tableId: 'risk-management-table',
      columns: RISK_COLUMNS,
    });

  // Selected risk level for card filtering
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string | null>(null);

  // Prefetch history data when modal opens in edit mode
  useEntityChangeHistory(
    "risk",
    isRiskModalOpen && selectedRow.length > 0 && selectedRow[0]?.id ? selectedRow[0].id : 0
  );

  // FilterBy configuration
  const getUniqueOwners = useCallback(() => {
    const ownerIds = new Set<string>();
    projectRisks.forEach((risk) => {
      if (risk.risk_owner) {
        ownerIds.add(risk.risk_owner.toString());
      }
    });

    return Array.from(ownerIds)
      .sort()
      .map((ownerId) => {
        const user = users.find((u) => u.id.toString() === ownerId);
        const userName = user ? `${user.name} ${user.surname}`.trim() : `User ${ownerId}`;
        return { value: ownerId, label: userName };
      });
  }, [projectRisks, users]);

  const filterColumns: FilterColumn[] = useMemo(() => [
    {
      id: 'risk_name',
      label: 'Risk name',
      type: 'text' as const,
    },
    {
      id: 'risk_description',
      label: 'Description',
      type: 'text' as const,
    },
    {
      id: 'severity',
      label: 'Severity',
      type: 'select' as const,
      options: [
        { value: 'Very High', label: 'Very High' },
        { value: 'High', label: 'High' },
        { value: 'Medium', label: 'Medium' },
        { value: 'Low', label: 'Low' },
        { value: 'Very Low', label: 'Very Low' },
      ],
    },
    {
      id: 'risk_level',
      label: 'Risk level',
      type: 'select' as const,
      options: [
        { value: 'Very High', label: 'Very High' },
        { value: 'High', label: 'High' },
        { value: 'Medium', label: 'Medium' },
        { value: 'Low', label: 'Low' },
        { value: 'Very Low', label: 'Very Low' },
      ],
    },
    {
      id: 'mitigation_status',
      label: 'Mitigation status',
      type: 'select' as const,
      options: [
        { value: 'Completed', label: 'Completed' },
        { value: 'In Progress', label: 'In Progress' },
        { value: 'Not Started', label: 'Not Started' },
      ],
    },
    {
      id: 'risk_owner',
      label: 'Risk owner',
      type: 'select' as const,
      options: getUniqueOwners(),
    },
    {
      id: 'impact',
      label: 'Impact',
      type: 'text' as const,
    },
    {
      id: 'deadline',
      label: 'Target date',
      type: 'date' as const,
    },
    {
      id: 'date_of_assessment',
      label: 'Assessment date',
      type: 'date' as const,
    },
  ], [getUniqueOwners]);

  // Get field value for filtering
  const getRiskFieldValue = useCallback((risk: RiskModel, fieldId: string): string | number | Date | null | undefined => {
    switch (fieldId) {
      case 'risk_name':
        return risk.risk_name;
      case 'risk_description':
        return risk.risk_description;
      case 'severity':
        return risk.severity;
      case 'risk_level':
        return risk.current_risk_level || risk.risk_level_autocalculated;
      case 'mitigation_status':
        return risk.mitigation_status;
      case 'risk_owner':
        return risk.risk_owner?.toString();
      case 'impact':
        return risk.impact;
      case 'deadline':
        return risk.deadline;
      case 'date_of_assessment':
        return risk.date_of_assessment;
      default:
        return null;
    }
  }, []);

  const { filterData, handleFilterChange: handleFilterByChangeBase } = useFilterBy<RiskModel>(getRiskFieldValue);

  // Wrapper to sync selected risk level card with filter conditions
  const handleFilterByChange = useCallback(
    (conditions: FilterCondition[], logic: "and" | "or") => {
      // Sync selected risk level card with filter conditions
      const riskLevelCondition = conditions.find(
        (c) => c.columnId === "risk_level"
      );
      if (
        riskLevelCondition &&
        riskLevelCondition.operator === "is" &&
        riskLevelCondition.value
      ) {
        setSelectedRiskLevel(riskLevelCondition.value);
      } else {
        setSelectedRiskLevel(null);
      }

      // Pass to base handler for client-side filtering
      handleFilterByChangeBase(conditions, logic);
    },
    [handleFilterByChangeBase]
  );

  // Handle risk card click to filter risks by risk level
  const handleRiskCardClick = useCallback((riskLevel: string) => {
    if (!riskLevel || riskLevel === 'Total') {
      setSelectedRiskLevel(null);
      setAlert(null);
      setShowAlert(false);
    } else {
      setSelectedRiskLevel(riskLevel);
      setAlert({
        variant: 'info',
        title: `Filtering by ${riskLevel} risk level`,
        body: 'Click the card again or click Total to see all risks.',
      });
    }
  }, []);

  // Auto-dismiss info alert after 3 seconds with fade animation
  useEffect(() => {
    if (alert && alert.variant === 'info') {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Apply FilterBy and search filters
  const filteredRisks = useMemo(() => {
    // First apply FilterBy conditions
    let filtered = filterData(projectRisks);

    // Apply card filter for risk level (using same matching logic as summary at lines 298-318)
    if (selectedRiskLevel) {
      const levelLower = selectedRiskLevel.toLowerCase();
      filtered = filtered.filter((risk) => {
        const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
        switch (levelLower) {
          case "very high":
            return riskLevel.includes("very high");
          case "high":
            return riskLevel.includes("high") && !riskLevel.includes("very high");
          case "medium":
            return riskLevel.includes("medium");
          case "low":
            return riskLevel.includes("low") && !riskLevel.includes("very low");
          case "very low":
            return riskLevel.includes("very low") || riskLevel.includes("no risk");
          default:
            return true;
        }
      });
    }

    // Then apply search term
    if (!searchTerm.trim()) {
      return filtered;
    }

    return filtered.filter((risk) =>
      risk.risk_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.risk_description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [filterData, projectRisks, selectedRiskLevel, searchTerm]);

  // Compute risk summary from fetched data
  const risksSummary = useMemo(() => {
    const veryHighRisks = projectRisks.filter(risk => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("very high");
    }).length;
    const highRisks = projectRisks.filter(risk => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("high") && !riskLevel.includes("very high");
    }).length;
    const mediumRisks = projectRisks.filter(risk => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("medium");
    }).length;
    const lowRisks = projectRisks.filter(risk => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("low") && !riskLevel.includes("very low");
    }).length;
    const veryLowRisks = projectRisks.filter(risk => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("very low") || riskLevel.includes("no risk");
    }).length;

    return {
      total: projectRisks.length,
      veryHighRisks,
      highRisks,
      mediumRisks,
      lowRisks,
      veryLowRisks,
    };
  }, [projectRisks]);

  // Define export columns for risk management table
  const exportColumns = useMemo(() => {
    return [
      { id: 'risk_name', label: 'Risk Name' },
      { id: 'risk_owner', label: 'Owner' },
      { id: 'severity', label: 'Severity' },
      { id: 'likelihood', label: 'Likelihood' },
      { id: 'mitigation_status', label: 'Mitigation Status' },
      { id: 'risk_level', label: 'Risk Level' },
      { id: 'deadline', label: 'Target Date' },
      { id: 'controls_mapping', label: 'Linked Controls' },
    ];
  }, []);

  // Prepare export data - format the data for export
  const exportData = useMemo(() => {
    const dataToExport = filteredRisks.length > 0 ? filteredRisks : projectRisks;
    return dataToExport.map((risk: RiskModel) => {
      const ownerUser = users.find((user) => user.id === risk.risk_owner);
      const ownerName = ownerUser ? `${ownerUser.name} ${ownerUser.surname}` : '-';

      return {
        risk_name: risk.risk_name || '-',
        risk_owner: ownerName,
        severity: risk.severity || '-',
        likelihood: risk.likelihood || '-',
        mitigation_status: risk.mitigation_status || '-',
        risk_level: risk.current_risk_level || risk.risk_level_autocalculated || '-',
        deadline: risk.deadline || '-',
        controls_mapping: risk.controls_mapping || '-',
      };
    });
  }, [filteredRisks, projectRisks, users]);

  const fetchProjectRisks = useCallback(async (filter: 'active' | 'deleted' | 'all' = 'active') => {
    try {
      const response = await getAllProjectRisks({ filter });
      setShowCustomizableSkeleton(false);
      setProjectRisks(response.data);
    } catch (error) {
      console.error("Error fetching project risks:", error);
      handleToast(
        "error",
        "Unexpected error occurs while fetching project risks."
      );
    }
  }, []);

  useEffect(() => {
    setShowCustomizableSkeleton(true);
    fetchProjectRisks();
  }, [fetchProjectRisks, refreshKey]);

  // Auto-open create risk popup when navigating from "Add new..." dropdown
  useEffect(() => {
    if (location.state?.openCreateModal) {
      setIsRiskModalOpen(true);
      setSelectedRow([]);

      // Clear the navigation state to prevent re-opening on subsequent navigations
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Handle riskId URL param to open edit modal from Wise Search
  useEffect(() => {
    const riskId = searchParams.get("riskId");
    if (riskId && !hasProcessedUrlParam.current && !showCustomizableSkeleton) {
      hasProcessedUrlParam.current = true;

      // First check if risk is already in local state
      const existingRisk = projectRisks.find((r) => r.id === parseInt(riskId, 10));
      if (existingRisk) {
        setSelectedRow([existingRisk]);
        setIsRiskModalOpen(true);
        setSearchParams({}, { replace: true });
      } else {
        // Fetch from server if not in local state
        getEntityById({ routeUrl: `/projectRisks/${riskId}` })
          .then((response) => {
            if (response?.data) {
              setSelectedRow([response.data]);
              setIsRiskModalOpen(true);
              setSearchParams({}, { replace: true });
            }
          })
          .catch((err) => {
            console.error("Error fetching risk from URL param:", err);
            setSearchParams({}, { replace: true });
          });
      }
    }
  }, [searchParams, projectRisks, showCustomizableSkeleton, setSearchParams]);

  /**
   * Handle actions for project risk modal
   * Display tostify for create and update project risk
   */
  const handleRiskModalClose = () => {
    setIsRiskModalOpen(false);
    setSelectedRow([]);
  };

  const handleRiskModalSubmit = () => {
    if (onSubmitRef.current) {
      onSubmitRef.current();
    }
  };

  const handleInsertFromMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setInsertFromMenuAnchor(event.currentTarget);
  };

  const handleInsertFromMenuClose = () => {
    setInsertFromMenuAnchor(null);
  };

  const handleMITModalOpen = () => {
    setIsAIModalOpen(true);
    handleInsertFromMenuClose();
  };

  const handleIBMModalOpen = () => {
    setIsIBMModalOpen(true);
    handleInsertFromMenuClose();
  };

  const handleAiRiskModalClose = () => {
    setIsAiRiskModalOpen(false);
    setSelectedRiskData(null);
  };

  const handleAiRiskModalSubmit = () => {
    if (onAiRiskSubmitRef.current) {
      onAiRiskSubmitRef.current();
    }
  };

  const handleRiskSelected = (riskData: {
    riskName: string;
    actionOwner: number;
    aiLifecyclePhase: number;
    riskDescription: string;
    riskCategory: number[];
    potentialImpact: string;
    assessmentMapping: number;
    controlsMapping: number;
    likelihood: number;
    riskSeverity: number;
    riskLevel: number;
    reviewNotes: string;
    applicableProjects: number[];
    applicableFrameworks: number[];
  }) => {
    setSelectedRiskData({
      ...riskData,
      applicableProjects: riskData.applicableProjects || [],
      applicableFrameworks: riskData.applicableFrameworks || [],
    });
    setIsAiRiskModalOpen(true);
  };

  const handleLoading = (message: string) => {
    setIsLoading((prev) => ({ ...prev, loading: true, message: message }));
  };

  const handleToast = (type: "success" | "info" | "warning" | "error", message: string) => {
    handleAlert({
      variant: type,
      body: message,
      setAlert,
    });
    setTimeout(() => {
      setAlert(null);
    }, 3000);
  };

  const handleSuccess = () => {
    setTimeout(() => {
      setIsLoading(initialLoadingState);
      handleToast("success", "Risk created successfully");
    }, 1000);

    // set pagination for FIFO risk listing after adding a new risk
    const rowsPerPage = 5;
    const pageCount = Math.floor(projectRisks.length / rowsPerPage);
    setCurrentPage(pageCount);

    fetchProjectRisks();
    setRefreshKey((prevKey) => prevKey + 1);
  };

  const handleUpdate = () => {
    // Set flash immediately to ensure visibility
    setCurrentRow(selectedRow[0].id!); // set current row to trigger flash-feedback
    
    setTimeout(() => {
      setIsLoading(initialLoadingState);
      handleToast("success", "Risk updated successfully");
      // Fetch fresh data after flash is set
      fetchProjectRisks();
    }, 500);

    setTimeout(() => {
      setCurrentRow(null);
    }, 3000); // Flash duration consistent with other tables
    setRefreshKey((prevKey) => prevKey + 1);
  };

  const handleError = (errorMessage: string) => {
    setIsLoading(initialLoadingState);
    handleToast("error", errorMessage);
  };

  const handleDelete = async (riskId: number) => {
    handleLoading("Deleting the risk. Please wait...");
    try {
      const response = await deleteEntityById({
        routeUrl: `/projectRisks/${riskId}`,
      });
      if (response.status === 200) {

          // Delete the risk from all linked policies
      try {
        await deleteEntityById({
          routeUrl: `/policy-linked/risk/${riskId}/unlink-all`, 
        });
      } catch (linkedError) {
        console.error("Error deleting risk from linked policies", linkedError);
        handleToast("warning", "Risk deleted but failed to remove from some linked policies.");
      }


        // Set current pagination number after deleting the risk
        const rowsPerPage = 5;
        const rowCount = projectRisks.slice(
          currentPage * rowsPerPage,
          currentPage * rowsPerPage + rowsPerPage
        );

        if (currentPage !== 0 && rowCount.length === 1) {
          setCurrentPage(currentPage - 1);
        } else {
          setCurrentPage(currentPage);
        }
        setTimeout(() => {
          setIsLoading(initialLoadingState);
          handleToast("success", "Risk deleted successfully.");
        }, 1000);

        fetchProjectRisks();
        setRefreshKey((prevKey) => prevKey + 1);
      } else if (response.status === 404) {
        setIsLoading(initialLoadingState);
        handleToast("error", "Risk not found.");
      } else {
        setIsLoading(initialLoadingState);
        handleToast("error", "Unexpected error occurs. Risk delete fails.");
      }
    } catch (error) {
      console.error("Error sending request", error);
      setIsLoading(initialLoadingState);
      handleToast("error", "Risk delete fails.");
    }
  };

  const setCurrentPagingation = (page: number) => {
    setCurrentPage(page);
  };

  // Define how to get the group key for each risk
  const getRiskGroupKey = useCallback((risk: RiskModel, field: string): string => {
    switch (field) {
      case 'risk_level':
        return risk.current_risk_level || risk.risk_level_autocalculated || 'Unknown';
      case 'mitigation_status':
        return risk.mitigation_status || 'Unknown';
      case 'owner':
        if (risk.risk_owner) {
          const user = users.find((u) => u.id === risk.risk_owner);
          return user ? `${user.name} ${user.surname}`.trim() : 'Unknown';
        }
        return 'Unassigned';
      case 'severity':
        return risk.severity || 'Unknown';
      default:
        return 'Other';
    }
  }, [users]);

  // Apply grouping to filtered risks
  const groupedRisks = useTableGrouping({
    data: filteredRisks,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getRiskGroupKey,
  });

  return (
    <PageHeaderExtended
      title="Risk Management"
      description="Manage and monitor risks across all your projects"

      helpArticlePath="risk-management/risk-assessment"
      tipBoxEntity="risk-management"
      summaryCards={
        <StatusTileCards
          items={[
            { key: "Total", label: "Total", count: risksSummary.total, color: "#4B5563" },
            { key: "Very high", label: "Very high", count: risksSummary.veryHighRisks, color: "#C63622" },
            { key: "High", label: "High", count: risksSummary.highRisks, color: "#D68B61" },
            { key: "Medium", label: "Medium", count: risksSummary.mediumRisks, color: "#D6B971" },
            { key: "Low", label: "Low", count: risksSummary.lowRisks, color: "#52AB43" },
            { key: "Very low", label: "Very low", count: risksSummary.veryLowRisks, color: "#B8D39C" },
          ] satisfies StatusTileItem[]}
          onCardClick={(key) => {
            if (key === "Total" || key === selectedRiskLevel) {
              handleRiskCardClick("");
            } else {
              handleRiskCardClick(key);
            }
          }}
          selectedKey={selectedRiskLevel}
          entityName="risk"
          size="small"
        />
      }
      summaryCardsJoyrideId="risk-summary-cards"
      alert={
        alert && (
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        )
      }
      loadingToast={isLoading.loading && <CustomizableToast title={isLoading.message} />}
    >

      <Stack
        className="risk-management-row"
        sx={riskMainStackStyle}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-end"
        >
          <Box sx={riskFilterRowStyle}>
            <div data-joyride-id="risk-filters">
              <FilterBy
                columns={filterColumns}
                onFilterChange={handleFilterByChange}
              />
            </div>
            <GroupBy
              options={[
                { id: 'risk_level', label: 'Risk level' },
                { id: 'mitigation_status', label: 'Mitigation status' },
                { id: 'owner', label: 'Owner' },
                { id: 'severity', label: 'Severity' },
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
              placeholder="Search risks..."
              value={searchTerm}
              onChange={setSearchTerm}
              inputProps={{ "aria-label": "Search risks"}}
              fullWidth={false}
            />
          </Box>
          <Stack direction="row" gap="8px" alignItems="center">
            <ExportMenu
              data={exportData}
              columns={exportColumns}
              filename="risk-management"
              title="Risk Management"
            />
            <div data-joyride-id="analytics-button">
              <IconButton
                onClick={() => setIsAnalyticsDrawerOpen(true)}
                aria-label="Analytics"
                sx={analyticsIconButtonStyle}
              >
                <BarChart3 size={16} color={text.secondary} />
              </IconButton>
            </div>
            <div data-joyride-id="add-risk-button">
              <CustomizableButton
                variant="contained"
                text="Add new risk"
                sx={addNewRiskButtonStyle}
                onClick={handleInsertFromMenuOpen as (event: unknown) => void}
                icon={<ChevronDown size={16} />}
                isDisabled={
                  !allowedRoles.projectRisks.create.includes(userRoleName)
                }
              />
              <Popover
                id="insert-risk-mega-dropdown"
                open={Boolean(insertFromMenuAnchor)}
                anchorEl={insertFromMenuAnchor}
                onClose={handleInsertFromMenuClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "right",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                sx={riskPopoverStyle}
              >
                <Box
                  role="menu"
                  aria-label="Add new risk menu"
                  sx={riskPopoverContentStyle}
                >
                  {/* Add new risk option */}
                  <Box
                    role="menuitem"
                    tabIndex={0}
                    aria-label="Add new risk manually"
                    onClick={() => {
                      handleInsertFromMenuClose();
                      setIsRiskModalOpen(true);
                    }}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleInsertFromMenuClose();
                        setIsRiskModalOpen(true);
                      }
                    }}
                    sx={riskMenuItemStyle}
                  >
                    <Box>
                      <Typography
                        sx={riskMenuItemTitleStyle}
                      >
                        Add new risk
                      </Typography>
                      <Typography
                        sx={riskMenuItemSubtitleStyle}
                      >
                        Create a custom risk manually
                      </Typography>
                    </Box>
                  </Box>

                  {/* Divider with text */}
                  <Box
                    sx={riskDividerContainerStyle}
                  >
                    <Box sx={riskDividerLineStyle} />
                    <Typography sx={riskDividerTextStyle}>
                      Or import from
                    </Typography>
                    <Box sx={riskDividerLineStyle} />
                  </Box>

                  {/* AI Risk databases grid */}
                  <Box
                    sx={riskCardsGridStyle(hasRiskImportPlugin)}
                  >
                  <Box
                    role="menuitem"
                    tabIndex={0}
                    aria-label="Insert risk from IBM AI Risk database"
                    onClick={handleIBMModalOpen}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleIBMModalOpen();
                      }
                    }}
                    sx={aiRiskCardIbmStyle}
                  >
                    <Box
                      sx={aiRiskCardRecommendedBadgeStyle}
                    >
                      Recommended
                    </Box>
                    <img src={ibmLogo} alt="IBM Logo" style={aiRiskCardLogoStyle} />
                    <Typography
                      variant="body2"
                      sx={aiRiskCardTitleStyle}
                    >
                      IBM AI Risk database
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={aiRiskCardCaptionStyle}
                    >
                      113 risks covering agentic AI, data privacy, inference attacks, and operational failures
                    </Typography>
                  </Box>
                  <Box
                    role="menuitem"
                    tabIndex={0}
                    aria-label="Insert risk from MIT AI Risk database"
                    onClick={handleMITModalOpen}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleMITModalOpen();
                      }
                    }}
                    sx={aiRiskCardBaseStyle}
                  >
                    <img src={mitLogo} alt="MIT Logo" style={aiRiskCardLogoStyle} />
                    <Typography
                      variant="body2"
                      sx={aiRiskCardTitleStyle}
                    >
                      MIT AI Risk database
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={aiRiskCardCaptionStyle}
                    >
                      Academic research-based risks covering AI safety, fairness, and societal impact
                    </Typography>
                  </Box>

                  {/* Plugin Slot for Risk Import menu items */}
                  <PluginSlot
                    id={PLUGIN_SLOTS.RISKS_ACTIONS}
                    renderType="menuitem"
                    slotProps={{
                      onMenuClose: handleInsertFromMenuClose,
                      onImportComplete: () => setRefreshKey((prev) => prev + 1),
                      onTriggerModal: (modalName: string) => {
                        if (modalName === "RiskImportModal") {
                          setIsImportModalOpen(true);
                        }
                      },
                    }}
                  />
                  </Box>
                </Box>
              </Popover>

              {/* Plugin modals rendered outside Popover so they persist when menu closes */}
              <PluginSlot
                id={PLUGIN_SLOTS.RISKS_ACTIONS}
                renderType="modal"
                slotProps={{
                  open: isImportModalOpen,
                  onClose: () => setIsImportModalOpen(false),
                  onImportComplete: () => {
                    setRefreshKey((prev) => prev + 1);
                    setIsImportModalOpen(false);
                  },
                  apiServices,
                }}
              />
            </div>
          </Stack>
        </Stack>

        {/* Table Section */}
        {showCustomizableSkeleton ? (
          <CustomizableSkeleton />
        ) : (
          <GroupedTableView
            groupedData={groupedRisks}
            ungroupedData={filteredRisks}
            renderTable={(data, options) => (
              <VWProjectRisksTable
                rows={data}
                setPage={setCurrentPagingation}
                page={currentPage}
                setSelectedRow={(row: RiskModel) => setSelectedRow([row])}
                setAnchor={() => setIsRiskModalOpen(true)}
                onDeleteRisk={handleDelete}
                flashRow={currentRow}
                hidePagination={options?.hidePagination}
                visibleColumns={visibleColumns}
              />
            )}
          />
        )}

        {/* Add/Edit Risk Modal */}
        <StandardModal
          isOpen={isRiskModalOpen}
          onClose={handleRiskModalClose}
          title={selectedRow.length > 0 ? "Edit project risk" : "Add a new risk"}
          description={selectedRow.length > 0
            ? "Modify the risk details and mitigation strategies."
            : "Create a detailed breakdown of risks and their mitigation strategies to assist in documenting your risk management activities effectively."
          }
          onSubmit={handleRiskModalSubmit}
          submitButtonText={selectedRow.length > 0 ? "Update" : "Save"}
          isSubmitting={isSubmitting}
          maxWidth="1039px"
        >
          <AddNewRiskForm
            closePopup={handleRiskModalClose}
            popupStatus={selectedRow.length > 0 ? "edit" : "new"}
            onSuccess={selectedRow.length > 0 ? handleUpdate : handleSuccess}
            onError={handleError}
            onLoading={handleLoading}
            users={users}
            usersLoading={usersLoading}
            onSubmitRef={onSubmitRef}
            entityId={selectedRow.length > 0 ? selectedRow[0]?.id : undefined}
          />
        </StandardModal>
      </Stack>
      <AddNewRiskMITModal
        isOpen={isAIModalOpen}
        setIsOpen={setIsAIModalOpen}
        onRiskSelected={handleRiskSelected}
      />
      <AddNewRiskIBMModal
        isOpen={isIBMModalOpen}
        setIsOpen={setIsIBMModalOpen}
        onRiskSelected={handleRiskSelected}
      />
      {/* AI Risk Modal */}
      <StandardModal
        isOpen={isAiRiskModalOpen && !!selectedRiskData}
        onClose={handleAiRiskModalClose}
        title="Add a new risk from AI database"
        description="Review and edit the selected risk from the AI database before saving."
        onSubmit={handleAiRiskModalSubmit}
        submitButtonText="Save"
        isSubmitting={isSubmitting}
        maxWidth="1039px"
      >
        <AddNewRiskForm
          closePopup={handleAiRiskModalClose}
          popupStatus="new"
          onSuccess={handleSuccess}
          onError={handleError}
          onLoading={handleLoading}
          initialRiskValues={selectedRiskData || undefined}
          users={users}
          usersLoading={usersLoading}
          onSubmitRef={onAiRiskSubmitRef}
        />
      </StandardModal>

      {/* Analytics Drawer */}
      <AnalyticsDrawer
        open={isAnalyticsDrawerOpen}
        onClose={() => setIsAnalyticsDrawerOpen(false)}
        title="Risk Analytics & Trends"
        description="Track your project risks history over time"
        entityName="Risk"
        chartType="risk"
        availableParameters={[
          { value: "severity", label: "Severity" },
          { value: "likelihood", label: "Likelihood" },
          { value: "mitigation_status", label: "Mitigation status" },
          { value: "risk_level", label: "Risk level" },
        ]}
        defaultParameter="risk_level"
      />

      <PageTour steps={RiskManagementSteps} run={true} tourKey="risk-management-tour" />
    </PageHeaderExtended>
  );
};

export default RiskManagement;