/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Box, Stack } from "@mui/material";
import { ReactComponent as AddCircleOutlineIcon } from "../../assets/icons/plus-circle-white.svg";
import { SearchBox } from "../../components/Search";
import { useLocation, useNavigate, useSearchParams } from "react-router";

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
import { addNewIncidentButton, incidentFilterRow } from "./style";
import IncidentTable from "./IncidentTable";
import NewIncident, {
  INCIDENT_FIELD_LABELS,
  isSameFormValue,
  NewIncidentFormValues,
} from "../../components/Modals/NewIncident";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
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
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { ExportMenu } from "../../components/Table/ExportMenu";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import { useColumnVisibility, ColumnConfig } from "../../../application/hooks/useColumnVisibility";

import Alert from "../../components/Alert";
import { useJiraIncidentLinks } from "../../../application/hooks/useJiraIncidentLinks";
import {
  getApiValidationMessage,
  UserFacingFieldErrors,
} from "../../../application/utils/apiErrorReason";

type IncidentColumnKey =
  | "incident_id"
  | "ai_project"
  | "model_inventory_name"
  | "assignee_name"
  | "type"
  | "severity"
  | "status"
  | "occurred_date"
  | "approved_by"
  | "actions";

const INCIDENT_TABLE_COLUMNS: ColumnConfig<IncidentColumnKey>[] = [
  { key: "incident_id", label: "Incident ID", defaultVisible: true, alwaysVisible: true },
  { key: "ai_project", label: "AI project", defaultVisible: true },
  { key: "model_inventory_name", label: "Affected model", defaultVisible: true },
  { key: "assignee_name", label: "Owner", defaultVisible: true },
  { key: "type", label: "Type", defaultVisible: true },
  { key: "severity", label: "Severity", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "occurred_date", label: "Occurred date", defaultVisible: true },
  { key: "approved_by", label: "Approved by", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

/**
 * Server field errors that may appear in the save-failure toast. Reference
 * fields name database columns, so they get a sentence instead.
 */
const INCIDENT_SAVE_ERROR_FIELDS: UserFacingFieldErrors = {
  passThrough: ["description"],
  replace: {
    project_id: "The selected use case is no longer available.",
    model_inventory_id: "The selected affected model is no longer available.",
    assignee_id: "The selected owner is no longer available.",
  },
};

/**
 * The edit drawer's values for an incident. Used for the drawer's initialData
 * and, after an edit conflict, to tell which of the user's edits the other
 * editor also changed.
 */
const toDrawerValues = (incident: AIIncidentManagementModel): NewIncidentFormValues => ({
  incident_id: incident.incident_id || "",
  ai_project: incident.ai_project || "",
  project_id: incident.project_id ?? "",
  model_inventory_id: incident.model_inventory_id ?? "",
  assignee_id: incident.assignee_id ?? "",
  type: incident.type || "",
  severity: incident.severity || "",
  status: incident.status || "",
  occurred_date: incident.occurred_date
    ? new Date(incident.occurred_date).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
  date_detected: incident.date_detected
    ? new Date(incident.date_detected).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
  reporter: incident.reporter,
  categories_of_harm: incident.categories_of_harm || [],
  description: incident.description,
  affected_persons_groups: incident.affected_persons_groups || "",
  relationship_causality: incident.relationship_causality || "",
  immediate_mitigations: incident.immediate_mitigations || "",
  planned_corrective_actions: incident.planned_corrective_actions || "",
  model_system_version: incident.model_system_version,
  interim_report: incident.interim_report || false,
  approval_status: incident.approval_status,
  approved_by: incident.approved_by,
  // The stored approval date as a calendar date, or null when
  // there is none: never invent one, or a save would look like
  // an explicit approval change to the server.
  approval_date: incident.approval_date
    ? new Date(incident.approval_date).toISOString().split("T")[0]
    : null,
  approval_notes: incident.approval_notes,
  expected_updated_at: incident.updated_at
    ? new Date(incident.updated_at).toISOString()
    : undefined,
});

const IncidentManagement: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [incidentsData, setIncidentsData] = useState<AIIncidentManagementModel[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<AIIncidentManagementModel | null>(null);
  const incidentIds = useMemo(() => incidentsData.map((i) => i.id), [incidentsData]);
  const jiraLinks = useJiraIncidentLinks(incidentIds);

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

  const isCreatingDisabled = !userRoleName || !["Admin", "Editor"].includes(userRoleName);

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

  // Unique affected models for the FilterBy dropdown (issue #4583)
  const getUniqueModels = useCallback(() => {
    const models = new Set<string>();
    incidentsData.forEach((incident) => {
      if (incident.model_inventory_name) {
        models.add(incident.model_inventory_name);
      }
    });
    return Array.from(models)
      .sort()
      .map((model) => ({
        value: model,
        label: model,
      }));
  }, [incidentsData]);

  // Unique owners for the FilterBy dropdown (issue #4583)
  const getUniqueOwners = useCallback(() => {
    const owners = new Set<string>();
    incidentsData.forEach((incident) => {
      if (incident.assignee_name) {
        owners.add(incident.assignee_name);
      }
    });
    return Array.from(owners)
      .sort()
      .map((owner) => ({
        value: owner,
        label: owner,
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
        id: "model_inventory_name",
        label: "Affected model",
        type: "select" as const,
        options: getUniqueModels(),
      },
      {
        id: "assignee_name",
        label: "Owner",
        type: "select" as const,
        options: getUniqueOwners(),
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
          { value: IncidentManagementStatus.SUSPENDED, label: "Suspended" },
          {
            value: IncidentManagementStatus.EMERGENCY_ACTION,
            label: "Emergency action",
          },
        ],
      },
      {
        id: "occurred_date",
        label: "Occurred date",
        type: "date" as const,
      },
    ],
    [getUniqueProjects, getUniqueTypes, getUniqueModels, getUniqueOwners],
  );

  // FilterBy - Field value getter
  const getIncidentFieldValue = useCallback(
    (
      item: AIIncidentManagementModel,
      fieldId: string,
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "incident_id":
          return item.incident_id;
        case "ai_project":
          return item.ai_project;
        case "model_inventory_name":
          return item.model_inventory_name;
        case "assignee_name":
          return item.assignee_name;
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
    [],
  );

  // FilterBy - Initialize hook
  const { filterData: filterIncidentData, handleFilterChange: handleIncidentFilterChange } =
    useFilterBy<AIIncidentManagementModel>(getIncidentFieldValue);

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
          (i.reporter || "").toLowerCase().includes(search),
      );
    }

    return result;
  }, [filterIncidentData, incidentsData, searchTerm, selectedStatus]);

  // Define how to get the group key for each incident
  const getIncidentGroupKey = (
    incident: AIIncidentManagementModel,
    field: string,
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
          (item: AIIncidentManagementModel) => new AIIncidentManagementModel(item),
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
      setIncidentsData((prevData) => prevData.filter((item) => item.id?.toString() !== id));

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

  /**
   * Saves the drawer. Resolves true to close it, false to keep it open with
   * the user's edits. When editing, the drawer sends only the fields the user
   * changed plus expected_updated_at.
   */
  const handleIncidentSuccess = async (formData: any): Promise<boolean> => {
    try {
      if (selectedIncident) {
        await updateEntityById({
          routeUrl: `/ai-incident-managements/${selectedIncident.id}`,
          body: formData,
          // This page shows its own message for every failure.
          suppressGlobalErrorToast: true,
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
      return true;
    } catch (error) {
      // Someone else saved this incident after the drawer loaded it. Load the
      // latest version: the drawer shows it for every field the user has not
      // edited, keeps their edits and takes the new expected_updated_at, so
      // saving again applies only the user's edits on top of the other change.
      if ((error as { status?: number })?.status === 409 && selectedIncident) {
        let latestIncident: AIIncidentManagementModel | null = null;
        try {
          const latest = await getEntityById({
            routeUrl: `/ai-incident-managements/${selectedIncident.id}`,
            // This page reports a failed refresh itself.
            suppressGlobalErrorToast: true,
          });
          if (latest?.data) latestIncident = new AIIncidentManagementModel(latest.data);
        } catch {
          latestIncident = null;
        }
        if (!latestIncident) {
          setAlert({
            variant: "error",
            body: "This incident was changed by someone else since you opened it. Could not load the latest version; close and reopen the incident to continue.",
          });
          return false;
        }

        // The user's edits that the other editor also changed: saving again
        // replaces their values with the user's, so name those fields.
        const before = toDrawerValues(selectedIncident);
        const after = toDrawerValues(latestIncident);
        const overlapping = (Object.keys(formData) as (keyof NewIncidentFormValues)[]).filter(
          (key) => key !== "expected_updated_at" && !isSameFormValue(key, before[key], after[key]),
        );
        const labels = Array.from(
          new Set(overlapping.map((key) => t(INCIDENT_FIELD_LABELS[key] ?? key))),
        );

        setSelectedIncident(latestIncident);
        await fetchIncidentsData(false);
        const changedMessage = t(
          "This incident was changed by someone else since you opened it. The form now shows their changes with your edits kept: save again to apply your edits.",
        );
        setAlert({
          variant: "error",
          body: labels.length
            ? `${changedMessage} ${fill(
                t(
                  "Someone else also changed: {fields}. Saving again will replace their values with yours.",
                ),
                { fields: labels.join(", ") },
              )}`
            : changedMessage,
        });
        return false;
      }
      // Any other failure: keep the drawer open so nothing typed is lost.
      setAlert({
        variant: "error",
        body:
          getApiValidationMessage(error, INCIDENT_SAVE_ERROR_FIELDS) ??
          (selectedIncident ? "Failed to update incident." : "Failed to add incident."),
      });
      return false;
    }
  };

  /**
   * The drawer's starting values for the selected incident. Memoised on the
   * incident so unrelated re-renders (an alert, a refetch of the list) hand
   * the drawer the same object and never reset what the user has typed.
   */
  const incidentInitialData = useMemo<NewIncidentFormValues | undefined>(
    () => (selectedIncident ? toDrawerValues(selectedIncident) : undefined),
    [selectedIncident],
  );

  /** -------------------- EXPORT DATA -------------------- */
  const exportColumns = useMemo(() => {
    return [
      { id: "incident_id", label: "Incident ID" },
      { id: "ai_project", label: "AI project" },
      { id: "model_inventory_name", label: "Affected model" },
      { id: "assignee_name", label: "Owner" },
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
        model_inventory_name: incident.model_inventory_name || "-",
        assignee_name: incident.assignee_name || "-",
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
                {
                  key: IncidentManagementStatus.OPEN,
                  label: "Open",
                  color: "#F9A825",
                  count: incidentsData.filter(
                    (i) => i.status === IncidentManagementStatus.OPEN && !i.archived,
                  ).length,
                },
                {
                  key: IncidentManagementStatus.INVESTIGATED,
                  label: "Investigating",
                  color: "#FB8C00",
                  count: incidentsData.filter(
                    (i) => i.status === IncidentManagementStatus.INVESTIGATED && !i.archived,
                  ).length,
                },
                {
                  key: IncidentManagementStatus.MITIGATED,
                  label: "Mitigated",
                  color: "#2E7D32",
                  count: incidentsData.filter(
                    (i) => i.status === IncidentManagementStatus.MITIGATED && !i.archived,
                  ).length,
                },
                {
                  key: IncidentManagementStatus.CLOSED,
                  label: "Closed",
                  color: "#455A64",
                  count: incidentsData.filter(
                    (i) => i.status === IncidentManagementStatus.CLOSED && !i.archived,
                  ).length,
                },
                {
                  key: IncidentManagementStatus.SUSPENDED,
                  label: "Suspended",
                  color: "#7B1FA2",
                  count: incidentsData.filter(
                    (i) => i.status === IncidentManagementStatus.SUSPENDED && !i.archived,
                  ).length,
                },
                {
                  key: IncidentManagementStatus.EMERGENCY_ACTION,
                  label: "Emergency action",
                  color: "#C62828",
                  count: incidentsData.filter(
                    (i) => i.status === IncidentManagementStatus.EMERGENCY_ACTION && !i.archived,
                  ).length,
                },
              ]}
              entityName="incident"
              size="small"
              onCardClick={(key) => {
                if (key === selectedStatus) {
                  setSelectedStatus(null);
                  setAlert(null);
                } else {
                  setSelectedStatus(key);
                  const label =
                    [
                      { key: IncidentManagementStatus.OPEN, label: "Open" },
                      { key: IncidentManagementStatus.INVESTIGATED, label: "Investigating" },
                      { key: IncidentManagementStatus.MITIGATED, label: "Mitigated" },
                      { key: IncidentManagementStatus.CLOSED, label: "Closed" },
                      { key: IncidentManagementStatus.SUSPENDED, label: "Suspended" },
                      { key: IncidentManagementStatus.EMERGENCY_ACTION, label: "Emergency action" },
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
            <FilterBy columns={incidentFilterColumns} onFilterChange={handleIncidentFilterChange} />

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
              jiraLinks={jiraLinks}
            />
          )}
        />
      </PageHeaderExtended>

      <NewIncident
        isOpen={isNewIncidentModalOpen}
        setIsOpen={handleCloseModal}
        onSuccess={handleIncidentSuccess}
        initialData={incidentInitialData}
        isEdit={!!selectedIncident}
        mode={mode}
        incidentId={selectedIncident?.id}
        jiraLink={selectedIncident ? jiraLinks.get(selectedIncident.id) : undefined}
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
