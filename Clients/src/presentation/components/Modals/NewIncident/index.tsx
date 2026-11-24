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
import { X } from "lucide-react";
import Toggle from "../../Inputs/Toggle";
import Checkbox from "../../Inputs/Checkbox";
import dayjs, { Dayjs } from "dayjs";
import { CustomizableButton } from "../../button/customizable-button";
import { ReactComponent as SaveIconSVGWhite } from "../../../assets/icons/save-white.svg";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { useProjects } from "../../../../application/hooks/useProjects";
import { User } from "../../../../domain/types/User";
import { Project } from "../../../../domain/types/Project";
import { logEngine } from "../../../../application/tools/log.engine";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { focusFormFieldById } from "../../../../application/utils/formValidationFocus";
import {
  INCIDENT_FUTURE_DATE_MESSAGE,
  INCIDENT_MODEL_VERSION_TOO_LONG_MESSAGE,
  INCIDENT_SEVERITY_REQUIRED_MESSAGE,
  INCIDENT_TEXT_MAX_LENGTH,
  INCIDENT_TYPE_REQUIRED_MESSAGE,
  isIncidentDateInFuture,
  validateIncidentDescription,
  validateIncidentDetectedDate,
} from "../../../../application/validations/incidentValidation";
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
import { toLocalDateOnly } from "../../../tools/isoDateToString";
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
  /**
   * The caller holds incident.edit (edit) or incident.create (new): every
   * field but the approval ones is editable. Default true.
   */
  canEditDetails?: boolean;
  /** The caller holds incident.approve: approval status and notes are editable. Default true. */
  canApprove?: boolean;
}

export interface NewIncidentFormValues {
  incident_id?: string;
  /** The use case's title as stored (free text; older incidents and Jira imports have only this). */
  ai_project: string;
  /** FK to projects: the use case picked, with its title copied into ai_project (issue #4583). */
  project_id?: number | string | null;
  /** FK to model_inventories — affected model (issue #4583). */
  model_inventory_id?: number | string | null;
  /** FK to users — responsible owner (issue #4583). */
  assignee_id?: number | string | null;
  type: string;
  severity: Severity;
  status: IncidentManagementStatus;
  /** "YYYY-MM-DD" */
  occurred_date: string;
  /** "YYYY-MM-DD" */
  date_detected: string;
  /**
   * The reporter's name. Set from the picked user; older incidents and Jira
   * imports have only this text (no reporter_id).
   */
  reporter: string;
  /** FK to users: the reporter picked from the organization's users. */
  reporter_id?: number | string | null;
  /** The reporter_id user's full name as loaded (display only, never sent). */
  reporter_name?: string | null;
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

/**
 * The values of a new incident. Dates default to the user's own today,
 * computed when the drawer opens (not when the page loaded, and not the UTC
 * date, which is tomorrow in the US evening and fails "cannot be in the
 * future").
 */
const createInitialState = (): NewIncidentFormValues => ({
  ai_project: "",
  project_id: "",
  model_inventory_id: "",
  assignee_id: "",
  type: "",
  severity: Severity.MINOR,
  status: IncidentManagementStatus.OPEN,
  occurred_date: toLocalDateOnly(new Date()),
  date_detected: toLocalDateOnly(new Date()),
  reporter: "",
  reporter_id: "",
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
});

/** Normalise FK picker values ("" / null / numeric strings) to integer ids or null (issue #4583). */
const toId = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));

const FK_FIELDS = new Set<keyof NewIncidentFormValues>([
  "project_id",
  "model_inventory_id",
  "assignee_id",
  "reporter_id",
]);

/**
 * The reporter picker's option for an incident whose reporter is not one of
 * the listed users: a name stored as text only (older incidents, Jira
 * imports) or a user who has left the organization. Picking it keeps the
 * stored reporter.
 */
export const STORED_REPORTER_OPTION = "__stored_reporter__";

/**
 * The use case picker's option for an incident whose use case is stored as
 * text only (older incidents, Jira imports), with no project_id. Picking it
 * keeps the stored text.
 */
export const STORED_USE_CASE_OPTION = "__stored_use_case__";

/** The drawer's name for the use case field, on the form and in messages. */
const USE_CASE_LABEL = "Use case";

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
  ai_project: USE_CASE_LABEL,
  project_id: USE_CASE_LABEL,
  type: "Incident type",
  severity: "Severity",
  status: "Status",
  model_inventory_id: "Affected model",
  assignee_id: "Owner",
  occurred_date: "Occurred date",
  date_detected: "Detected date",
  reporter: "Reporter",
  reporter_id: "Reporter",
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

/**
 * Fields the drawer never sends as edits: identity, the version token, and
 * who approved and when, which the server sets when the approval status
 * changes.
 */
const NON_EDITABLE_FIELDS = new Set<keyof NewIncidentFormValues>([
  "incident_id",
  "expected_updated_at",
  "approved_by",
  "approval_date",
  "reporter_name",
]);

const severityOptions = [
  { _id: Severity.MINOR, name: "Minor" },
  { _id: Severity.SERIOUS, name: "Serious" },
  { _id: Severity.VERY_SERIOUS, name: "Very serious" },
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
  { _id: AIIncidentManagementApprovalStatus.NOT_REQUIRED, name: "Not required" },
];

// Values are sent as stored; the option text is translated on screen.
const incidentTypeOptions = Object.values(IncidentType).map((type) => ({ _id: type, name: type }));
const harmCategories = Object.values(HarmCategory);

/** Section heading styles: sentence case, small and muted. */
const sectionTitleSx = { fontSize: 13, fontWeight: 600 } as const;
const sectionHintSx = { fontSize: 12, fontWeight: 400 } as const;
/** One field of a two-field row: full width on a phone, half from sm up. */
const halfFieldSx = { gap: "6px", width: { xs: "100%", sm: "50%" }, minWidth: 0 } as const;
const fieldRowDirection = { xs: "column", sm: "row" } as const;

const DRAWER_TITLE_ID = "incident-drawer-title";

const SideDrawerIncident: FC<SideDrawerIncidentProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  initialData,
  isEdit = false,
  mode,
  incidentId,
  jiraLink,
  canEditDetails = true,
  canApprove = true,
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [values, setValues] = useState<NewIncidentFormValues>(
    () => initialData || createInitialState(),
  );
  const [users, setUsers] = useState<User[]>([]);
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

  const validators = useMemo(() => {
    // In edit mode a field is validated only when it is one of the fields the
    // user changed (the ones the save sends), as the server does, so other
    // fields of an older incident whose values predate a rule can still be
    // edited.
    const unchanged = (key: keyof NewIncidentFormValues, v: unknown) => {
      const baseline = baselineRef.current;
      return isEdit && !!baseline && isSameFormValue(key, v, baseline[key]);
    };
    return {
      ai_project: (v: unknown) => (!v ? "Use case is required." : ""),
      type: (v: unknown) => (!v && !unchanged("type", v) ? INCIDENT_TYPE_REQUIRED_MESSAGE : ""),
      severity: (v: unknown) =>
        !v && !unchanged("severity", v) ? INCIDENT_SEVERITY_REQUIRED_MESSAGE : "",
      occurred_date: (v: unknown) => {
        if (!v) return "Occurred date is required.";
        if (!unchanged("occurred_date", v) && isIncidentDateInFuture(v)) {
          return INCIDENT_FUTURE_DATE_MESSAGE;
        }
        return "";
      },
      date_detected: (v: unknown, all: NewIncidentFormValues) => {
        if (!v) return "Detected date is required.";
        // The order rule involves both dates: checked when either changed.
        // The future rule only when the detected date itself changed, as on
        // the server.
        const detectedUnchanged = unchanged("date_detected", v);
        if (detectedUnchanged && unchanged("occurred_date", all.occurred_date)) return "";
        return validateIncidentDetectedDate(v, all.occurred_date, {
          checkFuture: !detectedUnchanged,
        });
      },
      // A picked user or, on older incidents, the stored reporter text.
      reporter: (v: unknown, all: NewIncidentFormValues) =>
        !v && toId(all.reporter_id) === null ? "Reporter is required." : "",
      model_system_version: (v: unknown) =>
        typeof v === "string" &&
        v.length > INCIDENT_TEXT_MAX_LENGTH &&
        !unchanged("model_system_version", v)
          ? INCIDENT_MODEL_VERSION_TOO_LONG_MESSAGE
          : "",
      description: (v: unknown) =>
        unchanged("description", v) ? "" : validateIncidentDescription(v),
      categories_of_harm: (v: unknown) => {
        const cats = v as string[];
        return !cats || cats.length < 1 ? "Select at least one category of harm." : "";
      },
    };
  }, [isEdit]);

  const { errors, validateAll, clearFieldError, resetErrors, getFirstInvalidField } =
    useFormValidation<NewIncidentFormValues>(validators);

  // The page's harm categories, plus (when editing) any older value the
  // incident stores outside that list, so it shows as a checked box the user
  // can untick. The server accepts kept values but not new off-list ones.
  const harmOptions = useMemo(() => {
    const stored =
      isEdit && Array.isArray(initialData?.categories_of_harm)
        ? initialData.categories_of_harm
        : [];
    const extra = stored.filter(
      (category): category is string =>
        typeof category === "string" && !(harmCategories as string[]).includes(category),
    );
    return [...harmCategories, ...new Set(extra)] as string[];
  }, [isEdit, initialData]);

  // Every use case the user can see: the server accepts any use case of the
  // organization (not only approved ones), so none is left out of the picker.
  const { data: projects } = useProjects();

  // A newly opened drawer is a new draft: forget any save still in flight.
  // A new incident starts from fresh defaults, so its dates are the user's
  // today when they open it.
  useEffect(() => {
    if (isOpen) {
      draftSeqRef.current += 1;
      isSavingRef.current = false;
      setIsSaving(false);
      if (!initialData) setValues(createInitialState());
    }
    // Only on open: initialData changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A failed list leaves its picker empty (a stored value still shows); the
  // failure is logged, and the server checks every reference on save.
  const fetchUsers = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      if (response?.data) setUsers(response.data);
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to load users for the incident drawer: ${error}`,
      });
    }
  };

  // Fetch model inventory for the affected-model picker (issue #4583)
  const fetchModelInventories = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/modelInventory" });
      if (response?.data) setModelInventories(response.data);
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to load models for the incident drawer: ${error}`,
      });
    }
  };

  // Use case options keyed by project id. Titles are not unique, so a title
  // shared by several use cases gets the use case's ID after it. An incident
  // opened with a use case that is not listed (stored as text only, or a use
  // case the user cannot see) keeps it as an extra option, built from the
  // incident as opened, so it still shows and can be picked again.
  const projectList = useMemo<Project[]>(
    () => (Array.isArray(projects) ? projects : []),
    [projects],
  );
  const baselineProjectId = toId(initialData?.project_id);
  const baselineProjectLabel = initialData?.ai_project || "";
  const baselineProjectIsListed =
    baselineProjectId !== null && projectList.some((p) => p.id === baselineProjectId);
  const storedProjectOptionId: string | number = baselineProjectId ?? STORED_USE_CASE_OPTION;
  const hasStoredProjectOption = !baselineProjectIsListed && !!baselineProjectLabel;
  const projectOptions = useMemo(() => {
    const titleCounts = new Map<string, number>();
    projectList.forEach((p) =>
      titleCounts.set(p.project_title, (titleCounts.get(p.project_title) ?? 0) + 1),
    );
    const options: { _id: string | number; name: string; noTranslate: true }[] = projectList.map(
      (p) => ({
        _id: p.id,
        name:
          (titleCounts.get(p.project_title) ?? 0) > 1 && p.uc_id
            ? `${p.project_title} (${p.uc_id})`
            : p.project_title,
        noTranslate: true,
      }),
    );
    if (hasStoredProjectOption) {
      options.unshift({
        _id: storedProjectOptionId,
        name: baselineProjectLabel,
        noTranslate: true,
      });
    }
    return options;
  }, [projectList, hasStoredProjectOption, storedProjectOptionId, baselineProjectLabel]);
  const projectValue = toId(values.project_id) ?? (values.ai_project ? STORED_USE_CASE_OPTION : "");

  // Reporter options keyed by user id. An incident opened with a reporter who
  // is not a listed user (text only, or someone who left) keeps that reporter
  // as an extra option, built from the incident as opened (initialData), so
  // the user can go back to it after picking someone else.
  const reporterId = toId(values.reporter_id);
  const baselineReporterId = toId(initialData?.reporter_id);
  const baselineReporterLabel = initialData
    ? initialData.reporter_name || initialData.reporter || ""
    : "";
  const baselineReporterIsListed =
    baselineReporterId !== null && users.some((u) => u.id === baselineReporterId);
  const storedReporterOptionId: string | number = baselineReporterId ?? STORED_REPORTER_OPTION;
  const hasStoredReporterOption = !baselineReporterIsListed && !!baselineReporterLabel;
  const reporterOptions = useMemo(() => {
    const options: { _id: string | number; name: string; noTranslate?: boolean }[] = users.map(
      (u) => ({
        _id: u.id,
        name: `${u.name} ${u.surname}`.trim(),
        noTranslate: true,
      }),
    );
    if (hasStoredReporterOption) {
      options.unshift({
        _id: storedReporterOptionId,
        name: baselineReporterLabel,
        noTranslate: true,
      });
    }
    return options;
  }, [users, hasStoredReporterOption, storedReporterOptionId, baselineReporterLabel]);
  const reporterValue = reporterId ?? (values.reporter ? STORED_REPORTER_OPTION : "");

  const handleReporterChange = useCallback(
    (e: any) => {
      const picked = e.target.value;
      setValues((prev) => {
        if (hasStoredReporterOption && String(picked) === String(storedReporterOptionId)) {
          // Back to the reporter the incident was opened with.
          if (!initialData) return prev;
          return {
            ...prev,
            reporter_id: initialData.reporter_id,
            reporter: initialData.reporter,
            reporter_name: initialData.reporter_name,
          };
        }
        const user = users.find((u) => u.id === Number(picked));
        if (!user) return prev;
        // The server writes the user's full name into the reporter text too.
        return {
          ...prev,
          reporter_id: user.id,
          reporter: `${user.name} ${user.surname}`.trim(),
          reporter_name: `${user.name} ${user.surname}`.trim(),
        };
      });
      clearFieldError("reporter");
    },
    [users, clearFieldError, hasStoredReporterOption, storedReporterOptionId, initialData],
  );

  // Owner/assignee options keyed by user id (issue #4583)
  const assigneeOptions = useMemo(
    () => [
      // "(none)" clears the owner FK — '' is normalised to null on save (issue #4583)
      { _id: "" as string | number, name: "(none)", noTranslate: false },
      ...users.map((u) => ({ _id: u.id, name: `${u.name} ${u.surname}`, noTranslate: true })),
    ],
    [users],
  );

  // Affected-model options keyed by model inventory id (issue #4583)
  const modelInventoryOptions = useMemo(
    () => [
      // "(none)" clears the affected-model FK — '' is normalised to null on save (issue #4583)
      { _id: "" as string | number, name: "(none)", noTranslate: false },
      ...modelInventories.map((m) => ({
        _id: m.id,
        name: [m.provider, m.model].filter(Boolean).join(" "),
        noTranslate: true,
      })),
    ],
    [modelInventories],
  );

  // The use case is picked by id (project_id); its title is copied into the
  // free-text ai_project, which the server requires and older incidents use.
  const handleProjectChange = useCallback(
    (e: any) => {
      const picked = e.target.value;
      setValues((prev) => {
        if (hasStoredProjectOption && String(picked) === String(storedProjectOptionId)) {
          // Back to the use case the incident was opened with.
          if (!initialData) return prev;
          return {
            ...prev,
            ai_project: initialData.ai_project,
            project_id: initialData.project_id,
          };
        }
        const project = projectList.find((p) => p.id === Number(picked));
        if (!project) return prev;
        return { ...prev, ai_project: project.project_title, project_id: project.id };
      });
      clearFieldError("ai_project");
    },
    [projectList, clearFieldError, hasStoredProjectOption, storedProjectOptionId, initialData],
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
    (prop: "occurred_date" | "date_detected") => (newDate: Dayjs | null) => {
      if (newDate?.isValid()) {
        setValues((prev) => ({
          ...prev,
          [prop]: newDate.format("YYYY-MM-DD"),
        }));
        clearFieldError(prop);
        // The detected date's order error depends on the occurred date too.
        if (prop === "occurred_date") clearFieldError("date_detected");
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
    setValues(createInitialState());
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
    // An approver who cannot edit details changes only approval fields, which
    // have no rules; the details are as stored and not theirs to fix.
    if (!canEditDetails || validateAll(values, INCIDENT_FORM_FIELD_ORDER)) {
      const formData: NewIncidentFormValues = {
        ...values,
        project_id: toId(values.project_id),
        model_inventory_id: toId(values.model_inventory_id),
        assignee_id: toId(values.assignee_id),
        reporter_id: toId(values.reporter_id),
      };
      // When editing, send only what the user changed (plus the version), so
      // a save never writes back stale copies of fields someone else changed.
      const baseline = baselineRef.current;
      let body: Partial<NewIncidentFormValues> = Object.fromEntries(
        Object.entries(formData).filter(
          ([key]) => key !== "approved_by" && key !== "approval_date" && key !== "reporter_name",
        ),
      );
      if (isEdit && baseline) {
        const changed: Record<string, unknown> = {};
        for (const key of Object.keys(formData) as (keyof NewIncidentFormValues)[]) {
          if (NON_EDITABLE_FIELDS.has(key)) continue;
          if (!isSameFormValue(key, formData[key], baseline[key])) changed[key] = formData[key];
        }
        // The reporter is one value in two fields: send both whenever either
        // changed. A reporter text alone tells the server the reporter is no
        // longer a user (re-picking the original user after a rename changes
        // only the text); with the id, the server writes the user's name.
        if ("reporter" in changed || "reporter_id" in changed) {
          changed.reporter = formData.reporter;
          changed.reporter_id = formData.reporter_id;
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
  // Details need incident.edit (incident.create for a new one); approval
  // status and notes need incident.approve. The server checks the same.
  const detailsDisabled = isViewMode || !canEditDetails;
  const approvalDisabled = isViewMode || !canApprove;
  const isApprovalOnly = isEdit && !canEditDetails && canApprove;

  useModalKeyHandling({ isOpen, onClose: handleClose });

  const drawerTitle = isViewMode
    ? "View incident"
    : isApprovalOnly
      ? "Record approval"
      : isEdit
        ? "Edit incident"
        : "Create new incident";

  const sectionHeading = (title: string, hint: string) => (
    <Stack direction="row" gap="8px" alignItems="baseline" flexWrap="wrap">
      <Typography component="h3" sx={{ ...sectionTitleSx, color: theme.palette.text.primary }}>
        {title}
      </Typography>
      <Typography sx={{ ...sectionHintSx, color: theme.palette.text.tertiary }}>{hint}</Typography>
    </Stack>
  );

  const sectionDivider = (
    <Box sx={{ py: "12px" }}>
      <Divider sx={{ mx: "-20px" }} />
    </Box>
  );

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={handleClose}
      slotProps={{ root: { "aria-labelledby": DRAWER_TITLE_ID } }}
      sx={{
        "margin": 0,
        "& .MuiDrawer-paper": {
          margin: 0,
          borderRadius: 0,
          width: "min(700px, 100vw)",
        },
      }}
    >
      <Stack
        sx={{
          width: "100%",
          maxHeight: "100vh",
          overflowY: "auto",
          p: "20px",
          bgcolor: theme.palette.background.paper,
        }}
      >
        {/* Header, in every mode */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          gap="8px"
          mb="6px"
        >
          <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap" minWidth={0}>
            <Typography
              id={DRAWER_TITLE_ID}
              component="h2"
              fontWeight={600}
              color={theme.palette.text.primary}
            >
              {drawerTitle}
            </Typography>
            {isEdit && values.incident_id && (
              <Typography
                component="span"
                fontSize={14}
                color={theme.palette.text.secondary}
                data-vw-no-translate="true"
              >
                {fill(t("(Incident ID: {id})"), { id: values.incident_id })}
              </Typography>
            )}
            {isEdit && jiraLink && <JiraIssueChip link={jiraLink} />}
          </Stack>
          <CustomizableButton
            variant="text"
            iconOnly
            ariaLabel="Close"
            onClick={handleClose}
            isDisabled={isSaving}
            testId="incident-drawer-close"
          >
            <X size={16} strokeWidth={1.5} />
          </CustomizableButton>
        </Stack>
        <Divider sx={{ mb: "8px", mx: "-20px" }} />

        {/* TabBar for edit mode */}
        {isEdit && incidentId && (
          <TabContext value={activeTab}>
            <Box sx={{ mb: "6px" }}>
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
            <Stack gap="8px" width="100%">
              {/* Section 1: incident information */}
              <Stack gap="8px">
                {sectionHeading("Incident information", "Basic incident details")}

                {/* Row: use case + incident type */}
                <Stack direction={fieldRowDirection} gap="16px" sx={{ mt: "4px" }}>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="ai_project"
                      label={USE_CASE_LABEL}
                      placeholder="Select use case"
                      items={projectOptions}
                      value={projectValue}
                      onChange={handleProjectChange}
                      error={errors.ai_project}
                      isRequired
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="type"
                      label="Incident type"
                      placeholder="Select incident type"
                      items={incidentTypeOptions}
                      value={values.type}
                      onChange={handleFieldChange("type")}
                      error={errors.type}
                      isRequired
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                </Stack>

                {/* Row: severity + status */}
                <Stack direction={fieldRowDirection} gap="16px" sx={{ mt: "4px" }}>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="severity"
                      label="Severity"
                      items={severityOptions}
                      placeholder="Select severity"
                      value={values.severity}
                      onChange={handleFieldChange("severity")}
                      error={errors.severity}
                      isRequired
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="status"
                      label="Status"
                      placeholder="Select status"
                      items={statusOptions}
                      value={values.status}
                      onChange={handleFieldChange("status")}
                      error={errors.status}
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                </Stack>

                {/* Row: affected model + owner (issue #4583 FK pickers) */}
                <Stack direction={fieldRowDirection} gap="16px" sx={{ mt: "4px" }}>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="model_inventory_id"
                      label="Affected model"
                      placeholder="Select model from inventory"
                      items={modelInventoryOptions}
                      value={values.model_inventory_id ?? ""}
                      onChange={handleFieldChange("model_inventory_id")}
                      isOptional
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="assignee_id"
                      label="Owner"
                      placeholder="Select owner"
                      items={assigneeOptions}
                      value={values.assignee_id ?? ""}
                      onChange={handleFieldChange("assignee_id")}
                      isOptional
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                </Stack>

                {/* Row: occurred date + detected date */}
                <Stack direction={fieldRowDirection} gap="16px" sx={{ mt: "4px" }}>
                  <Suspense fallback={<div>Loading...</div>}>
                    <Stack sx={halfFieldSx}>
                      <DatePicker
                        label="Occurred date"
                        date={dayjs(values.occurred_date)}
                        handleDateChange={handleDateChange("occurred_date")}
                        isRequired
                        error={errors.occurred_date}
                        sx={{ flex: 1 }}
                        disabled={detailsDisabled}
                      />
                    </Stack>
                    <Stack sx={halfFieldSx}>
                      <DatePicker
                        label="Detected date"
                        date={dayjs(values.date_detected)}
                        handleDateChange={handleDateChange("date_detected")}
                        isRequired
                        error={errors.date_detected}
                        sx={{ flex: 1 }}
                        disabled={detailsDisabled}
                      />
                    </Stack>
                  </Suspense>
                </Stack>

                {/* Row: reporter + model/system version */}
                <Stack direction={fieldRowDirection} gap="16px" sx={{ mt: "4px" }}>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="reporter"
                      label="Reporter"
                      placeholder="Select reporter"
                      items={reporterOptions}
                      value={reporterValue}
                      onChange={handleReporterChange}
                      error={errors.reporter}
                      isRequired
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                  <Stack sx={halfFieldSx}>
                    <Field
                      id="model_version"
                      label="Model / system version"
                      value={values.model_system_version || ""}
                      onChange={handleFieldChange("model_system_version")}
                      error={errors.model_system_version}
                      placeholder="Model/system version"
                      sx={{ flex: 1 }}
                      disabled={detailsDisabled}
                    />
                  </Stack>
                </Stack>
              </Stack>

              {sectionDivider}

              {/* Section 2: impact assessment */}
              <Stack gap="8px">
                {sectionHeading("Impact assessment", "What was affected")}

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
                <FormGroup id="categories-of-harm" row sx={{ gap: "6px", flexWrap: "wrap" }}>
                  {harmOptions.map((category) => (
                    <Box key={category} sx={{ flex: "1 1 120px" }}>
                      <Checkbox
                        id={`harm-category-${category}`}
                        label={category}
                        size="small"
                        isChecked={values.categories_of_harm.includes(category)}
                        value={category}
                        onChange={() => handleHarmCategoryChange(category)}
                        isDisabled={detailsDisabled}
                      />
                    </Box>
                  ))}
                </FormGroup>

                {errors.categories_of_harm && (
                  <Typography
                    role="alert"
                    color="error"
                    sx={{ mt: "1px", fontSize: 13, fontWeight: 500 }}
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
                  disabled={detailsDisabled}
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
                  disabled={detailsDisabled}
                />
                <Field
                  id="relationship"
                  label="Relationship / causality"
                  value={values.relationship_causality || ""}
                  onChange={handleFieldChange("relationship_causality")}
                  placeholder="Explain the relationship to AI system"
                  rows={2}
                  disabled={detailsDisabled}
                />
              </Stack>

              {sectionDivider}

              {/* Section 3: response and actions */}
              <Stack gap="8px">
                {sectionHeading("Response and actions", "What was or will be done")}

                <Field
                  id="immediate_mitigations"
                  label="Immediate mitigations taken"
                  value={values.immediate_mitigations || ""}
                  onChange={handleFieldChange("immediate_mitigations")}
                  placeholder="Describe immediate mitigations"
                  rows={2}
                  disabled={detailsDisabled}
                />
                <Field
                  id="planned_corrective_actions"
                  label="Planned corrective actions"
                  value={values.planned_corrective_actions || ""}
                  onChange={handleFieldChange("planned_corrective_actions")}
                  placeholder="Describe planned corrective actions"
                  rows={2}
                  disabled={detailsDisabled}
                />
              </Stack>

              {sectionDivider}

              {/* Section 4: approval and reporting */}
              <Stack gap="8px">
                {sectionHeading("Approval and reporting", "Approval workflow")}

                {/* Row: approval status + approved by */}
                <Stack direction={fieldRowDirection} gap="16px" sx={{ mt: "4px" }}>
                  <Stack sx={halfFieldSx}>
                    <SelectComponent
                      id="approval_status"
                      placeholder="Select approval status"
                      label="Approval status"
                      items={approvalStatusOptions}
                      value={values.approval_status}
                      onChange={handleFieldChange("approval_status")}
                      sx={{ flex: 1 }}
                      disabled={approvalDisabled}
                    />
                  </Stack>
                  {/* Set by the server when the approval status changes. */}
                  <Stack sx={halfFieldSx}>
                    <Field
                      id="approved_by"
                      label="Approved by"
                      value={values.approved_by || ""}
                      placeholder="Set when approved or rejected"
                      sx={{ flex: 1 }}
                      disabled
                    />
                  </Stack>
                </Stack>

                {/* Row: approval date (read-only, set by the server) */}
                <Stack direction={fieldRowDirection} gap="16px" sx={{ mt: "4px" }}>
                  <Stack sx={halfFieldSx}>
                    <Field
                      id="approval_date"
                      label="Approval date"
                      value={values.approval_date || ""}
                      placeholder="Set when approved or rejected"
                      sx={{ flex: 1 }}
                      disabled
                    />
                  </Stack>
                </Stack>

                <Field
                  id="approval_notes"
                  label="Approval notes / comments"
                  value={values.approval_notes || ""}
                  onChange={handleFieldChange("approval_notes")}
                  placeholder="Add approval notes"
                  rows={2}
                  disabled={approvalDisabled}
                />

                {/* Interim report toggle */}
                <FormControlLabel
                  control={
                    <Toggle
                      checked={values.interim_report}
                      onChange={handleSwitchChange("interim_report")}
                    />
                  }
                  label="This incident has an interim report"
                  sx={{
                    "mt": "4px",
                    "& .MuiFormControlLabel-label": {
                      fontSize: 13,
                    },
                  }}
                  disabled={detailsDisabled}
                />
              </Stack>
            </Stack>

            {/* Buttons */}
            <Stack direction="row" gap="8px" mt="12px" justifyContent="flex-end">
              {isViewMode ? (
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
