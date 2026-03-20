/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "./index.css";
import { Box, SelectChangeEvent, Stack, useTheme, Fade } from "@mui/material";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import TableWithPlaceholder from "../../components/Table/WithPlaceholder/index";
import RiskTable from "../../components/Table/RisksTable";
import {
  Suspense,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import AddNewVendor from "../../components/Modals/NewVendor";
import { useSelector } from "react-redux";
import { extractUserToken } from "../../../application/tools/extractToken";
import { AppState } from "../../../application/interfaces/appStates";
import useUsers from "../../../application/hooks/useUsers";
import { tabPanelStyle } from "./style";
import { logEngine } from "../../../application/tools/log.engine";
import Alert from "../../components/Alert";
import PageTour from "../../components/PageTour";
import VendorsSteps from "./VendorsSteps";
import useMultipleOnScreen from "../../../application/hooks/useMultipleOnScreen";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import AddNewRisk from "../../components/Modals/NewRisk";
import { CustomizableButton } from "../../components/button/customizable-button";
import CustomizableSkeleton from "../../components/Skeletons";
import CustomizableToast from "../../components/Toast";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import useVendorRisks from "../../../application/hooks/useVendorRisks";
import Select from "../../components/Inputs/Select";
import allowedRoles from "../../../application/constants/permissions";
import SearchBox from "../../components/Search/SearchBox";
import {
  useVendors,
  useDeleteVendor,
} from "../../../application/hooks/useVendors";
import { useProjects } from "../../../application/hooks/useProjects";
import { useDeleteVendorRisk } from "../../../application/hooks/useVendorRiskMutations";
import { getVendorById } from "../../../application/repository/vendor.repository";
import { getVendorRiskById } from "../../../application/repository/vendorRisk.repository";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { VendorModel } from "../../../domain/models/Common/vendor/vendor.model";
import { ExistingRisk } from "../../../domain/interfaces/i.vendor";
import TabBar from "../../components/TabBar";
import { ReviewStatus } from "../../../domain/enums/status.enum";
import { GroupBy } from "../../components/Table/GroupBy";
import {
  useTableGrouping,
  useGroupByState,
} from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { ExportMenu } from "../../components/Table/ExportMenu";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import {
  FilterBy,
  FilterColumn,
  FilterCondition,
} from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import { Project } from "../../../domain/types/Project";

// Constants
const REDIRECT_DELAY_MS = 2000;

type VendorColumnKey = "vendor_name" | "assignee" | "review_status" | "risk" | "scorecard" | "review_date" | "actions";
type VendorRiskColumnKey = "risk_description" | "vendor_name" | "project_titles" | "action_owner" | "risk_severity" | "risk_level" | "actions";

const VENDOR_TABLE_COLUMNS: ColumnConfig<VendorColumnKey>[] = [
  { key: "vendor_name", label: "Name", defaultVisible: true, alwaysVisible: true },
  { key: "assignee", label: "Assignee", defaultVisible: true },
  { key: "review_status", label: "Status", defaultVisible: true },
  { key: "risk", label: "Risks", defaultVisible: true },
  { key: "scorecard", label: "Scorecard", defaultVisible: true },
  { key: "review_date", label: "Review date", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const VENDOR_RISKS_TABLE_COLUMNS: ColumnConfig<VendorRiskColumnKey>[] = [
  { key: "risk_description", label: "Risk description", defaultVisible: true, alwaysVisible: true },
  { key: "vendor_name", label: "Vendor", defaultVisible: true },
  { key: "project_titles", label: "Use case", defaultVisible: true },
  { key: "action_owner", label: "Action owner", defaultVisible: true },
  { key: "risk_severity", label: "Risk severity", defaultVisible: true },
  { key: "risk_level", label: "Risk level", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const Vendors = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authToken = useSelector((state: AppState) => state.auth.authToken);
  const userToken = extractUserToken(authToken);
  const userRoleName = userToken?.roleName || "";
  const { users } = useUsers();

  const [selectedVendor, setSelectedVendor] = useState<VendorModel | null>(
    null
  );
  const [selectedRisk, setSelectedRisk] = useState<ExistingRisk | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<
    "active" | "deleted" | "all"
  >("active");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [risksSearchTerm, setRisksSearchTerm] = useState<string>("");

  // GroupBy state - vendors tab
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // GroupBy state - risks tab
  const {
    groupBy: groupByRisk,
    groupSortOrder: groupSortOrderRisk,
    handleGroupChange: handleGroupChangeRisk,
  } = useGroupByState();

  const {
    visibleColumns: vendorVisibleColumns,
    allColumns: allVendorColumns,
    toggleColumn: toggleVendorColumn,
    resetToDefaults: resetVendorColumns,
  } = useColumnVisibility({
    tableId: "vendors-table",
    columns: VENDOR_TABLE_COLUMNS,
  });

  const {
    visibleColumns: vendorRiskVisibleColumns,
    allColumns: allVendorRiskColumns,
    toggleColumn: toggleVendorRiskColumn,
    resetToDefaults: resetVendorRiskColumns,
  } = useColumnVisibility({
    tableId: "vendor-risks-table",
    columns: VENDOR_RISKS_TABLE_COLUMNS,
  });

  // Selected risk level for card filtering
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string | null>(null);

  const currentPath = location.pathname;
  const isRisksTab = currentPath.includes("/vendors/risks");
  const value = isRisksTab ? "2" : "1";

  // TanStack Query hooks
  const { data: projects = [] } = useProjects();
  const {
    data: vendors = [],
    isLoading: isVendorsLoading,
    refetch: refetchVendors,
  } = useVendors({
    projectId: selectedProjectId,
  });
  const {
    vendorRisksSummary,
    refetchVendorRisks,
    vendorRisks,
    loadingVendorRisks,
  } = useVendorRisks({
    projectId: selectedProjectId?.toString(),
    vendorId: "all",
    filter: filterStatus,
  });

  // FilterBy - Dynamic options generators for Vendors tab
  const getUniqueVendorAssignees = useCallback(() => {
    const assigneeIds = new Set<string>();
    vendors.forEach((vendor: VendorModel) => {
      if (vendor.assignee) {
        assigneeIds.add(vendor.assignee.toString());
      }
    });
    return Array.from(assigneeIds)
      .sort()
      .map((assigneeId) => {
        const user = users.find((u) => u.id.toString() === assigneeId);
        const userName = user
          ? `${user.name} ${user.surname}`.trim()
          : `User ${assigneeId}`;
        return { value: assigneeId, label: userName };
      });
  }, [vendors, users]);

  const getUniqueVendorReviewers = useCallback(() => {
    const reviewerIds = new Set<string>();
    vendors.forEach((vendor: VendorModel) => {
      if (vendor.reviewer) {
        reviewerIds.add(vendor.reviewer.toString());
      }
    });
    return Array.from(reviewerIds)
      .sort()
      .map((reviewerId) => {
        const user = users.find((u) => u.id.toString() === reviewerId);
        const userName = user
          ? `${user.name} ${user.surname}`.trim()
          : `User ${reviewerId}`;
        return { value: reviewerId, label: userName };
      });
  }, [vendors, users]);

  // FilterBy - Filter columns configuration for Vendors tab
  const vendorFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "project_id",
        label: "Use case",
        type: "select" as const,
        options: projects.map((project: Project) => ({
          value: project.id.toString(),
          label: project.project_title,
        })),
      },
      {
        id: "vendor_name",
        label: "Vendor name",
        type: "text" as const,
      },
      {
        id: "review_status",
        label: "Status",
        type: "select" as const,
        options: [
          { value: ReviewStatus.NotStarted, label: "Not started" },
          { value: ReviewStatus.InReview, label: "In review" },
          { value: ReviewStatus.Reviewed, label: "Reviewed" },
          { value: ReviewStatus.RequiresFollowUp, label: "Requires follow-up" },
        ],
      },
      {
        id: "assignee",
        label: "Assignee",
        type: "select" as const,
        options: getUniqueVendorAssignees(),
      },
      {
        id: "reviewer",
        label: "Reviewer",
        type: "select" as const,
        options: getUniqueVendorReviewers(),
      },
      {
        id: "data_sensitivity",
        label: "Data sensitivity",
        type: "select" as const,
        options: [
          { value: "Low", label: "Low" },
          { value: "Medium", label: "Medium" },
          { value: "High", label: "High" },
          { value: "Critical", label: "Critical" },
        ],
      },
      {
        id: "business_criticality",
        label: "Business criticality",
        type: "select" as const,
        options: [
          { value: "Low", label: "Low" },
          { value: "Medium", label: "Medium" },
          { value: "High", label: "High" },
          { value: "Critical", label: "Critical" },
        ],
      },
      {
        id: "review_date",
        label: "Review date",
        type: "date" as const,
      },
    ],
    [projects, getUniqueVendorAssignees, getUniqueVendorReviewers]
  );

  // FilterBy - Field value getter for Vendors tab
  const getVendorFieldValue = useCallback(
    (
      item: VendorModel,
      fieldId: string
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "project_id":
          // Vendors can belong to multiple projects - check if selected project is in the array
          // Return the first project id as string for matching, or use a custom approach
          return item.projects?.map((p) => p.toString()).join(",");
        case "vendor_name":
          return item.vendor_name;
        case "review_status":
          return item.review_status;
        case "assignee":
          return item.assignee?.toString();
        case "reviewer":
          return item.reviewer?.toString();
        case "data_sensitivity":
          return item.data_sensitivity;
        case "business_criticality":
          return item.business_criticality;
        case "review_date":
          return item.review_date;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook for Vendors tab
  const {
    filterData: filterVendorData,
    handleFilterChange: handleVendorFilterChangeBase,
  } = useFilterBy<VendorModel>(getVendorFieldValue);

  // Wrapper to extract project_id from filter conditions and update API filter
  const handleVendorFilterChange = useCallback(
    (conditions: FilterCondition[], logic: "and" | "or") => {
      // Extract project_id from conditions
      const projectCondition = conditions.find(
        (c) => c.columnId === "project_id"
      );
      if (
        projectCondition &&
        projectCondition.operator === "is" &&
        projectCondition.value
      ) {
        setSelectedProjectId(projectCondition.value);
      } else {
        setSelectedProjectId("all");
      }
      // Pass to base handler for client-side filtering
      handleVendorFilterChangeBase(conditions, logic);
    },
    [handleVendorFilterChangeBase]
  );

  // FilterBy - Dynamic options generators for Vendor Risks tab
  const getUniqueRiskVendors = useCallback(() => {
    const vendorIds = new Set<string>();
    vendorRisks.forEach((risk: any) => {
      if (risk.vendor_id) {
        vendorIds.add(risk.vendor_id.toString());
      }
    });
    return Array.from(vendorIds)
      .sort()
      .map((vendorId) => {
        const vendor = vendors.find(
          (v: VendorModel) => v.id?.toString() === vendorId
        );
        const vendorName = vendor ? vendor.vendor_name : `Vendor ${vendorId}`;
        return { value: vendorId, label: vendorName };
      });
  }, [vendorRisks, vendors]);

  const getUniqueRiskActionOwners = useCallback(() => {
    const ownerIds = new Set<string>();
    vendorRisks.forEach((risk: any) => {
      if (risk.action_owner) {
        ownerIds.add(risk.action_owner.toString());
      }
    });
    return Array.from(ownerIds)
      .sort()
      .map((ownerId) => {
        const user = users.find((u) => u.id.toString() === ownerId);
        const userName = user
          ? `${user.name} ${user.surname}`.trim()
          : `User ${ownerId}`;
        return { value: ownerId, label: userName };
      });
  }, [vendorRisks, users]);

  // FilterBy - Filter columns configuration for Vendor Risks tab
  const vendorRiskFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "project_id",
        label: "Use case",
        type: "select" as const,
        options: projects.map((project: Project) => ({
          value: project.id.toString(),
          label: project.project_title,
        })),
      },
      {
        id: "risk_description",
        label: "Risk description",
        type: "text" as const,
      },
      {
        id: "vendor_id",
        label: "Vendor",
        type: "select" as const,
        options: getUniqueRiskVendors(),
      },
      {
        id: "risk_severity",
        label: "Risk severity",
        type: "select" as const,
        options: [
          { value: "Low", label: "Low" },
          { value: "Medium", label: "Medium" },
          { value: "High", label: "High" },
          { value: "Critical", label: "Critical" },
        ],
      },
      {
        id: "risk_level",
        label: "Risk level",
        type: "select" as const,
        options: [
          { value: "Very High", label: "Very high" },
          { value: "High", label: "High" },
          { value: "Medium", label: "Medium" },
          { value: "Low", label: "Low" },
          { value: "Very Low", label: "Very low" },
        ],
      },
      {
        id: "action_owner",
        label: "Action owner",
        type: "select" as const,
        options: getUniqueRiskActionOwners(),
      },
    ],
    [projects, getUniqueRiskVendors, getUniqueRiskActionOwners]
  );

  // FilterBy - Field value getter for Vendor Risks tab
  const getVendorRiskFieldValue = useCallback(
    (item: any, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "project_id":
          return item.project_id?.toString();
        case "risk_description":
          return item.risk_description;
        case "vendor_id":
          return item.vendor_id?.toString();
        case "risk_severity":
          return item.risk_severity;
        case "risk_level":
          return item.risk_level;
        case "action_owner":
          return item.action_owner?.toString();
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook for Vendor Risks tab
  const {
    filterData: filterVendorRiskData,
    handleFilterChange: handleVendorRiskFilterChangeBase,
  } = useFilterBy<any>(getVendorRiskFieldValue);

  // Wrapper to extract project_id from filter conditions and update API filter for vendor risks
  const handleVendorRiskFilterChange = useCallback(
    (conditions: FilterCondition[], logic: "and" | "or") => {
      // Extract project_id from conditions
      const projectCondition = conditions.find(
        (c) => c.columnId === "project_id"
      );
      if (
        projectCondition &&
        projectCondition.operator === "is" &&
        projectCondition.value
      ) {
        setSelectedProjectId(projectCondition.value);
      } else {
        setSelectedProjectId("all");
      }

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
      handleVendorRiskFilterChangeBase(conditions, logic);
    },
    [handleVendorRiskFilterChangeBase]
  );

  // Handle risk card click to filter vendor risks by risk level
  const handleRiskCardClick = useCallback((riskLevel: string) => {
    if (riskLevel) {
      setSelectedRiskLevel(riskLevel);
      setAlert({
        variant: "info",
        title: `Filtering by ${riskLevel} risks`,
        body: "The table now shows only vendor risks with this risk level. Click the card again to see all risks.",
      });
    } else {
      setSelectedRiskLevel(null);
      setAlert(null);
      setShowAlert(false);
    }
  }, []);

  // Mutation hooks
  const deleteVendorMutation = useDeleteVendor();
  const deleteVendorRiskMutation = useDeleteVendorRisk();

  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [showAlert, setShowAlert] = useState(false);

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

  const [runVendorTour, setRunVendorTour] = useState(false);
  const { refs, allVisible } = useMultipleOnScreen<HTMLDivElement>({
    countToTrigger: 1,
  });

  const isCreatingDisabled =
    !allowedRoles.vendors.create.includes(userRoleName) ||
    projects.length === 0;
  const isDeletingAllowed = allowedRoles.vendors.delete.includes(userRoleName);

  const openAddNewVendor = () => {
    setIsOpen(true);
  };
  const handleRiskModal = () => {
    setIsRiskModalOpen((prev) => !prev);
  };

  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    if (newValue === "1") {
      navigate("/vendors");
    } else if (newValue === "2") {
      navigate("/vendors/risks");
    }
  };

  useEffect(() => {
    if (allVisible) {
      setRunVendorTour(true);
    }
  }, [allVisible]);

  // Handle vendorId and riskId URL params to open edit modal from Wise Search
  useEffect(() => {
    if (hasProcessedUrlParam.current || isVendorsLoading) return;

    const vendorId = searchParams.get("vendorId");
    const riskId = searchParams.get("riskId");

    if (vendorId) {
      hasProcessedUrlParam.current = true;
      // Fetch vendor and open edit modal
      getVendorById({ id: Number(vendorId) })
        .then((response) => {
          if (response?.data) {
            setSelectedVendor(response.data);
            setIsOpen(true);
            setSearchParams({}, { replace: true });
          }
        })
        .catch((err) => {
          console.error("Error fetching vendor from URL param:", err);
          setSearchParams({}, { replace: true });
        });
    } else if (riskId) {
      hasProcessedUrlParam.current = true;
      // Switch to risks tab and fetch risk
      if (!isRisksTab) {
        navigate("/vendors/risks", { replace: true });
      }
      getVendorRiskById({ id: Number(riskId) })
        .then((response) => {
          if (response?.data) {
            setSelectedRisk(response.data);
            setIsRiskModalOpen(true);
            setSearchParams({}, { replace: true });
          }
        })
        .catch((err) => {
          console.error("Error fetching vendor risk from URL param:", err);
          setSearchParams({}, { replace: true });
        });
    }
  }, [searchParams, isVendorsLoading, isRisksTab, navigate, setSearchParams]);

  // Auto-open create vendor modal when navigating from "Add new..." dropdown
  useEffect(() => {
    if (location.state?.openCreateModal && !isVendorsLoading) {
      // Check if we're on the risks tab
      if (isRisksTab) {
        // Check if there are any vendors
        if (vendors.length === 0) {
          setAlert({
            variant: "info",
            title: "No vendors available",
            body: "Please create a vendor first before adding vendor risks. Redirecting to vendors tab...",
          });
          // Redirect to vendors tab
          setTimeout(() => {
            navigate("/vendors");
            setIsOpen(true);
            setSelectedVendor(null);
          }, REDIRECT_DELAY_MS);
        } else {
          setIsRiskModalOpen(true);
        }
      } else {
        setIsOpen(true);
        setSelectedVendor(null);
      }

      // Clear the navigation state to prevent re-opening on subsequent navigations
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Dependencies: location.state triggers the effect when openCreateModal is passed via navigation
    // navigate, location.pathname are needed for state clearing
    // isRisksTab, vendors.length, isVendorsLoading determine which modal to open or if validation is needed
  }, [
    location.state,
    navigate,
    location.pathname,
    isRisksTab,
    vendors.length,
    isVendorsLoading,
  ]);

  const handleDeleteVendor = async (vendorId?: number) => {
    if (!vendorId) {
      logEngine({
        type: "error",
        message: "No ID provided for fetching vendor data.",
      });
      setAlert({
        variant: "error",
        body: "No ID provided for fetching vendor data.",
      });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    setIsSubmitting(true);

    try {
      const response = await deleteVendorMutation.mutateAsync(vendorId);

      if (response.status === 202) {
        setAlert({
          variant: "success",
          body: "Vendor deleted successfully.",
        });
        setTimeout(() => {
          setAlert(null);
        }, 3000);
        await refetchVendorRisks();
      } else if (response.status === 404) {
        setAlert({
          variant: "error",
          body: "Vendor not found.",
        });
        setTimeout(() => {
          setAlert(null);
        }, 3000);
      } else {
        console.error("Unexpected response. Please try again.");
        logEngine({
          type: "error",
          message: "Unexpected response. Please try again.",
        });
        setAlert({
          variant: "error",
          body: "Unexpected error. Please try again.",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    } catch (error) {
      console.error("Error deleting vendor:", error);
      logEngine({
        type: "error",
        message: `An error occurred: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to delete vendor. It may have already been deleted or there was a network error.",
      });
      setTimeout(() => setAlert(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRisk = async (riskId: number | undefined) => {
    if (!riskId) {
      setAlert({
        variant: "error",
        body: "Invalid risk ID. Please refresh the page.",
      });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    setIsSubmitting(true);

    try {
      const response = await deleteVendorRiskMutation.mutateAsync(riskId);

      if (response.status === 202) {
        setAlert({
          variant: "success",
          body: "Risk deleted successfully.",
        });
        setTimeout(() => {
          setAlert(null);
        }, 3000);
        await refetchVendorRisks();
      } else if (response.status === 404) {
        setAlert({
          variant: "error",
          body: "Risk not found.",
        });
        setTimeout(() => setAlert(null), 3000);
      } else {
        console.error("Unexpected response. Please try again.");
        logEngine({
          type: "error",
          message: "Unexpected response. Please try again.",
        });
        setAlert({
          variant: "error",
          body: "Unexpected error. Please try again.",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    } catch (error) {
      console.error("Error deleting Risk:", error);
      logEngine({
        type: "error",
        message: `An error occurred: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to delete risk. It may have already been deleted or there was a network error.",
      });
      setTimeout(() => setAlert(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditRisk = async (riskId: number | undefined) => {
    if (!riskId) {
      setAlert({
        variant: "error",
        body: "Invalid risk ID. Please refresh the page.",
      });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    try {
      const response = await getVendorRiskById({
        id: Number(riskId),
      });
      setSelectedRisk(response.data);
      setIsRiskModalOpen(true);
    } catch (e) {
      logEngine({
        type: "error",
        message: "Failed to update risk data.",
      });
      setAlert({
        variant: "error",
        body: "Could not fetch risk data.",
      });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handleEditVendor = async (id?: number) => {
    if (!id) {
      logEngine({
        type: "error",
        message: "No ID provided for fetching vendor data.",
      });
      setAlert({
        variant: "error",
        body: "No ID provided for fetching vendor data.",
      });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    try {
      const response = await getVendorById({
        id: Number(id),
      });
      setSelectedVendor(response.data);
      setIsOpen(true);
    } catch (e) {
      logEngine({
        type: "error",
        message: "Failed to fetch vendor data.",
      });
      setAlert({
        variant: "error",
        body: "Could not fetch vendor data.",
      });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handleFilterStatusChange = (
    event: SelectChangeEvent<string | number>,
    _child: React.ReactNode
  ) => {
    const status = event.target.value as "active" | "deleted" | "all";
    setFilterStatus(status);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  // Filter vendor risks using FilterBy and search
  const filteredVendorRisks = useMemo(() => {
    // First apply FilterBy conditions
    let filtered = filterVendorRiskData(vendorRisks);

    // Apply card filter for risk level (using same matching logic as summary)
    if (selectedRiskLevel) {
      const levelLower = selectedRiskLevel.toLowerCase();
      filtered = filtered.filter((risk) => {
        const riskLevel = (risk.risk_level || "").toLowerCase();
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
            return riskLevel.includes("very low");
          default:
            return true;
        }
      });
    }

    // Then apply search filter
    if (risksSearchTerm.trim()) {
      const query = risksSearchTerm.toLowerCase();
      filtered = filtered.filter((risk) =>
        risk.risk_description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [filterVendorRiskData, vendorRisks, selectedRiskLevel, risksSearchTerm]);

  // Filter vendors using FilterBy and search
  const filteredVendors = useMemo(() => {
    // First apply FilterBy conditions
    let filtered = filterVendorData(vendors);

    // Then apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (vendor: VendorModel) =>
          vendor.vendor_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          vendor.vendor_provides
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          vendor.vendor_contact_person
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [filterVendorData, vendors, searchQuery]);

  // Define how to get the group key for each vendor
  const getVendorGroupKey = (
    vendor: VendorModel,
    field: string
  ): string | string[] => {
    const statusMap: Record<ReviewStatus, string> = {
      [ReviewStatus.NotStarted]: "Not started",
      [ReviewStatus.InReview]: "In review",
      [ReviewStatus.Reviewed]: "Reviewed",
      [ReviewStatus.RequiresFollowUp]: "Requires follow-up",
    };

    switch (field) {
      case "review_status":
        return statusMap[vendor.review_status as ReviewStatus] || "Unknown";
      case "data_sensitivity":
        return vendor.data_sensitivity || "Unknown";
      case "business_criticality":
        return vendor.business_criticality || "Unknown";
      case "assignee":
        if (vendor.assignee) {
          const user = users.find((u) => u.id === Number(vendor.assignee));
          return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
        }
        return "Unassigned";
      case "reviewer":
        if (vendor.reviewer) {
          const user = users.find((u) => u.id === Number(vendor.reviewer));
          return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
        }
        return "No Reviewer";
      default:
        return "Other";
    }
  };

  // Apply grouping to filtered vendors
  const groupedVendors = useTableGrouping({
    data: filteredVendors,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getVendorGroupKey,
  });

  // Define how to get the group key for each vendor risk
  const getVendorRiskGroupKey = (
    risk: any,
    field: string
  ): string | string[] => {
    switch (field) {
      case "risk_severity":
        return risk.risk_severity || "Unknown";
      case "risk_level":
        return risk.risk_level || "Unknown";
      case "vendor_name":
        return risk.vendor_name || "Unknown Vendor";
      case "action_owner":
        if (risk.action_owner) {
          const user = users.find((u) => u.id === Number(risk.action_owner));
          return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
        }
        return "Unassigned";
      default:
        return "Other";
    }
  };

  // Apply grouping to vendor risks
  const groupedVendorRisks = useTableGrouping({
    data: filteredVendorRisks,
    groupByField: groupByRisk,
    sortOrder: groupSortOrderRisk,
    getGroupKey: getVendorRiskGroupKey,
  });

  // Define export columns for vendor table
  const exportColumns = useMemo(() => {
    return [
      { id: "vendor_name", label: "Name" },
      { id: "assignee", label: "Assignee" },
      { id: "review_status", label: "Status" },
      { id: "scorecard", label: "Scorecard" },
      { id: "review_date", label: "Review date" },
    ];
  }, []);

  // Prepare export data - format the data for export
  const exportData = useMemo(() => {
    return filteredVendors.map((vendor: VendorModel) => {
      const assigneeUser = users.find((user) => user.id === vendor.assignee);
      const assigneeName = assigneeUser
        ? `${assigneeUser.name} ${assigneeUser.surname}`
        : "Unassigned";

      return {
        vendor_name: vendor.vendor_name,
        assignee: assigneeName,
        review_status: vendor.review_status || "Not started",
        scorecard:
          vendor.risk_score !== null && vendor.risk_score !== undefined
            ? `${vendor.risk_score}%`
            : "N/A",
        review_date: vendor.review_date || "N/A",
      };
    });
  }, [filteredVendors, users]);

  // Define export columns for vendor risks table
  const vendorRisksExportColumns = useMemo(() => {
    return [
      { id: "risk_description", label: "Risk description" },
      { id: "vendor_name", label: "Vendor" },
      { id: "project_titles", label: "Use case" },
      { id: "action_owner", label: "Action owner" },
      { id: "risk_severity", label: "Risk severity" },
      { id: "likelihood", label: "Likelihood" },
      { id: "risk_level", label: "Risk level" },
    ];
  }, []);

  // Prepare export data for vendor risks
  const vendorRisksExportData = useMemo(() => {
    return vendorRisks.map((risk: any) => {
      const vendor = vendors.find((v) => v.id === risk.vendor_id);
      const vendorName = vendor ? vendor.vendor_name : "-";

      const actionOwnerUser = users.find(
        (user) => user.id === risk.action_owner
      );
      const actionOwnerName = actionOwnerUser
        ? `${actionOwnerUser.name} ${actionOwnerUser.surname}`
        : "-";

      return {
        risk_description: risk.risk_description || "-",
        vendor_name: vendorName,
        project_titles: risk.project_titles || "-",
        action_owner: actionOwnerName,
        risk_severity: risk.risk_severity || "-",
        likelihood: risk.likelihood || "-",
        risk_level: risk.risk_level || "-",
      };
    });
  }, [vendorRisks, vendors, users]);

  return (
    <PageHeaderExtended
      title={value === "1" ? "Vendor list" : "Vendor risks list"}

      description={
        value === "1"
          ? "This table includes a list of external entities that provide AI-related products, services, or components. You can create and manage all vendors here."
          : "This table includes a list of risks related to a vendor. You can create and manage all vendor risks here."
      }
      helpArticlePath={
        value === "1" ? "risk-management/vendor-management" : undefined
      }
      tipBoxEntity="vendors"
      summaryCards={
        value !== "1" &&
        (loadingVendorRisks || isVendorsLoading ? (
          <CustomizableSkeleton
            variant="rectangular"
            width="50%"
            height={100}
          />
        ) : (
          <StatusTileCards
            items={[
              { key: "Total", label: "Total", count: vendorRisksSummary.total, color: "#4B5563" },
              { key: "Very high", label: "Very high", count: vendorRisksSummary.veryHighRisks, color: "#C63622" },
              { key: "High", label: "High", count: vendorRisksSummary.highRisks, color: "#D68B61" },
              { key: "Medium", label: "Medium", count: vendorRisksSummary.mediumRisks, color: "#D6B971" },
              { key: "Low", label: "Low", count: vendorRisksSummary.lowRisks, color: "#52AB43" },
              { key: "Very low", label: "Very low", count: vendorRisksSummary.veryLowRisks, color: "#B8D39C" },
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
        ))
      }
      alert={
        alert && (
          <Suspense fallback={<div>Loading...</div>}>
            <Fade in={showAlert} timeout={300}>
              <Box sx={{ position: 'fixed' }}>
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
      <TabContext value={value}>

        <Box sx={{ mt: 2 }}>
          <TabBar
            tabs={[
              {
                label: "Vendors",
                value: "1",
                icon: "Building",
                count: filteredVendors.length,
                isLoading: isVendorsLoading,
                tooltip: "Third-party AI suppliers and their review status",
              },
              {
                label: "Risks",
                value: "2",
                icon: "AlertTriangle",
                count: filteredVendorRisks.length,
                isLoading: loadingVendorRisks,
                tooltip: "Security and compliance risks from vendor relationships",
              },
            ]}
            activeTab={value}
            onChange={handleChange}
            dataJoyrideId="vendor-list-tab"
          />
        </Box>
          {isVendorsLoading && value === "1" ? (
            <CustomizableSkeleton
              variant="rectangular"
              width={"15%"}
              height={35}
              sx={{ alignSelf: "flex-end" }}
            />
          ) : (
            value === "1" && (
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Stack direction="row" gap={2} alignItems="center">
                    <FilterBy
                      columns={vendorFilterColumns}
                      onFilterChange={handleVendorFilterChange}
                    />
                    <GroupBy
                      options={[
                        { id: "review_status", label: "Status" },
                        { id: "assignee", label: "Assignee" },
                        { id: "reviewer", label: "Reviewer" },
                        { id: "data_sensitivity", label: "Data sensitivity" },
                        {
                          id: "business_criticality",
                          label: "Business criticality",
                        },
                      ]}
                      onGroupChange={handleGroupChange}
                    />
                    <ColumnSelector
                      columns={allVendorColumns}
                      visibleColumns={vendorVisibleColumns}
                      onToggleColumn={toggleVendorColumn}
                      onResetToDefaults={resetVendorColumns}
                    />
                    <SearchBox
                      placeholder="Search vendors..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                      fullWidth={false}
                    />
                  </Stack>
                  <Stack direction="row" gap="8px" alignItems="center">
                    <ExportMenu
                      data={exportData}
                      columns={exportColumns}
                      filename="vendors"
                      title="Vendor List"
                    />
                    <div data-joyride-id="add-new-vendor" ref={refs[0]}>
                      <CustomizableButton
                        variant="contained"
                        text="Add new vendor"
                        sx={{
                          backgroundColor: "brand.primary",
                          border: "1px solid brand.primary",
                          gap: 2,
                        }}
                        icon={<AddCircleOutlineIcon size={16} />}
                        onClick={() => {
                          openAddNewVendor();
                          setSelectedVendor(null);
                        }}
                        isDisabled={isCreatingDisabled}
                      />
                    </div>
                  </Stack>
                </Stack>
              </Stack>
            )
          )}

          {(loadingVendorRisks || isVendorsLoading) && value !== "1" ? (
            <CustomizableSkeleton
              variant="rectangular"
              width={"15%"}
              height={35}
              sx={{ alignSelf: "flex-end" }}
            />
          ) : (
            value !== "1" && (
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Stack direction="row" gap={2} alignItems="center">
                    <Select
                      id="filter-status"
                      value={filterStatus}
                      items={[
                        { _id: "active", name: "Active only" },
                        { _id: "all", name: "Active + deleted" },
                        { _id: "deleted", name: "Deleted only" },
                      ]}
                      onChange={handleFilterStatusChange}
                      sx={{
                        width: "160px",
                        minHeight: "34px",
                        borderRadius: theme.shape.borderRadius,
                      }}
                    />
                    <FilterBy
                      columns={vendorRiskFilterColumns}
                      onFilterChange={handleVendorRiskFilterChange}
                    />
                    <GroupBy
                      options={[
                        { id: "risk_severity", label: "Risk severity" },
                        { id: "risk_level", label: "Risk level" },
                        { id: "vendor_name", label: "Vendor" },
                        { id: "action_owner", label: "Action owner" },
                      ]}
                      onGroupChange={handleGroupChangeRisk}
                    />
                    <ColumnSelector
                      columns={allVendorRiskColumns}
                      visibleColumns={vendorRiskVisibleColumns}
                      onToggleColumn={toggleVendorRiskColumn}
                      onResetToDefaults={resetVendorRiskColumns}
                    />
                    <SearchBox
                      placeholder="Search risks..."
                      value={risksSearchTerm}
                      onChange={setRisksSearchTerm}
                      inputProps={{ "aria-label": "Search risks" }}
                      fullWidth={false}
                    />
                  </Stack>
                  <Stack direction="row" gap="8px" alignItems="center">
                    <ExportMenu
                      data={vendorRisksExportData}
                      columns={vendorRisksExportColumns}
                      filename="vendor-risks"
                      title="Vendor Risks"
                    />
                    <Box data-joyride-id="add-vendor-risk-button">
                      <CustomizableButton
                        variant="contained"
                        text="Add new risk"
                        sx={{
                          backgroundColor: "brand.primary",
                          border: "1px solid brand.primary",
                          gap: 2,
                        }}
                        icon={<AddCircleOutlineIcon size={16} />}
                        onClick={() => {
                          setSelectedRisk(null);
                          handleRiskModal();
                        }}
                        isDisabled={isCreatingDisabled}
                      />
                    </Box>
                  </Stack>
                </Stack>
              </Stack>
            )
          )}

          {isVendorsLoading && value === "1" ? (
            <CustomizableSkeleton
              height={"20vh"}
              minHeight={"20vh"}
              minWidth={260}
              width={"100%"}
              maxWidth={"100%"}
              variant="rectangular"
            />
          ) : (
            <TabPanel value="1" sx={tabPanelStyle}>
              <GroupedTableView
                groupedData={groupedVendors}
                ungroupedData={filteredVendors}
                renderTable={(data, options) => (
                  <TableWithPlaceholder
                    vendors={data}
                    users={users}
                    onDelete={handleDeleteVendor}
                    onEdit={handleEditVendor}
                    hidePagination={options?.hidePagination}
                    vendorRisks={vendorRisks}
                    visibleColumns={vendorVisibleColumns}
                  />
                )}
              />
            </TabPanel>
          )}
          {(loadingVendorRisks || isVendorsLoading) && value !== "1" ? (
            <CustomizableSkeleton
              height={"20vh"}
              minHeight={"20vh"}
              minWidth={260}
              width={"100%"}
              maxWidth={"100%"}
              variant="rectangular"
            />
          ) : (
            <TabPanel value="2" sx={tabPanelStyle}>
              <GroupedTableView
                groupedData={groupedVendorRisks}
                ungroupedData={filteredVendorRisks}
                renderTable={(data, options) => (
                  <RiskTable
                    users={users}
                    vendors={vendors}
                    vendorRisks={data}
                    onDelete={handleDeleteRisk}
                    onEdit={handleEditRisk}
                    isDeletingAllowed={isDeletingAllowed}
                    hidePagination={options?.hidePagination}
                    visibleColumns={vendorRiskVisibleColumns}
                  />
                )}
              />
            </TabPanel>
          )}
      </TabContext>

      <AddNewVendor
        isOpen={isOpen}
        setIsOpen={() => setIsOpen(false)}
        value={value}
        onSuccess={async () => {
          await refetchVendorRisks();
          await refetchVendors();
        }}
        existingVendor={selectedVendor}
      />
      <AddNewRisk
        isOpen={isRiskModalOpen}
        handleChange={handleChange}
        setIsOpen={handleRiskModal}
        value={value}
        onSuccess={refetchVendorRisks}
        existingRisk={selectedRisk}
        vendors={vendors}
      />
      {isSubmitting && (
        <CustomizableToast title="Processing your request. Please wait..." />
      )}

      <PageTour
        steps={VendorsSteps}
        run={runVendorTour}
        onFinish={() => {
          localStorage.setItem("vendor-tour", "true");
          setRunVendorTour(false);
        }}
        tourKey="vendor-tour"
      />
    </PageHeaderExtended>
  );
};

export default Vendors;
