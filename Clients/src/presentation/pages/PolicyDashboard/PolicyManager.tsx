import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Box, Stack, Fade, Tooltip, IconButton } from "@mui/material";
import {
  CirclePlus as AddCircleOutlineIcon,
  FolderOpen,
  FileText,
  Sparkles,
  Shield,
  Link2,
} from "lucide-react";
import PolicyTable from "../../components/Policies/PolicyTable";
import { CustomizableButton } from "../../components/button/customizable-button";
import { deletePolicy } from "../../../application/repository/policy.repository";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { SearchBox } from "../../components/Search";
import { handleAlert } from "../../../application/tools/alertUtils";
import Alert from "../../components/Alert";
import { AlertProps } from "../../types/alert.types";
import { PolicyManagerModel } from "../../../domain/models/Common/policy/policyManager.model";
import { PolicyManagerProps } from "../../types/interfaces/i.policy";
import PolicyStatusCard from "./PolicyStatusCard";
import { ExportMenu } from "../../components/Table/ExportMenu";
import useUsers from "../../../application/hooks/useUsers";
import { GroupBy } from "../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import LinkedPolicyModal from "../../components/Policies/LinkedPolicyModal";
import { displayFormattedDate } from "../../tools/isoDateToString";
import { useVirtualFolders } from "../../../application/hooks/useVirtualFolders";
import { FolderTree } from "../FileManager/components/FolderTree";
import { CreateFolderModal } from "../FileManager/components/CreateFolderModal";
import { AssignToFolderModal } from "../FileManager/components/AssignToFolderModal";
import {
  getPolicyFolders,
  getPolicyIdsInFolder,
  updatePolicyFolders,
} from "../../../application/repository/policyFolder.repository";
import type {
  IFolderTreeNode,
  IVirtualFolder,
  IVirtualFolderInput,
} from "../../../domain/interfaces/i.virtualFolder";

type PolicyColumnKey =
  | "title"
  | "status"
  | "next_review"
  | "author"
  | "last_updated"
  | "updated_by"
  | "actions";

const POLICY_TABLE_COLUMNS: ColumnConfig<PolicyColumnKey>[] = [
  { key: "title", label: "Title", defaultVisible: true, alwaysVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "next_review", label: "Next review", defaultVisible: true },
  { key: "author", label: "Author", defaultVisible: true },
  { key: "last_updated", label: "Last updated", defaultVisible: true },
  { key: "updated_by", label: "Updated by", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const PolicyManager: React.FC<PolicyManagerProps> = ({
  policies: policyList,
  tags: _tags,
  fetchAll,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [policies, setPolicies] = useState<PolicyManagerModel[]>([]);
  const [flashRowId, setFlashRowId] = useState<number | null>(null);

  const [showLinkedObjectModal, setLinkedObjectsModalOpen] = useState(false);
  const [policyId, setSelectedPolicyId] = useState<number | null>(null);

  useEffect(() => {
    setPolicies(policyList);
  }, [policyList]);

  // Folder sidebar state
  const [folderSidebarOpen, setFolderSidebarOpen] = useState(false);
  const [folderSidebarCollapsed, setFolderSidebarCollapsed] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderParent, setCreateFolderParent] = useState<IFolderTreeNode | null>(null);

  // Assign to folder modal state
  const [assignFolderOpen, setAssignFolderOpen] = useState(false);
  const [assignFolderPolicyId, setAssignFolderPolicyId] = useState<number | null>(null);
  const [assignFolderCurrentFolders, setAssignFolderCurrentFolders] = useState<IVirtualFolder[]>(
    [],
  );
  const [assignFolderSubmitting, setAssignFolderSubmitting] = useState(false);

  // Policy IDs filtered by selected folder
  const [folderPolicyIds, setFolderPolicyIds] = useState<number[] | null>(null);

  // Virtual folders hooks
  const {
    folderTree,
    selectedFolder,
    setSelectedFolder,
    loading: foldersLoading,
    handleCreateFolder,
    refreshFolders,
  } = useVirtualFolders();

  const handleCreateFolderSubmit = useCallback(
    async (input: IVirtualFolderInput) => {
      await handleCreateFolder(input);
      setCreateFolderOpen(false);
      setCreateFolderParent(null);
    },
    [handleCreateFolder],
  );

  // Fetch policy IDs when a folder is selected
  useEffect(() => {
    if (typeof selectedFolder === "number") {
      getPolicyIdsInFolder(selectedFolder)
        .then(setFolderPolicyIds)
        .catch(() => setFolderPolicyIds([]));
    } else {
      setFolderPolicyIds(null);
    }
  }, [selectedFolder]);

  // New state for filter + search
  const [searchTerm, setSearchTerm] = useState("");
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Navigate to editor page when coming from "Add new..." dropdown
  useEffect(() => {
    if (location.state?.openCreateModal) {
      navigate("/policies/new", { replace: true });
    }
  }, [location.state, navigate]);

  // Handle success message from editor page via navigation state
  useEffect(() => {
    if (location.state?.successMessage) {
      if (location.state.flashRowId) {
        setFlashRowId(location.state.flashRowId);
        setTimeout(() => setFlashRowId(null), 3000);
      }
      fetchAll();
      handleAlert({
        variant: "success",
        body: location.state.successMessage,
        setAlert,
        alertTimeout: 4000,
      });
      // Clear state so it doesn't trigger again
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname, fetchAll]);

  const handleOpen = useCallback(
    (id?: number) => {
      if (!id) {
        navigate("/policies/new");
      } else {
        navigate(`/policies/${id}/edit`);
      }
    },
    [navigate],
  );

  // Handle policyId URL param to redirect to editor from Wise Search
  useEffect(() => {
    const policyIdParam = searchParams.get("policyId");
    if (policyIdParam) {
      setSearchParams({}, { replace: true });
      navigate(`/policies/${policyIdParam}/edit`);
    }
  }, [searchParams, setSearchParams, navigate]);

  const handleAddNewPolicy = () => {
    handleOpen();
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePolicy(id);
      setPolicies((prev) => prev.filter((policy) => policy.id !== id));

      // Show success alert using VerifyWise standard pattern
      handleAlert({
        variant: "success",
        body: "Policy deleted successfully!",
        setAlert,
        alertTimeout: 4000, // 4 seconds to give users time to read
      });
    } catch (err) {
      console.error(err);

      // Show error alert for failed deletion
      handleAlert({
        variant: "error",
        body: "Failed to delete policy. Please try again.",
        setAlert,
        alertTimeout: 4000,
      });
    }
  };

  const handleLinkedObject = async (id: number) => {
    try {
      setSelectedPolicyId(id);
      setLinkedObjectsModalOpen(true);
    } catch (err) {
      console.error(err);

      // Show error alert for failed deletion
      handleAlert({
        variant: "error",
        body: "Failed to delete policy. Please try again.",
        setAlert,
        alertTimeout: 4000,
      });
    }
  };

  const handleCloseLinkedObjects = () => {
    setLinkedObjectsModalOpen(false);
  };

  // Assign to folder handlers
  const handleAssignToFolder = useCallback(async (id: number) => {
    try {
      const currentFolders = await getPolicyFolders(id);
      setAssignFolderPolicyId(id);
      setAssignFolderCurrentFolders(currentFolders);
      setAssignFolderOpen(true);
    } catch (err) {
      console.error("Failed to fetch policy folders:", err);
      handleAlert({
        variant: "error",
        body: "Failed to load folder assignments.",
        setAlert,
        alertTimeout: 4000,
      });
    }
  }, []);

  const handleAssignFolderSubmit = useCallback(
    async (folderIds: number[]) => {
      if (!assignFolderPolicyId) return;
      setAssignFolderSubmitting(true);
      try {
        await updatePolicyFolders(assignFolderPolicyId, folderIds);
        setAssignFolderOpen(false);
        setAssignFolderPolicyId(null);
        setAssignFolderCurrentFolders([]);
        await refreshFolders();
        // Refresh folder filter if a folder is currently selected
        if (typeof selectedFolder === "number") {
          const updatedIds = await getPolicyIdsInFolder(selectedFolder);
          setFolderPolicyIds(updatedIds);
        }
        handleAlert({
          variant: "success",
          body: "Folder assignment updated.",
          setAlert,
          alertTimeout: 4000,
        });
      } catch (err) {
        console.error("Failed to update policy folders:", err);
        handleAlert({
          variant: "error",
          body: "Failed to update folder assignment.",
          setAlert,
          alertTimeout: 4000,
        });
      } finally {
        setAssignFolderSubmitting(false);
      }
    },
    [assignFolderPolicyId, refreshFolders],
  );

  // Handle policy card click to filter by status
  const handleStatusCardClick = useCallback((status: string) => {
    if (!status || status === "total") {
      setSelectedStatus(null);
      setAlert(null);
    } else {
      setSelectedStatus(status);
      setAlert({
        variant: "info",
        title: `Filtering by ${status} status`,
        body: "Click the card again or click Total to see all policies.",
      });
    }
  }, []);

  // Auto-dismiss info alert after 3 seconds with fade animation
  useEffect(() => {
    if (alert && alert.variant === "info") {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  const { users } = useUsers();

  const { visibleColumns, allColumns, toggleColumn, resetToDefaults } = useColumnVisibility({
    tableId: "policy-manager-table",
    columns: POLICY_TABLE_COLUMNS,
  });

  // FilterBy - Dynamic options generators
  const getUniqueAuthors = useCallback(() => {
    const authorIds = new Set<string>();
    policies.forEach((policy) => {
      if (policy.author_id) {
        authorIds.add(policy.author_id.toString());
      }
    });
    return Array.from(authorIds)
      .map((authorId) => {
        const user = users.find((u) => u.id.toString() === authorId);
        const userName = user ? `${user.name} ${user.surname}`.trim() : `User ${authorId}`;
        return { value: authorId, label: userName };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [policies, users]);

  // FilterBy - Filter columns configuration
  const policyFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "title",
        label: "Title",
        type: "text" as const,
      },
      {
        id: "status",
        label: "Status",
        type: "select" as const,
        options: [
          { value: "Draft", label: "Draft" },
          { value: "Under Review", label: "Under review" },
          { value: "Approved", label: "Approved" },
          { value: "Published", label: "Published" },
          { value: "Archived", label: "Archived" },
          { value: "Deprecated", label: "Deprecated" },
        ],
      },
      {
        id: "author_id",
        label: "Author",
        type: "select" as const,
        options: getUniqueAuthors(),
      },
      {
        id: "next_review_date",
        label: "Next review date",
        type: "date" as const,
      },
    ],
    [getUniqueAuthors],
  );

  // FilterBy - Field value getter
  const getPolicyFieldValue = useCallback(
    (item: PolicyManagerModel, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "title":
          return item.title;
        case "status":
          return item.status;
        case "author_id":
          return item.author_id?.toString();
        case "next_review_date":
          return item.next_review_date;
        default:
          return null;
      }
    },
    [],
  );

  // FilterBy - Initialize hook
  const { filterData: filterPolicyData, handleFilterChange: handlePolicyFilterChange } =
    useFilterBy<PolicyManagerModel>(getPolicyFieldValue);

  // ✅ Filter + search using FilterBy
  const filteredPolicies = useMemo(() => {
    let result = filterPolicyData(policies);

    // Apply folder filter
    if (folderPolicyIds !== null) {
      const idSet = new Set(folderPolicyIds);
      result = result.filter((p) => idSet.has(p.id));
    }

    // Apply card filter for status
    if (selectedStatus) {
      result = result.filter((p) => p.status === selectedStatus);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(query));
    }

    return result;
  }, [filterPolicyData, policies, selectedStatus, searchTerm, folderPolicyIds]);

  // Define how to get the group key for each policy
  const getPolicyGroupKey = useCallback(
    (policy: PolicyManagerModel, field: string): string => {
      switch (field) {
        case "status":
          return policy.status || "Unknown";
        case "author":
          if (policy.author_id) {
            const user = users.find((u) => u.id === policy.author_id);
            return user ? `${user.name} ${user.surname}`.trim() : "Unknown";
          }
          return "Unknown";
        default:
          return "Other";
      }
    },
    [users],
  );

  // Apply grouping to filtered policies
  const groupedPolicies = useTableGrouping({
    data: filteredPolicies,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getPolicyGroupKey,
  });

  // Define export columns for policy table
  const exportColumns = useMemo(() => {
    return [
      { id: "title", label: "Title" },
      { id: "status", label: "Status" },
      { id: "next_review", label: "Next Review" },
      { id: "author", label: "Author" },
      { id: "last_updated", label: "Last Updated" },
      { id: "updated_by", label: "Updated By" },
    ];
  }, []);

  // Prepare export data - format the data for export
  const exportData = useMemo(() => {
    return filteredPolicies.map((policy: PolicyManagerModel) => {
      const authorUser = users.find((user) => user.id === policy.author_id);
      const authorName = authorUser ? `${authorUser.name} ${authorUser.surname}` : "-";

      const updatedByUser = users.find((user) => user.id === policy.last_updated_by);
      const updatedByName = updatedByUser ? `${updatedByUser.name} ${updatedByUser.surname}` : "-";

      return {
        title: policy.title || "-",
        status: policy.status || "-",
        next_review: policy.next_review_date ? displayFormattedDate(policy.next_review_date) : "-",
        author: authorName,
        last_updated: policy.last_updated_at ? displayFormattedDate(policy.last_updated_at) : "-",
        updated_by: updatedByName,
      };
    });
  }, [filteredPolicies, users]);

  return (
    <>
      <CreateFolderModal
        isOpen={createFolderOpen}
        onClose={() => {
          setCreateFolderOpen(false);
          setCreateFolderParent(null);
        }}
        onSubmit={handleCreateFolderSubmit}
        parentFolder={createFolderParent}
      />

      <Stack className="vwhome" gap={"16px"}>
        {/* Policy by Status Cards */}
        <Box data-joyride-id="policy-status-cards">
          <PolicyStatusCard
            policies={policies}
            onCardClick={handleStatusCardClick}
            selectedStatus={selectedStatus}
          />
        </Box>

        {/* Filter + Search + Add Button row */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={4}
          sx={{ width: "100%" }}
        >
          {/* Left side: Filter + Group + Search together */}
          <Stack direction="row" spacing={2} alignItems="center">
            {/* FilterBy */}
            <div data-joyride-id="policy-status-filter">
              <FilterBy columns={policyFilterColumns} onFilterChange={handlePolicyFilterChange} />
            </div>

            {/* Group By */}
            <GroupBy
              options={[
                { id: "status", label: "Status" },
                { id: "author", label: "Author" },
              ]}
              onGroupChange={handleGroupChange}
            />

            {/* Column Selector */}
            <ColumnSelector
              columns={allColumns}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onResetToDefaults={resetToDefaults}
            />

            {/* Search */}
            <Box data-joyride-id="policy-search">
              <SearchBox
                placeholder="Search policies..."
                value={searchTerm}
                onChange={setSearchTerm}
                inputProps={{ "aria-label": "Search policies" }}
                fullWidth={false}
              />
            </Box>
          </Stack>

          {/* Right side: Documents toggle, Export and Add Button */}
          <Stack direction="row" gap="8px" alignItems="center">
            <Tooltip title="Documents" arrow>
              <IconButton
                onClick={() => setFolderSidebarOpen((prev) => !prev)}
                size="small"
                sx={{
                  color: folderSidebarOpen ? "brand.primary" : "text.muted",
                  padding: "4px",
                  borderRadius: "4px",
                  backgroundColor: folderSidebarOpen ? "#E6F4F1" : "transparent",
                  "&:hover": {
                    backgroundColor: folderSidebarOpen ? "#D1EDE6" : "#F2F4F7",
                  },
                }}
              >
                <FolderOpen size={16} />
              </IconButton>
            </Tooltip>
            <ExportMenu
              data={exportData}
              columns={exportColumns}
              filename="policy-manager"
              title="Policy Manager"
            />
            <Box data-joyride-id="add-policy-button">
              <CustomizableButton
                variant="contained"
                text="Add new policy"
                sx={{
                  backgroundColor: "brand.primary",
                  border: "1px solid brand.primary",
                  gap: 3,
                }}
                icon={<AddCircleOutlineIcon size={16} />}
                onClick={handleAddNewPolicy}
              />
            </Box>
          </Stack>
        </Stack>

        {/* Folder sidebar + Table */}
        <Stack direction="row" sx={{ gap: "8px", mt: 1 }}>
          {/* Folder sidebar */}
          {folderSidebarOpen && (
            <Stack
              sx={{
                width: folderSidebarCollapsed ? 48 : 260,
                minWidth: folderSidebarCollapsed ? 48 : 260,
                backgroundColor: "#FAFBFC",
                border: "1px solid #d0d5dd",
                borderRadius: "4px",
                overflow: "hidden",
                transition: "width 200ms ease, min-width 200ms ease",
                // Override FolderTree's internal borderRight since this wrapper already has a full border
                "& > .MuiStack-root": {
                  borderRight: "none",
                },
              }}
            >
              <FolderTree
                folders={folderTree}
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
                onCreateFolder={(parentId) => {
                  const parent =
                    parentId !== null ? (folderTree.find((f) => f.id === parentId) ?? null) : null;
                  setCreateFolderParent(parent);
                  setCreateFolderOpen(true);
                }}
                loading={foldersLoading}
                canManage
                collapsed={folderSidebarCollapsed}
                onToggleCollapse={() => setFolderSidebarCollapsed((p) => !p)}
                allLabel="All policies"
                showUncategorized={false}
              />
            </Stack>
          )}

          {/* Table / Empty state */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {filteredPolicies.length === 0 ? (
              <EmptyState
                icon={FileText}
                message={
                  searchTerm
                    ? "No matching policies found."
                    : "No policies yet. Policies define the rules your organization follows for AI governance."
                }
                imageAlt="No policies available"
              >
                {!searchTerm && (
                  <>
                    <EmptyStateTip
                      icon={Sparkles}
                      title="Create from templates"
                      description="Start with a blank policy or use one of the built-in templates. Fill in the details for your organization and publish when ready."
                    />
                    <EmptyStateTip
                      icon={Shield}
                      title="Link policies to controls"
                      description="Each policy can be mapped to specific compliance controls, creating an audit trail showing which policies address which requirements."
                    />
                    <EmptyStateTip
                      icon={Link2}
                      title="Common policies to start with"
                      description="AI Ethics Policy, Data Governance Policy, AI Risk Management Policy, Incident Response Policy, and Third-Party AI Vendor Policy."
                    />
                  </>
                )}
              </EmptyState>
            ) : (
              <GroupedTableView
                groupedData={groupedPolicies}
                ungroupedData={filteredPolicies}
                renderTable={(data, options) => (
                  <PolicyTable
                    data={data}
                    onOpen={handleOpen}
                    onDelete={handleDelete}
                    onLinkedObjects={handleLinkedObject}
                    onAssignToFolder={handleAssignToFolder}
                    hidePagination={options?.hidePagination}
                    flashRowId={flashRowId}
                    visibleColumns={visibleColumns}
                  />
                )}
              />
            )}
          </Box>
        </Stack>

        {/* Linked Objects Modal */}
        {showLinkedObjectModal && (
          <LinkedPolicyModal
            onClose={handleCloseLinkedObjects}
            policyId={policyId}
            isOpen={showLinkedObjectModal}
          />
        )}

        {/* Assign to Folder Modal */}
        <AssignToFolderModal
          isOpen={assignFolderOpen}
          onClose={() => {
            setAssignFolderOpen(false);
            setAssignFolderPolicyId(null);
            setAssignFolderCurrentFolders([]);
          }}
          onSubmit={handleAssignFolderSubmit}
          folders={folderTree}
          currentFolders={assignFolderCurrentFolders}
          fileName={
            assignFolderPolicyId
              ? policies.find((p) => p.id === assignFolderPolicyId)?.title
              : undefined
          }
          isSubmitting={assignFolderSubmitting}
        />

        {alert && (
          <Fade in={showAlert} timeout={300}>
            <Box>
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
        )}
      </Stack>
    </>
  );
};

export default PolicyManager;
