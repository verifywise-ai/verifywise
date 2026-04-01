/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Box, Stack } from "@mui/material";
import { ReactComponent as AddCircleOutlineIcon } from "../../assets/icons/plus-circle-white.svg";
import { SearchBox } from "../../components/Search";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { CustomizableButton } from "../../components/button/customizable-button";
import { logEngine } from "../../../application/tools/log.engine";
import {
  archiveIncidentById,
  getAllEntities,
  getEntityById,
  updateEntityById,
} from "../../../application/repository/entity.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import {
  addNewIncidentButton,
  incidentFilterRow,
} from "./style";
import IncidentTable from "./IncidentTable";
import NewIncident from "../../components/Modals/NewIncident";
import {
  IncidentManagementStatus,
  Severity,
} from "../../../domain/enums/aiIncidentManagement.enum";
import { createIncidentManagement } from "../../../application/repository/incident_management.repository";
import { StatusTileCards } from "../../components/Cards/StatusTileCards";
import PageTour from "../../components/PageTour";
import IncidentManagementSteps from "./IncidentManagementSteps";
import { AIIncidentManagementModel } from "../../../domain/models/Common/incidentManagement/incidentManagement.model";
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

const Alert = React.lazy(() => import("../../components/Alert"));

type IncidentColumnKey =
  | "incident_id"
  | "ai_project"
  | "type"
  | "severity"
  | "status"
  | "occurred_date"
  | "approved_by"
  | "actions";

const INCIDENT_TABLE_COLUMNS: ColumnConfig<IncidentColumnKey>[] = [
  { key: "incident_id", label: "Incident ID", defaultVisible: true, alwaysVisible: true },
  { key: "ai_project", label: "AI project", defaultVisible: true },
  { key: "type", label: "Type", defaultVisible: true },
  { key: "severity", label: "Severity", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "occurred_date", label: "Occurred date", defaultVisible: true },
  { key: "approved_by", label: "Approved by", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const IncidentManagement: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [incidentsData, setIncidentsData] = useState<
    AIIncidentManagementModel[]
  >([]);
  const [selectedIncident, setSelectedIncident] =
    useState<AIIncidentManagementModel | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [, setIsModalLoading] = useState(false);
  const [isNewIncidentModalOpen, setIsNewIncidentModalOpen] = useState(false);
  const [, setSelectedIncidentId] = useState<string | null>(null);
  const [, setUsers] = useState<any[]>([]);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [, setShowAlert] = useState(false);
  const [tableKey, setTableKey] = useState(0);

  const { userRoleName } = useAuth();

  const [archiveId, setArchiveId] = useState<string | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Card filter state
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  // Auto-dismiss info alerts after 3 seconds
  useEffect(() => {
    if (alert && alert.variant === "info") {
      const timer = setTimeout(() => setAlert(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  const [mode, setModalMode] = useState("");

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Column visibility
  const {
    visibleColumns: incidentVisibleColumns,
    allColumns: allIncidentColumns,
    toggleColumn: toggleIncidentColumn,
    resetToDefaults: resetIncidentColumns,
  } = useColumnVisibility({
    tableId: "incidents-table",
    columns: INCIDENT_TABLE_COLUMNS,
  });

  const isCreatingDisabled =
    !userRoleName || !["Admin", "Editor"].includes(userRoleName);

  // FilterBy - Dynamic options generators
  const getUniqueProjects = useCallback(() => {
    const projectNames = new Set<string>();
    incidentsData.forEach((incident) => {
      if (incident.ai_project) {
        projectNames.add(incident.ai_project);
      }
    });
    return Array.from(projectNames)
      .sort()
      .map((project) => ({
        value: project,
        label: project,
      }));
  }, [incidentsData]);

  const getUniqueTypes = useCallback(() => {
    const types = new Set<string>();
    incidentsData.forEach((incident) => {
      if (incident.type) {
        types.add(incident.type);
      }
    });
    return Array.from(types)
      .sort()
      .map((type) => ({
        value: type,
        label: type,
      }));
  }, [incidentsData]);

  // FilterBy - Filter columns configuration
  const incidentFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "incident_id",
        label: "Incident ID",
        type: "text" as const,
      },
      {
        id: "ai_project",
        label: "AI project",
        type: "select" as const,
        options: getUniqueProjects(),
      },
      {
        id: "type",
        label: "Type",
        type: "select" as const,
        options: getUniqueTypes(),
      },
      {
        id: "severity",
        label: "Severity",
        type: "select" as const,
        options: [
          { value: Severity.MINOR, label: "Minor" },
          { value: Severity.SERIOUS, label: "Serious" },
          { value: Severity.VERY_SERIOUS, label: "Very serious" },
        ],
      },
      {
        id: "status",
        label: "Status",
        type: "select" as const,
        options: [
          { value: IncidentManagementStatus.OPEN, label: "Open" },
          {
            value: IncidentManagementStatus.INVESTIGATED,
            label: "Investigating",
          },
          { value: IncidentManagementStatus.MITIGATED, label: "Mitigated" },
          { value: IncidentManagementStatus.CLOSED, label: "Closed" },
        ],
      },
      {
        id: "occurred_date",
        label: "Occurred date",
        type: "date" as const,
      },
    ],
    [getUniqueProjects, getUniqueTypes]
  );

  // FilterBy - Field value getter
  const getIncidentFieldValue = useCallback(
    (
      item: AIIncidentManagementModel,
      fieldId: string
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "incident_id":
          return item.incident_id;
        case "ai_project":
          return item.ai_project;
        case "type":
          return item.type;
        case "severity":
          return item.severity;
        case "status":
          return item.status;
        case "occurred_date":
          return item.occurred_date;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook
  const {
    filterData: filterIncidentData,
    handleFilterChange: handleIncidentFilterChange,
  } = useFilterBy<AIIncidentManagementModel>(getIncidentFieldValue);

  /** -------------------- FILTERING -------------------- */
  const filteredData = useMemo(() => {
    // Filter out archived items first
    const nonArchivedData = incidentsData.filter((i) => !i.archived);

    // Apply card filter by status
    let result = selectedStatus
      ? nonArchivedData.filter((i) => i.status === selectedStatus)
      : nonArchivedData;

    // Apply FilterBy conditions
    result = filterIncidentData(result);

    // Apply search filter last
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(
        (i) =>
          (i.id || "").toString().toLowerCase().includes(search) ||
          (i.ai_project || "").toLowerCase().includes(search) ||
          (i.reporter || "").toLowerCase().includes(search)
      );
    }

    return result;
  }, [filterIncidentData, incidentsData, searchTerm, selectedStatus]);

  // Define how to get the group key for each incident
  const getIncidentGroupKey = (
    incident: AIIncidentManagementModel,
    field: string
  ): string | string[] => {
    switch (field) {
      case "severity":
        return incident.severity || "Unknown";
      case "status":
        return incident.status || "Unknown";
      case "type":
        return incident.type || "Unknown";
      case "ai_project":
        return incident.ai_project || "Unknown Project";
      default:
        return "Other";
    }
  };

  // Apply grouping to filtered incidents
  const groupedIncidents = useTableGrouping({
    data: filteredData,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getIncidentGroupKey,
  });

  /** -------------------- FETCHING -------------------- */
  const fetchIncidentsData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const response = await getAllEntities({
        routeUrl: "/ai-incident-managements",
      });
      // if (response?.data) setIncidentsData(response.data);
      if (response?.data) {
        const formatted = response.data.map(
          (item: AIIncidentManagementModel) =>
            new AIIncidentManagementModel(item)
        );
        setIncidentsData(formatted);
      }
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to fetch incidents: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to load incidents. Please try again later.",
      });
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const fetchUsersData = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      const usersData = Array.isArray(response?.data) ? response.data : [];
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  /** -------------------- ALERT HANDLING -------------------- */
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

  /** -------------------- CHECK FOR NAVIGATION STATE -------------------- */
  useEffect(() => {
    const state = location.state as { openCreateModal?: boolean } | null;
    if (state?.openCreateModal) {
      setIsNewIncidentModalOpen(true);
      setModalMode("new");
      // Clear the state to prevent modal from opening again on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Dependencies: location contains state from mega dropdown navigation, navigate used for state clearing
  }, [location, navigate]);

  // Handle incidentId URL param to open view modal from Wise Search
  useEffect(() => {
    const incidentId = searchParams.get("incidentId");
    if (incidentId && !hasProcessedUrlParam.current && !isLoading) {
      hasProcessedUrlParam.current = true;
      // Use existing handleViewIncident pattern which fetches and opens modal
      handleViewIncident(incidentId, "view");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, isLoading, setSearchParams]);

  /** -------------------- INITIAL LOAD -------------------- */
  useEffect(() => {
    fetchIncidentsData();
    fetchUsersData();
  }, []);

  /** -------------------- INCIDENT MODAL HANDLERS -------------------- */
  const handleNewIncidentClick = () => setIsNewIncidentModalOpen(true);

  const fetchIncidentDataForSelectedId = async (id: string) => {
    try {
      setIsModalLoading(true);
      const response = await getEntityById({
        routeUrl: `/ai-incident-managements/${id}`,
      });
      if (response?.data) {
        const incident = new AIIncidentManagementModel(response.data);
        setSelectedIncident(incident);
        return incident;
      } else {
        setAlert({
          variant: "error",
          body: "No incident data found for this ID.",
        });
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      setAlert({
        variant: "error",
        body: "Failed to load incident details.",
      });
      return null;
    } finally {
      setIsModalLoading(false);
    }
  };

  const handleEditIncident = async (id: string, mode: string) => {
    setSelectedIncidentId(id);
    setModalMode(mode);
    const data = await fetchIncidentDataForSelectedId(id);
    if (data) setIsNewIncidentModalOpen(true);
  };

  const handleViewIncident = async (id: string, mode: string) => {
    setSelectedIncidentId(id);
    setModalMode(mode);
    const data = await fetchIncidentDataForSelectedId(id);
    if (data) setIsNewIncidentModalOpen(true);
  };

  const handleArchiveIncident = async (id: string, mode: string) => {
    try {
      setSelectedIncidentId(id);
      setModalMode(mode);
      setArchiveId(id);

      // Optimistically remove from local state for snappy UI feedback
      setIncidentsData((prevData) =>
        prevData.filter((item) => item.id?.toString() !== id)
      );

      //API route to match your backend: /:id/archive
      await archiveIncidentById({
        routeUrl: `/ai-incident-managements/${id}`,
        body: {},
      });

      // Re-fetch to ensure consistent state
      await fetchIncidentsData(false);

      // Force table refresh
      setTableKey((prev) => prev + 1);

      setAlert({
        variant: "success",
        body: "Incident archived successfully.",
      });
    } catch (error) {
      console.error("❌ Error archiving incident:", error);

      // Revert optimistic update
      await fetchIncidentsData(false);

      setAlert({
        variant: "error",
        body: "Failed to archive incident. Please try again.",
      });
    } finally {
      setSelectedIncidentId(null);
      setModalMode("");
      setArchiveId(null);
    }
  };

  const handleCloseModal = () => {
    setIsNewIncidentModalOpen(false);
    setSelectedIncident(null);
    setSelectedIncidentId(null);
    setModalMode("");
    setArchiveId(null);
  };

  const handleIncidentSuccess = async (formData: any) => {
    try {
      if (selectedIncident) {
        await updateEntityById({
          routeUrl: `/ai-incident-managements/${selectedIncident.id}`,
          body: formData,
        });
        setAlert({
          variant: "success",
          body: "Incident updated successfully!",
        });
      } else {
        await createIncidentManagement("/ai-incident-managements", formData);
        setAlert({
          variant: "success",
          body: "New incident added successfully!",
        });
      }
      await fetchIncidentsData();
      handleCloseModal();
    } catch {
      setAlert({
        variant: "error",
        body: selectedIncident
          ? "Failed to update incident."
          : "Failed to add incident.",
      });
    }
  };

  /** -------------------- EXPORT DATA -------------------- */
  const exportColumns = useMemo(() => {
    return [
      { id: "incident_id", label: "Incident ID" },
      { id: "ai_project", label: "AI project" },
      { id: "type", label: "Type" },
      { id: "severity", label: "Severity" },
      { id: "status", label: "Status" },
      { id: "occurred_date", label: "Occurred date" },
      { id: "date_detected", label: "Date detected" },
      { id: "reporter", label: "Reporter" },
      { id: "approval_status", label: "Approval status" },
    ];
  }, []);

  const exportData = useMemo(() => {
    return filteredData.map((incident: AIIncidentManagementModel) => {
      return {
        incident_id: incident.incident_id || "-",
        ai_project: incident.ai_project || "-",
        type: incident.type || "-",
        severity: incident.severity || "-",
        status: incident.status || "-",
        occurred_date: incident.occurred_date || "-",
        date_detected: incident.date_detected || "-",
        reporter: incident.reporter || "-",
        approval_status: incident.approval_status || "-",
      };
    });
  }, [filteredData]);

  /** -------------------- RENDER -------------------- */
  return (
    <>
      <PageHeaderExtended
        title="Incident Management"
        description="End-to-end management of the AI incident lifecycle. You can log events in full detail, analyze root causes, and document corrective and preventive actions."

        helpArticlePath="ai-governance/incident-management"
        tipBoxEntity="ai-incident-managements"
        alert={
          alert ? (
                  <Alert
                    variant={alert.variant}
                    title={alert.title}
                    body={alert.body}
                    isToast={true}
                    onClick={() => setAlert(null)}
                  />
          ) : undefined
        }
        summaryCards={
          /* TODO: Refactor to always show cards (like Model Inventory) to prevent layout shift and beacon positioning issues */
          incidentsData.length > 0 ? (
            <StatusTileCards
              items={[
                { key: IncidentManagementStatus.OPEN, label: "Open", color: "#F9A825", count: incidentsData.filter((i) => i.status === IncidentManagementStatus.OPEN && !i.archived).length },
                { key: IncidentManagementStatus.INVESTIGATED, label: "Investigating", color: "#FB8C00", count: incidentsData.filter((i) => i.status === IncidentManagementStatus.INVESTIGATED && !i.archived).length },
                { key: IncidentManagementStatus.MITIGATED, label: "Mitigated", color: "#2E7D32", count: incidentsData.filter((i) => i.status === IncidentManagementStatus.MITIGATED && !i.archived).length },
                { key: IncidentManagementStatus.CLOSED, label: "Closed", color: "#455A64", count: incidentsData.filter((i) => i.status === IncidentManagementStatus.CLOSED && !i.archived).length },
              ]}
              entityName="incident"
              size="small"
              onCardClick={(key) => {
                if (key === selectedStatus) {
                  setSelectedStatus(null);
                  setAlert(null);
                } else {
                  setSelectedStatus(key);
                  const label = [
                    { key: IncidentManagementStatus.OPEN, label: "Open" },
                    { key: IncidentManagementStatus.INVESTIGATED, label: "Investigating" },
                    { key: IncidentManagementStatus.MITIGATED, label: "Mitigated" },
                    { key: IncidentManagementStatus.CLOSED, label: "Closed" },
                  ].find((s) => s.key === key)?.label || key;
                  setAlert({
                    variant: "info",
                    title: `Filtering by ${label}`,
                    body: "Click the card again to see all incidents.",
                  });
                }
              }}
              selectedKey={selectedStatus}
            />
          ) : undefined
        }
        summaryCardsJoyrideId="incident-status-cards"
      >
        {/* Filters Row */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          spacing={4}
          sx={incidentFilterRow}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <FilterBy
              columns={incidentFilterColumns}
              onFilterChange={handleIncidentFilterChange}
            />

            <GroupBy
              options={[
                { id: "severity", label: "Severity" },
                { id: "status", label: "Status" },
                { id: "type", label: "Type" },
                { id: "ai_project", label: "AI Project" },
              ]}
              onGroupChange={handleGroupChange}
            />

            <ColumnSelector
              columns={allIncidentColumns}
              visibleColumns={incidentVisibleColumns}
              onToggleColumn={toggleIncidentColumn}
              onResetToDefaults={resetIncidentColumns}
            />

            <Box data-joyride-id="incident-search">
              <SearchBox
                placeholder="Search incidents..."
                value={searchTerm}
                onChange={setSearchTerm}
                inputProps={{ "aria-label": "Search incidents" }}
                fullWidth={false}
              />
            </Box>
          </Stack>

          <Stack direction="row" gap="8px" alignItems="center">
            <ExportMenu
              data={exportData}
              columns={exportColumns}
              filename="incident-management"
              title="Incident Management"
            />
            <Box data-joyride-id="add-incident-button">
              <CustomizableButton
                variant="contained"
                sx={addNewIncidentButton}
                text="Add new incident"
                icon={<AddCircleOutlineIcon />}
                onClick={handleNewIncidentClick}
                isDisabled={isCreatingDisabled}
              />
            </Box>
          </Stack>
        </Stack>

        <GroupedTableView
          groupedData={groupedIncidents}
          ungroupedData={filteredData}
          renderTable={(data, options) => (
            <IncidentTable
              key={tableKey}
              data={data}
              isLoading={isLoading}
              onEdit={handleEditIncident}
              onArchive={handleArchiveIncident}
              onView={handleViewIncident}
              archivedId={archiveId}
              hidePagination={options?.hidePagination}
              visibleColumns={incidentVisibleColumns}
            />
          )}
        />
      </PageHeaderExtended>

      <NewIncident
        isOpen={isNewIncidentModalOpen}
        setIsOpen={handleCloseModal}
        onSuccess={handleIncidentSuccess}
        initialData={
          selectedIncident
            ? {
                incident_id: selectedIncident.incident_id || "",
                ai_project: selectedIncident.ai_project || "",
                type: selectedIncident.type || "",
                severity: selectedIncident.severity || "",
                status: selectedIncident.status || "",
                occurred_date: selectedIncident.occurred_date
                  ? new Date(selectedIncident.occurred_date)
                      .toISOString()
                      .split("T")[0]
                  : new Date().toISOString().split("T")[0],
                date_detected: selectedIncident.date_detected
                  ? new Date(selectedIncident.date_detected)
                      .toISOString()
                      .split("T")[0]
                  : new Date().toISOString().split("T")[0],
                reporter: selectedIncident.reporter,
                categories_of_harm: selectedIncident.categories_of_harm || [],
                description: selectedIncident.description,
                affected_persons_groups:
                  selectedIncident.affected_persons_groups || "",
                relationship_causality:
                  selectedIncident.relationship_causality || "",
                immediate_mitigations:
                  selectedIncident.immediate_mitigations || "",
                planned_corrective_actions:
                  selectedIncident.planned_corrective_actions || "",
                model_system_version: selectedIncident.model_system_version,
                interim_report: selectedIncident.interim_report || false,
                approval_status: selectedIncident.approval_status,
                approved_by: selectedIncident.approved_by,
                approval_date: selectedIncident.approval_date
                  ? new Date(selectedIncident.approval_date)
                      .toISOString()
                      .split("T")[0]
                  : new Date().toISOString().split("T")[0],
                approval_notes: selectedIncident.approval_notes,
              }
            : undefined
        }
        isEdit={!!selectedIncident}
        mode={mode}
        incidentId={selectedIncident?.id}
      />

      <PageTour
        steps={IncidentManagementSteps}
        run={!isLoading}
        tourKey="incident-management-tour"
      />
    </>
  );
};

export default IncidentManagement;
