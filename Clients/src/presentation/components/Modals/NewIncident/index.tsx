/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { FC, useState, useEffect, useMemo, Suspense, useCallback, useRef } from "react";
import {
  Drawer,
  Stack,
  Box,
  Typography,
  FormControlLabel,
  FormGroup,
  FormLabel,
  useTheme,
  Divider,
} from "@mui/material";
import Toggle from "../../Inputs/Toggle";
import Checkbox from "../../Inputs/Checkbox";
import dayjs, { Dayjs } from "dayjs";
import { CustomizableButton } from "../../button/customizable-button";
import { ReactComponent as CloseIcon } from "../../../assets/icons/close.svg";
import { ReactComponent as SaveIconSVGWhite } from "../../../assets/icons/save-white.svg";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { useProjects } from "../../../../application/hooks/useProjects";
import { User } from "../../../../domain/types/User";
import { Project } from "../../../../domain/types/Project";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { focusFormFieldById } from "../../../../application/utils/formValidationFocus";
import { validateIncidentDescription } from "../../../../application/validations/incidentValidation";
import {
  INCIDENT_FORM_FIELD_IDS,
  INCIDENT_FORM_FIELD_ORDER,
} from "../../../constants/formValidationFieldMaps";
import {
  Severity,
  IncidentManagementStatus,
  AIIncidentManagementApprovalStatus,
  IncidentType,
  HarmCategory,
} from "../../../../domain/enums/aiIncidentManagement.enum";
import { HistorySidebar } from "../../Common/HistorySidebar";
import TabBar from "../../TabBar";
import { TabContext } from "@mui/lab";
import JiraIssueChip from "../../JiraIssueChip";
import type { JiraIncidentLink } from "../../../../application/repository/jiraIncidents.repository";

// To
import Field from "../../Inputs/Field";
import DatePicker from "../../Inputs/Datepicker";
import SelectComponent from "../../Inputs/Select";

interface SideDrawerIncidentProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  /**
   * Called on save. When editing (isEdit with initialData) it receives only
   * the fields the user changed, plus expected_updated_at; when creating, the
   * whole form. The drawer closes once this settles successfully. Resolving
   * to `false` or rejecting means the save failed: the drawer stays open with
   * the user's values.
   */
  onSuccess?: (data: Partial<NewIncidentFormValues>) => void | boolean | Promise<void | boolean>;
  initialData?: NewIncidentFormValues;
  isEdit?: boolean;
  mode?: string;
  incidentId?: number;
  /** The incident's Jira issue (Jira incidents extension), shown next to the incident ID. */
  jiraLink?: JiraIncidentLink;
}

export interface NewIncidentFormValues {
  incident_id?: string;
  ai_project: string;
  /** FK to projects — set alongside ai_project when a use case is picked (issue #4583). */
  project_id?: number | string | null;
  /** FK to model_inventories — affected model (issue #4583). */
  model_inventory_id?: number | string | null;
  /** FK to users — responsible owner (issue #4583). */
  assignee_id?: number | string | null;
  type: string;
  severity: Severity;
  status: IncidentManagementStatus;
  occurred_date: string;
  date_detected: string;
  reporter: string;
  categories_of_harm: string[];
  affected_persons_groups?: string;
  description: string;
  relationship_causality?: string;
  immediate_mitigations?: string;
  planned_corrective_actions?: string;
  model_system_version?: string;
  interim_report: boolean;
  approval_status: AIIncidentManagementApprovalStatus;
  approved_by?: string;
  /** YYYY-MM-DD, or empty/null when the incident has no approval date. */
  approval_date?: string | null;
  approval_notes?: string;
  /**
   * The incident's updated_at when the drawer loaded it (edit only). Sent
   * back so the server can refuse the save if someone changed it since.
   */
  expected_updated_at?: string;
}

const initialState: NewIncidentFormValues = {
  ai_project: "",
  project_id: "",
  model_inventory_id: "",
  assignee_id: "",
  type: "",
  severity: Severity.MINOR,
  status: IncidentManagementStatus.OPEN,
  occurred_date: new Date().toISOString().split("T")[0],
  date_detected: new Date().toISOString().split("T")[0],
  reporter: "",
  categories_of_harm: [],
  description: "",
  affected_persons_groups: "",
  relationship_causality: "",
  immediate_mitigations: "",
  planned_corrective_actions: "",
  model_system_version: "",
  interim_report: false,
  approval_status: AIIncidentManagementApprovalStatus.PENDING,
  approved_by: "",
  approval_date: "",
  approval_notes: "",
};

/** Normalise FK picker values ("" / null / numeric strings) to integer ids or null (issue #4583). */
const toId = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));

const FK_FIELDS = new Set<keyof NewIncidentFormValues>([
  "project_id",
  "model_inventory_id",
  "assignee_id",
]);

/**
 * Whether two form values are the same for change detection: "" / null /
 * undefined are all empty, FK pickers compare as ids, harm categories compare
 * as a set (ignoring order, items by their JSON), and other objects or lists
 * by their JSON, in order.
 */
export const isSameFormValue = (
  key: keyof NewIncidentFormValues,
  a: unknown,
  b: unknown,
): boolean => {
  const norm = (v: unknown) => {
    if (FK_FIELDS.has(key)) return toId(v);
    if (v === undefined || v === null) return "";
    if (key === "categories_of_harm" && Array.isArray(v)) {
      return JSON.stringify(v.map((item) => JSON.stringify(item)).sort());
    }
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  return norm(a) === norm(b);
};

/** The drawer's label for each editable field, as shown on the form. */
export const INCIDENT_FIELD_LABELS: Partial<Record<keyof NewIncidentFormValues, string>> = {
  ai_project: "AI use case or framework",
  project_id: "AI use case or framework",
  type: "Incident type",
  severity: "Severity",
  status: "Status",
  model_inventory_id: "Affected model",
  assignee_id: "Owner",
  occurred_date: "Occurred date",
  date_detected: "Detected date",
  reporter: "Reporter",
  model_system_version: "Model / system version",
  categories_of_harm: "Categories of harm",
  affected_persons_groups: "Affected persons / groups",
  description: "Description",
  relationship_causality: "Relationship / causality",
  immediate_mitigations: "Immediate mitigations taken",
  planned_corrective_actions: "Planned corrective actions",
  approval_status: "Approval status",
  approved_by: "Approved by",
  approval_date: "Approval date",
  approval_notes: "Approval notes / comments",
  interim_report: "This incident has an interim report",
};

/** Fields the drawer never sends as edits: identity and the version token. */
const NON_EDITABLE_FIELDS = new Set<keyof NewIncidentFormValues>([
  "incident_id",
  "expected_updated_at",
]);

const severityOptions = [
  { _id: Severity.MINOR, name: "Minor" },
  { _id: Severity.SERIOUS, name: "Serious" },
  { _id: Severity.VERY_SERIOUS, name: "Very Serious" },
];

const statusOptions = [
  { _id: IncidentManagementStatus.OPEN, name: "Open" },
  { _id: IncidentManagementStatus.INVESTIGATED, name: "Investigating" },
  { _id: IncidentManagementStatus.MITIGATED, name: "Mitigated" },
  { _id: IncidentManagementStatus.CLOSED, name: "Closed" },
  { _id: IncidentManagementStatus.SUSPENDED, name: "Suspended" },
  { _id: IncidentManagementStatus.EMERGENCY_ACTION, name: "Emergency action" },
];

const approvalStatusOptions = [
  { _id: AIIncidentManagementApprovalStatus.PENDING, name: "Pending" },
  { _id: AIIncidentManagementApprovalStatus.APPROVED, name: "Approved" },
  { _id: AIIncidentManagementApprovalStatus.REJECTED, name: "Rejected" },
  {
    _id: AIIncidentManagementApprovalStatus.NOT_REQUIRED,
    name: "Not Required",
  },
];

const incidentTypes = Object.values(IncidentType);
const harmCategories = Object.values(HarmCategory);

const SideDrawerIncident: FC<SideDrawerIncidentProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  initialData,
  isEdit = false,
  mode,
  incidentId,
  jiraLink,
}) => {
  const theme = useTheme();
  const [values, setValues] = useState<NewIncidentFormValues>(initialData || initialState);
  const [users, setUsers] = useState<User[]>([]);
  const [, setIsLoadingUsers] = useState(false);
  const [modelInventories, setModelInventories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("details");
  const [isSaving, setIsSaving] = useState(false);
  // Refs so close handlers captured by other hooks (Esc) see the current state.
  const isSavingRef = useRef(false);
  // Bumped whenever a new draft starts (drawer opened or reset), so a save
  // that resolves late cannot close or reset a newer draft.
  const draftSeqRef = useRef(0);

  // The initialData the form was last filled from: the baseline that tells the
  // user's edits apart from untouched fields.
  const baselineRef = useRef<NewIncidentFormValues | null>(null);

  const validators = useMemo(
    () => ({
      ai_project: (v: unknown) => (!v ? "Project is required." : ""),
      occurred_date: (v: unknown) => {
        if (!v) return "Occurred date is required.";
        if (dayjs(v as string).isAfter(dayjs())) return "Cannot be in the future.";
        return "";
      },
      date_detected: (v: unknown) => (!v ? "Detected date is required." : ""),
      reporter: (v: unknown) => (!v ? "Reporter is required." : ""),
      // In edit mode the description is validated only when it is one of the
      // fields the user changed (the ones the save sends), so other fields of
      // an older incident with a shorter description can still be edited.
      description: (v: unknown) => {
        const baseline = baselineRef.current;
        if (isEdit && baseline && isSameFormValue("description", v, baseline.description)) {
          return "";
        }
        return validateIncidentDescription(v);
      },
      categories_of_harm: (v: unknown) => {
        const cats = v as string[];
        return !cats || cats.length < 1 ? "Please select at least one Category of Harm." : "";
      },
    }),
    [isEdit],
  );

  const { errors, validateAll, clearFieldError, resetErrors, getFirstInvalidField } =
    useFormValidation<NewIncidentFormValues>(validators);

  // Use the useProjects hook to get approved projects only
  const { approvedProjects } = useProjects();

  // A newly opened drawer is a new draft: forget any save still in flight.
  useEffect(() => {
    if (isOpen) {
      draftSeqRef.current += 1;
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [isOpen]);

  // Fetch Users
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchModelInventories();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!initialData) return;
    const baseline = baselineRef.current;
    baselineRef.current = initialData;
    if (!baseline || baseline.incident_id !== initialData.incident_id) {
      setValues((prev) => ({ ...prev, ...initialData }));
      return;
    }
    // A refreshed copy of the same incident (after an edit conflict): show the
    // latest value for every field the user has not edited and keep their
    // edits. expected_updated_at moves to the latest version this way too.
    setValues((prev) => {
      const next: Record<string, unknown> = { ...prev };
      for (const key of Object.keys(initialData) as (keyof NewIncidentFormValues)[]) {
        if (isSameFormValue(key, prev[key], baseline[key])) next[key] = initialData[key];
      }
      return next as unknown as NewIncidentFormValues;
    });
  }, [initialData]);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      if (response?.data) setUsers(response.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Fetch model inventory for the affected-model picker (issue #4583)
  const fetchModelInventories = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/modelInventory" });
      if (response?.data) setModelInventories(response.data);
    } catch (error) {
      console.error("Error fetching model inventory:", error);
    }
  };

  const projectOptions = useMemo(() => {
    // Use a Set to track unique project titles
    const seen = new Set<string>();

    return Array.isArray(approvedProjects)
      ? approvedProjects
          .filter((p: Project) => {
            // Only keep the first occurrence of each project_title
            if (seen.has(p.project_title)) return false;
            seen.add(p.project_title);
            return true;
          })
          .map((p: Project) => ({
            _id: p.project_title,
            name: p.project_title,
          }))
      : [];
  }, [approvedProjects]);

  const userOptions = useMemo(
    () => users.map((u) => ({ _id: u.name, name: `${u.name} ${u.surname}` })),
    [users],
  );

  // Owner/assignee options keyed by user id (issue #4583)
  const assigneeOptions = useMemo(
    () => [
      // "(none)" clears the owner FK — '' is normalised to null on save (issue #4583)
      { _id: "" as string | number, name: "(none)" },
      ...users.map((u) => ({ _id: u.id, name: `${u.name} ${u.surname}` })),
    ],
    [users],
  );

  // Affected-model options keyed by model inventory id (issue #4583)
  const modelInventoryOptions = useMemo(
    () => [
      // "(none)" clears the affected-model FK — '' is normalised to null on save (issue #4583)
      { _id: "" as string | number, name: "(none)" },
      ...modelInventories.map((m) => ({
        _id: m.id,
        name: [m.provider, m.model].filter(Boolean).join(" "),
      })),
    ],
    [modelInventories],
  );

  // Use-case select keeps the free-text ai_project (backward compatible) and
  // also records the project FK (issue #4583).
  const handleProjectChange = useCallback(
    (e: any) => {
      const title = e.target.value;
      const project = (approvedProjects as any[]).find((p) => p.project_title === title);
      setValues((prev) => ({
        ...prev,
        ai_project: title,
        project_id: project?.id ?? "",
      }));
      clearFieldError("ai_project");
    },
    [approvedProjects, clearFieldError],
  );

  const handleFieldChange = useCallback(
    (prop: keyof NewIncidentFormValues) => (e: any) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [prop]: value }));
      clearFieldError(prop);
    },
    [clearFieldError],
  );

  const handleDateChange = useCallback(
    (prop: "occurred_date" | "date_detected" | "approval_date") => (newDate: Dayjs | null) => {
      if (newDate?.isValid()) {
        setValues((prev) => ({
          ...prev,
          [prop]: newDate.format("YYYY-MM-DD"),
        }));
        clearFieldError(prop);
      }
    },
    [clearFieldError],
  );

  const handleSwitchChange =
    (prop: "interim_report") => (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [prop]: e.target.checked }));
    };

  const handleHarmCategoryChange = useCallback(
    (category: string) => {
      setValues((prev) => {
        const newCategories = prev.categories_of_harm.includes(category)
          ? prev.categories_of_harm.filter((c) => c !== category)
          : [...prev.categories_of_harm, category];
        return { ...prev, categories_of_harm: newCategories };
      });
      clearFieldError("categories_of_harm");
    },
    [clearFieldError],
  );

  const resetAndClose = () => {
    draftSeqRef.current += 1;
    setIsOpen(false);
    baselineRef.current = null;
    setValues(initialState);
    resetErrors();
    setActiveTab("details");
  };

  // Every user close path (Esc, Cancel, X, backdrop) goes through here and is
  // ignored while a save is in flight.
  const handleClose = () => {
    if (isSavingRef.current) return;
    resetAndClose();
  };

  const handleSaveIncident = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // In-flight guard: a second click while a save is pending does nothing.
    if (isSavingRef.current) return;
    if (validateAll(values, INCIDENT_FORM_FIELD_ORDER)) {
      const formData: NewIncidentFormValues = {
        ...values,
        project_id: toId(values.project_id),
        model_inventory_id: toId(values.model_inventory_id),
        assignee_id: toId(values.assignee_id),
      };
      // When editing, send only what the user changed (plus the version), so
      // a save never writes back stale copies of fields someone else changed.
      const baseline = baselineRef.current;
      let body: Partial<NewIncidentFormValues> = formData;
      if (isEdit && baseline) {
        const changed: Record<string, unknown> = {};
        for (const key of Object.keys(formData) as (keyof NewIncidentFormValues)[]) {
          if (NON_EDITABLE_FIELDS.has(key)) continue;
          if (!isSameFormValue(key, formData[key], baseline[key])) changed[key] = formData[key];
        }
        if (values.expected_updated_at) changed.expected_updated_at = values.expected_updated_at;
        body = changed as Partial<NewIncidentFormValues>;
      }

      const draftSeq = draftSeqRef.current;
      isSavingRef.current = true;
      setIsSaving(true);
      let saved = false;
      try {
        saved = (await onSuccess?.(body)) !== false;
      } catch {
        // The caller reports the failure; keep the drawer open with the
        // entered values so the user can correct and retry.
      }
      // A newer draft has started since this save began; leave it alone.
      if (draftSeq !== draftSeqRef.current) return;
      isSavingRef.current = false;
      setIsSaving(false);
      if (saved) resetAndClose();
      return;
    }
    // Validation failed — move focus to the first invalid field so the
    // user immediately sees what needs fixing (issue #4754).
    const firstInvalid = getFirstInvalidField();
    const fieldId = firstInvalid ? INCIDENT_FORM_FIELD_IDS[firstInvalid] : undefined;
    if (fieldId) focusFormFieldById(fieldId);
  };

  const isViewMode = mode === "view";

  useModalKeyHandling({ isOpen, onClose: handleClose });

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={handleClose}
      sx={{
        "margin": 0,
        "& .MuiDrawer-paper": {
          margin: 0,
          borderRadius: 0,
        },
      }}
    >
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

        {mode !== "view" && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography fontWeight={600} color={theme.palette.text.primary}>
                  {isEdit ? "Edit incident" : "Create new incident"}
                </Typography>
                {isEdit && values.incident_id && (
                  <Typography
                    fontWeight={400}
                    fontSize={14}
                    sx={{
                      ml: 1,
                    }}
                  >
                    <Typography component="span" color={theme.palette.text.secondary} fontSize={14}>
                      (Incident ID:{" "}
                    </Typography>
                    <Typography component="span" color={theme.palette.text.tertiary} fontSize={14}>
                      {values.incident_id})
                    </Typography>
                  </Typography>
                )}
                {isEdit && jiraLink && <JiraIssueChip link={jiraLink} />}
              </Stack>
              <Box onClick={handleClose} sx={{ cursor: "pointer" }}>
                <CloseIcon />
              </Box>
            </Stack>
            <Divider
              sx={{
                mb: 4,
                mx: `calc(-1 * ${theme.spacing(10)})`,
              }}
            />
          </>
        )}

        {/* TabBar for edit mode */}
        {isEdit && incidentId && (
          <TabContext value={activeTab}>
            <Box sx={{ marginBottom: 3 }}>
              <TabBar
                tabs={[
                  { label: "Incident details", value: "details", icon: "AlertTriangle" },
                  { label: "Activity", value: "activity", icon: "History" },
                ]}
                activeTab={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
              />
            </Box>
          </TabContext>
        )}

        {/* Activity tab content */}
        {activeTab === "activity" && isEdit && incidentId ? (
          <HistorySidebar inline isOpen={true} entityType="incident" entityId={incidentId} />
        ) : (
          <form onSubmit={handleSaveIncident}>
            <Stack spacing={4} width="100%">
              {/* SECTION 1: INCIDENT INFORMATION */}
              <Stack spacing={4}>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: theme.palette.text.secondary,
                      letterSpacing: "0.5px",
                    }}
                  >
                    INCIDENT INFORMATION
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: theme.palette.text.tertiary,
                    }}
                  >
                    (Basic incident details)
                  </Typography>
                </Stack>

                {/* Row: AI Project + Incident Type */}
                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <SelectComponent
                      id="ai_project"
                      label="AI use case or framework"
                      placeholder="Select AI use case or framework"
                      items={projectOptions}
                      value={values.ai_project}
                      onChange={handleProjectChange}
                      error={errors.ai_project}
                      isRequired
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <SelectComponent
                      id="type"
                      label="Incident type"
                      placeholder="Select incident type"
                      items={incidentTypes.map((t) => ({
                        _id: t,
                        name: t,
                      }))}
                      value={values.type}
                      onChange={handleFieldChange("type")}
                      error={errors.type}
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                </Stack>

                {/* Row: Severity + Status */}
                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <SelectComponent
                      id="severity"
                      label="Severity"
                      items={severityOptions}
                      placeholder="Select severity"
                      value={values.severity}
                      onChange={handleFieldChange("severity")}
                      error={errors.severity}
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <SelectComponent
                      id="status"
                      label="Status"
                      placeholder="Select status"
                      items={statusOptions}
                      value={values.status}
                      onChange={handleFieldChange("status")}
                      error={errors.status}
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                </Stack>

                {/* Row: Affected model + Owner (issue #4583 FK pickers) */}
                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                  <Stack sx={{ gap: 3, width: "50%", minWidth: 0 }}>
                    <SelectComponent
                      id="model_inventory_id"
                      label="Affected model"
                      placeholder="Select model from inventory"
                      items={modelInventoryOptions}
                      value={values.model_inventory_id ?? ""}
                      onChange={handleFieldChange("model_inventory_id")}
                      isOptional
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                  <Stack sx={{ gap: 3, width: "50%", minWidth: 0 }}>
                    <SelectComponent
                      id="assignee_id"
                      label="Owner"
                      placeholder="Select owner"
                      items={assigneeOptions}
                      value={values.assignee_id ?? ""}
                      onChange={handleFieldChange("assignee_id")}
                      isOptional
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                </Stack>

                {/* Row: Occurred Date + Detected Date */}
                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                  <Suspense fallback={<div>Loading...</div>}>
                    <Stack sx={{ gap: 3, width: "50%" }}>
                      <DatePicker
                        label="Occurred date"
                        date={dayjs(values.occurred_date)}
                        handleDateChange={handleDateChange("occurred_date")}
                        isRequired
                        error={errors.occurred_date}
                        sx={{ flex: 1 }}
                        disabled={isViewMode}
                      />
                    </Stack>
                    <Stack sx={{ gap: 3, width: "50%" }}>
                      <DatePicker
                        label="Detected date"
                        date={dayjs(values.date_detected)}
                        handleDateChange={handleDateChange("date_detected")}
                        isRequired
                        error={errors.date_detected}
                        sx={{ flex: 1 }}
                        disabled={isViewMode}
                      />
                    </Stack>
                  </Suspense>
                </Stack>

                {/* Row: Reporter + Model/System Version */}
                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <SelectComponent
                      id="reporter"
                      label="Reporter"
                      placeholder="Select reporter"
                      items={userOptions}
                      value={values.reporter}
                      onChange={handleFieldChange("reporter")}
                      error={errors.reporter}
                      isRequired
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <Field
                      id="model_version"
                      label="Model / system version"
                      value={values.model_system_version || ""}
                      onChange={handleFieldChange("model_system_version")}
                      placeholder="Model/system version"
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                </Stack>
              </Stack>

              <Box sx={{ py: 6 }}>
                <Divider
                  sx={{
                    mx: `calc(-1 * ${theme.spacing(10)})`,
                  }}
                />
              </Box>

              {/* SECTION 2: IMPACT ASSESSMENT */}
              <Stack spacing={4}>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: theme.palette.text.secondary,
                      letterSpacing: "0.5px",
                    }}
                  >
                    IMPACT ASSESSMENT
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: theme.palette.text.tertiary,
                    }}
                  >
                    (What was affected)
                  </Typography>
                </Stack>

                {/* Categories of harm */}
                <FormLabel
                  required
                  sx={{
                    color: theme.palette.text.secondary,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Categories of harm
                </FormLabel>
                <FormGroup
                  id="categories-of-harm"
                  row
                  sx={{ gap: theme.spacing(3), flexWrap: "nowrap" }}
                >
                  {harmCategories.map((category) => (
                    <Box key={category} sx={{ flex: 1 }}>
                      <Checkbox
                        id={`harm-category-${category}`}
                        label={category}
                        size="small"
                        isChecked={values.categories_of_harm.includes(category)}
                        value={category}
                        onChange={() => handleHarmCategoryChange(category)}
                        isDisabled={isViewMode}
                      />
                    </Box>
                  ))}
                </FormGroup>

                {errors.categories_of_harm && (
                  <Typography
                    role="alert"
                    color="error"
                    sx={{ mt: 0.5, fontSize: 13, fontWeight: 500 }}
                  >
                    {errors.categories_of_harm}
                  </Typography>
                )}

                <Field
                  id="affected_persons"
                  label="Affected persons / groups"
                  value={values.affected_persons_groups || ""}
                  onChange={handleFieldChange("affected_persons_groups")}
                  placeholder="List affected persons or groups"
                  rows={2}
                  disabled={isViewMode}
                />
                <Field
                  id="description"
                  label="Description"
                  value={values.description}
                  onChange={handleFieldChange("description")}
                  error={errors.description}
                  placeholder="Describe the incident"
                  rows={3}
                  isRequired
                  disabled={isViewMode}
                />
                <Field
                  id="relationship"
                  label="Relationship / causality"
                  value={values.relationship_causality || ""}
                  onChange={handleFieldChange("relationship_causality")}
                  placeholder="Explain the relationship to AI system"
                  rows={2}
                  disabled={isViewMode}
                />
              </Stack>

              <Box sx={{ py: 6 }}>
                <Divider
                  sx={{
                    mx: `calc(-1 * ${theme.spacing(10)})`,
                  }}
                />
              </Box>

              {/* SECTION 3: RESPONSE & ACTIONS */}
              <Stack spacing={4}>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: theme.palette.text.secondary,
                      letterSpacing: "0.5px",
                    }}
                  >
                    RESPONSE & ACTIONS
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: theme.palette.text.tertiary,
                    }}
                  >
                    (What was/will be done)
                  </Typography>
                </Stack>

                <Field
                  id="immediate_mitigations"
                  label="Immediate mitigations taken"
                  value={values.immediate_mitigations || ""}
                  onChange={handleFieldChange("immediate_mitigations")}
                  placeholder="Describe immediate mitigations"
                  rows={2}
                  disabled={isViewMode}
                />
                <Field
                  id="planned_corrective_actions"
                  label="Planned corrective actions"
                  value={values.planned_corrective_actions || ""}
                  onChange={handleFieldChange("planned_corrective_actions")}
                  placeholder="Describe planned corrective actions"
                  rows={2}
                  disabled={isViewMode}
                />
              </Stack>

              <Box sx={{ py: 6 }}>
                <Divider
                  sx={{
                    mx: `calc(-1 * ${theme.spacing(10)})`,
                  }}
                />
              </Box>

              {/* SECTION 4: APPROVAL & REPORTING */}
              <Stack spacing={4}>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: theme.palette.text.secondary,
                      letterSpacing: "0.5px",
                    }}
                  >
                    APPROVAL & REPORTING
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: theme.palette.text.tertiary,
                    }}
                  >
                    (Approval workflow)
                  </Typography>
                </Stack>

                {/* Row: Approval Status + Approved By */}
                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <SelectComponent
                      id="approval_status"
                      placeholder="Select approval status"
                      label="Approval status"
                      items={approvalStatusOptions}
                      value={values.approval_status}
                      onChange={handleFieldChange("approval_status")}
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                  <Stack sx={{ gap: 3, width: "50%" }}>
                    <SelectComponent
                      id="approved_by"
                      label="Approved by"
                      placeholder="Select approver"
                      items={userOptions}
                      value={values.approved_by || ""}
                      onChange={handleFieldChange("approved_by")}
                      sx={{ flex: 1 }}
                      disabled={isViewMode}
                    />
                  </Stack>
                </Stack>

                {/* Row: Approval Date */}
                <Stack direction={"row"} gap={theme.spacing(8)} sx={{ mt: 2 }}>
                  <Suspense fallback={<div>Loading...</div>}>
                    <Stack sx={{ gap: 3, width: "50%" }}>
                      <DatePicker
                        label="Approval date"
                        date={values.approval_date ? dayjs(values.approval_date) : null}
                        handleDateChange={(d) =>
                          setValues((prev) => ({
                            ...prev,
                            approval_date: d ? d.format("YYYY-MM-DD") : "",
                          }))
                        }
                        sx={{ flex: 1 }}
                        disabled={isViewMode}
                      />
                    </Stack>
                  </Suspense>
                </Stack>

                <Field
                  id="approval_notes"
                  label="Approval notes / comments"
                  value={values.approval_notes || ""}
                  onChange={handleFieldChange("approval_notes")}
                  placeholder="Add approval notes"
                  rows={2}
                  disabled={isViewMode}
                />

                {/* Interim Report Toggle */}
                <FormControlLabel
                  control={
                    <Toggle
                      checked={values.interim_report}
                      onChange={handleSwitchChange("interim_report")}
                    />
                  }
                  label="This incident has an interim report"
                  sx={{
                    "mt": 2,
                    "& .MuiFormControlLabel-label": {
                      fontSize: 13,
                    },
                  }}
                  disabled={isViewMode}
                />
              </Stack>
            </Stack>

            {/* Buttons */}
            <Stack
              direction="row"
              spacing={2}
              mt={6}
              justifyContent={mode === "view" ? "flex-start" : "flex-end"}
            >
              {mode === "view" ? (
                <CustomizableButton variant="contained" text="Close" onClick={handleClose} />
              ) : (
                <>
                  <CustomizableButton
                    variant="outlined"
                    text="Cancel"
                    onClick={handleClose}
                    isDisabled={isSaving}
                  />
                  <CustomizableButton
                    variant="contained"
                    text={isEdit ? "Update incident" : "Save incident"}
                    icon={<SaveIconSVGWhite />}
                    onClick={handleSaveIncident as (event: unknown) => void}
                    loading={isSaving}
                    isDisabled={isSaving}
                    sx={{
                      backgroundColor: theme.palette.primary.main,
                      border: `1px solid ${theme.palette.primary.main}`,
                    }}
                  />
                </>
              )}
            </Stack>
          </form>
        )}
      </Stack>
    </Drawer>
  );
};
export default SideDrawerIncident;
