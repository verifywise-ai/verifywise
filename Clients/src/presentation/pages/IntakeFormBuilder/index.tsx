import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Stack,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  Collapse,
  useTheme,
} from "@mui/material";
import {
  Save,
  Send,
  Archive,
  Eye,
  Copy,
  Settings,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  PaintBucket,
  Plus,
  Workflow,
} from "lucide-react";
import {
  getIntakeForm,
  createIntakeForm,
  updateIntakeForm,
  getEligibleReviewers,
  IntakeFormStatus,
  IntakeEntityType,
} from "../../../application/repository/intakeForm.repository";
import CustomAxios from "../../../infrastructure/api/customAxios";
import { useAuth } from "../../../application/hooks/useAuth";
import { invalidateLLMKeyQueries, useLLMKeys } from "../../../application/hooks/useLLMKeys";
import { validateSchemaLogic } from "../../../application/utils/intakeFormLogic";
import { getClientErrorReason, isClientError } from "../../../application/utils/apiErrorReason";
import {
  FieldPalette,
  SuggestedQuestionsPanel,
  SuggestedQuestionsPanelHandle,
} from "./FieldPalette";
import { FormCanvas, FormCanvasHandle } from "./FormCanvas";
import { FieldEditor } from "./FieldEditor";
import { LogicOverviewPanel } from "./logic/LogicOverviewPanel";
import { DesignPanel } from "./DesignPanel";
import RoutingSettingsSection, { getRoutingErrors } from "./routing/RoutingSettingsSection";
import CustomizableMultiSelect from "../../components/Inputs/Select/Multi";
import {
  FormField,
  IntakeForm,
  createEmptyForm,
  isRiskStepSetField,
  generateFieldId,
  withSequentialOrder,
  generateSlug,
  DEFAULT_DESIGN_SETTINGS,
  analyzeMappingCoverage,
  createFieldFromMapping,
  usedEntityMappingsFor,
} from "./types";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import EuAiActStepToggle from "./EuAiActStepToggle";
import LiveChecksToggle from "./LiveChecksToggle";
import Chip from "../../components/Chip";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";

// ============================================================================
// Helpers
// ============================================================================

type BuilderMode = "edit" | "design" | "logic";

const BUILDER_MODES: Array<{ mode: BuilderMode; label: string; Icon: typeof Pencil }> = [
  { mode: "edit", label: "Edit", Icon: Pencil },
  { mode: "design", label: "Design", Icon: PaintBucket },
  { mode: "logic", label: "Logic", Icon: Workflow },
];

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

// ============================================================================
// Main component
// ============================================================================

export function IntakeFormBuilder() {
  const { formId } = useParams<{ formId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entityTypeParam = searchParams.get("entityType");
  const theme = useTheme();

  // --- Builder state ---
  const isEditing = Boolean(formId) && formId !== "new";
  const [builderMode, setBuilderMode] = useState<BuilderMode>("edit");
  const [form, setForm] = useState<IntakeForm>(createEmptyForm());
  const canvasRef = useRef<FormCanvasHandle>(null);
  const suggestedPanelRef = useRef<SuggestedQuestionsPanelHandle>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  // Starts true when editing so the default form never renders in its place.
  const [isLoadingForm, setIsLoadingForm] = useState(isEditing);
  // Set when the stored form could not be loaded. The builder is not shown, so
  // the default form cannot be saved over the stored one.
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Only an Admin may change routing; everyone else's saves leave it to the server's copy
  const { userRoleName } = useAuth();
  const canEditRouting = userRoleName === "Admin";
  // Shared, per-organization cache: refreshed wherever a key changes. A failed
  // load leaves the picker with only "None", as before.
  const { keys: llmKeys, loading: llmKeysLoading, isError: llmKeysError } = useLLMKeys();
  const queryClient = useQueryClient();
  // A stored id can outlive its key (deleted elsewhere). Once the key list has
  // loaded, an id that is not in it counts as no key. While the list is
  // loading or failed to load, the stored id is trusted as is.
  const llmKeysLoaded = !llmKeysLoading && !llmKeysError;
  const activeLlmKeyId =
    form.llmKeyId && (!llmKeysLoaded || llmKeys.some((key) => key.id === form.llmKeyId))
      ? form.llmKeyId
      : null;
  const [formSettingsOpen, setFormSettingsOpen] = useState(true);
  const [orgUsers, setOrgUsers] = useState<
    Array<{ id: number; name: string; surname?: string; email: string }>
  >([]);
  const [routingReviewers, setRoutingReviewers] = useState<
    Array<{ _id: number; name: string; email: string }>
  >([]);
  const [routingReviewersLoaded, setRoutingReviewersLoaded] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null);
  const [deleteFieldModalOpen, setDeleteFieldModalOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "warning" | "info";
  }>({ open: false, message: "", severity: "info" });

  // ============================================================================
  // Data loading
  // ============================================================================

  // Bumped each time the builder opens a form, so a save reply for the
  // previous form is ignored (see applySaved).
  const loadCountRef = useRef(0);
  // Set by a create just before it moves to the new form's edit route.
  const createdIdRef = useRef<number | null>(null);

  // Load single form for the builder
  useEffect(() => {
    // The form just created is already on screen, with any edit made while
    // it saved: loading it again would replace those edits.
    if (isEditing && formId && createdIdRef.current === parseInt(formId)) {
      createdIdRef.current = null;
      return;
    }
    const load = ++loadCountRef.current;
    if (isEditing && formId) {
      setIsLoadingForm(true);
      setLoadFailed(false);
      getIntakeForm(parseInt(formId))
        .then((response) => {
          // A later load opened another form: this reply is not for it.
          if (loadCountRef.current !== load) return;
          if (response.data) {
            setForm({
              ...response.data,
              schema: {
                ...response.data.schema,
                fields: withSequentialOrder(response.data.schema?.fields ?? []),
              },
            });
          } else setLoadFailed(true);
        })
        .catch(() => {
          if (loadCountRef.current !== load) return;
          setLoadFailed(true);
          setSnackbar({
            open: true,
            message: "Failed to load form",
            severity: "error",
          });
        })
        .finally(() => {
          if (loadCountRef.current === load) setIsLoadingForm(false);
        });
    } else if (formId === "new") {
      const entityType =
        entityTypeParam === IntakeEntityType.MODEL
          ? IntakeEntityType.MODEL
          : IntakeEntityType.USE_CASE;
      setLoadFailed(false);
      setForm(createEmptyForm(entityType));
      setSelectedFieldId(null);
      setIsDirty(false);
    }
  }, [formId, isEditing, entityTypeParam]);

  // Load users (once)
  useEffect(() => {
    CustomAxios.get("/users")
      .then((res) => {
        const users = res.data?.data || res.data || [];
        setOrgUsers(Array.isArray(users) ? users : []);
      })
      .catch(() => {});
  }, []);

  // Load the users a form can route to (once)
  useEffect(() => {
    getEligibleReviewers()
      .then((users) => {
        setRoutingReviewers(
          (Array.isArray(users) ? users : []).map((u) => ({
            _id: u.id,
            name: [u.name, u.surname].filter(Boolean).join(" "),
            email: u.email,
          })),
        );
        setRoutingReviewersLoaded(true);
      })
      .catch(() => {});
  }, []);

  // ============================================================================
  // Builder handlers
  // ============================================================================

  // Counts every edit, so a save can tell whether the form changed while
  // its request ran (see applySaved).
  const editCountRef = useRef(0);
  // Also passed to the field editor, which sends edits after a pause: Save is
  // enabled on the first keystroke, so a quick Save click is not lost on a
  // disabled button.
  const markEdited = useCallback(() => {
    editCountRef.current += 1;
    setIsDirty(true);
  }, []);

  // The server replies with the form as it was sent. An edit made while the
  // request ran is newer, so it is kept: only server-owned values are taken
  // from the reply and the form stays unsaved.
  const applySaved = useCallback(
    (
      saved: Partial<IntakeForm> | undefined,
      editsAtStart: number,
      loadsAtStart: number,
      overrides?: Partial<IntakeForm>,
    ) => {
      // Another form was opened while the request ran: this reply is not for it.
      if (loadCountRef.current !== loadsAtStart) return;
      const editedDuringSave = editCountRef.current !== editsAtStart;
      if (saved) {
        setForm((prev) =>
          editedDuringSave
            ? {
                ...prev,
                id: saved.id ?? prev.id,
                slug: prev.slug || saved.slug || "",
                publicId: saved.publicId ?? prev.publicId,
                status: saved.status ?? prev.status,
                ttlExpiresAt: saved.ttlExpiresAt ?? prev.ttlExpiresAt,
                createdBy: saved.createdBy ?? prev.createdBy,
                createdAt: saved.createdAt ?? prev.createdAt,
                updatedAt: saved.updatedAt ?? prev.updatedAt,
                ...overrides,
              }
            : { ...prev, ...saved, ...overrides },
        );
      }
      setIsDirty(editedDuringSave);
    },
    [],
  );

  const updateForm = useCallback(
    (updates: Partial<IntakeForm>) => {
      setForm((prev) => ({ ...prev, ...updates }));
      markEdited();
    },
    [markEdited],
  );

  const updateField = useCallback(
    (updatedField: FormField) => {
      setForm((prev) => ({
        ...prev,
        schema: {
          ...prev.schema,
          fields: prev.schema.fields.map((f) => (f.id === updatedField.id ? updatedField : f)),
        },
      }));
      markEdited();
    },
    [markEdited],
  );

  const addField = useCallback(
    (field: FormField) => {
      setForm((prev) => ({
        ...prev,
        schema: {
          ...prev.schema,
          fields: [...prev.schema.fields, field].map((f, i) =>
            f.order === i ? f : { ...f, order: i },
          ),
        },
      }));
      markEdited();
      setSelectedFieldId(field.id);
      canvasRef.current?.scrollToBottom();
    },
    [markEdited],
  );

  const requestDeleteField = useCallback((fId: string) => {
    setFieldToDelete(fId);
    setDeleteFieldModalOpen(true);
  }, []);

  const confirmDeleteField = useCallback(() => {
    if (!fieldToDelete) return;
    setForm((prev) => ({
      ...prev,
      schema: {
        ...prev.schema,
        fields: prev.schema.fields
          .filter((f) => f.id !== fieldToDelete)
          .map((f, i) => (f.order === i ? f : { ...f, order: i })),
      },
    }));
    markEdited();
    if (selectedFieldId === fieldToDelete) setSelectedFieldId(null);
    setFieldToDelete(null);
    setDeleteFieldModalOpen(false);
  }, [fieldToDelete, selectedFieldId, markEdited]);

  // The copy goes right after the original.
  const duplicateField = useCallback(
    (field: FormField) => {
      const newField: FormField = {
        ...field,
        id: generateFieldId(),
        label: `${field.label} (copy)`,
      };
      setForm((prev) => {
        const index = prev.schema.fields.findIndex((f) => f.id === field.id);
        const fields = [...prev.schema.fields];
        fields.splice(index < 0 ? fields.length : index + 1, 0, newField);
        return {
          ...prev,
          schema: { ...prev.schema, fields: fields.map((f, i) => ({ ...f, order: i })) },
        };
      });
      markEdited();
      setSelectedFieldId(newField.id);
    },
    [markEdited],
  );

  const moveFieldUp = useCallback(
    (fId: string) => {
      setForm((prev) => {
        const index = prev.schema.fields.findIndex((f) => f.id === fId);
        if (index <= 0) return prev;
        return {
          ...prev,
          schema: {
            ...prev.schema,
            fields: arrayMove(prev.schema.fields, index, index - 1).map((f, i) => ({
              ...f,
              order: i,
            })),
          },
        };
      });
      markEdited();
    },
    [markEdited],
  );

  const moveFieldDown = useCallback(
    (fId: string) => {
      setForm((prev) => {
        const index = prev.schema.fields.findIndex((f) => f.id === fId);
        if (index === -1 || index >= prev.schema.fields.length - 1) return prev;
        return {
          ...prev,
          schema: {
            ...prev.schema,
            fields: arrayMove(prev.schema.fields, index, index + 1).map((f, i) => ({
              ...f,
              order: i,
            })),
          },
        };
      });
      markEdited();
    },
    [markEdited],
  );

  /**
   * Shows why a form write failed. A rejected write that sent a key may mean
   * the key was deleted elsewhere (the server's reason is translated, so it is
   * not matched): refetch the key list so a missing key falls back to none.
   */
  const showWriteError = (error: unknown, sentLlmKeyId: number | null, fallback: string) => {
    if (sentLlmKeyId && isClientError(error)) {
      void invalidateLLMKeyQueries(queryClient);
    }
    setSnackbar({
      open: true,
      message: getClientErrorReason(error) ?? fallback,
      severity: "error",
    });
  };

  const handleSave = async (): Promise<number | null> => {
    if (!form.name.trim()) {
      setSnackbar({
        open: true,
        message: "Form name is required",
        severity: "error",
      });
      return null;
    }
    if (canEditRouting && Object.keys(getRoutingErrors(form.routing ?? null)).length > 0) {
      setSnackbar({
        open: true,
        message: "Fix the routing settings before saving",
        severity: "error",
      });
      return null;
    }
    // A draft may be saved with unfinished logic; a live form may not.
    const isLive = form.status === IntakeFormStatus.ACTIVE;
    if (logicErrors.length > 0 && isLive) {
      setSnackbar({
        open: true,
        message: "Fix the highlighted fields before saving",
        severity: "error",
      });
      return null;
    }
    const savedMessage =
      logicErrors.length > 0 ? "Draft saved. Fix the highlighted fields before publishing" : null;
    const editsAtStart = editCountRef.current;
    const loadsAtStart = loadCountRef.current;
    setIsSaving(true);
    try {
      const formData = {
        ...form,
        slug: form.slug || generateSlug(form.name),
        recipients: form.recipients ?? [],
        riskTierSystem: form.riskTierSystem ?? "eu_ai_act",
        llmKeyId: activeLlmKeyId,
        suggestedQuestionsEnabled: form.suggestedQuestionsEnabled ?? false,
        euAiActRiskStepEnabled: form.euAiActRiskStepEnabled ?? false,
        liveChecksEnabled: form.liveChecksEnabled ?? true,
        ...(canEditRouting ? {} : { routing: undefined }),
      };
      if (isEditing && formId) {
        const response = await updateIntakeForm(parseInt(formId), formData);
        applySaved(response.data, editsAtStart, loadsAtStart);
        setSnackbar({
          open: true,
          message: savedMessage ?? "Form saved successfully",
          severity: savedMessage ? "warning" : "success",
        });
        return parseInt(formId);
      } else {
        const response = await createIntakeForm(formData);
        if (response.data?.id) {
          applySaved(response.data, editsAtStart, loadsAtStart);
          // Only when the new form is still the one on screen.
          if (loadCountRef.current === loadsAtStart) {
            createdIdRef.current = response.data.id;
            navigate(`/intake-forms/${response.data.id}/edit`, { replace: true });
          }
          setSnackbar({
            open: true,
            message: savedMessage ?? "Form created successfully",
            severity: savedMessage ? "warning" : "success",
          });
          return response.data.id;
        }
      }
      return null;
    } catch (error) {
      showWriteError(error, activeLlmKeyId, "Failed to save form");
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const doPublish = async () => {
    // The "Publish anyway" path skips handlePublish, and a debounced field edit
    // can add a logic error while its modal is open; say so instead of doing nothing.
    if (logicErrors.length > 0) {
      setSnackbar({
        open: true,
        message: "Fix the highlighted fields before publishing",
        severity: "error",
      });
      return;
    }
    if (canEditRouting && Object.keys(getRoutingErrors(form.routing ?? null)).length > 0) {
      setSnackbar({
        open: true,
        message: "Fix the routing settings before publishing",
        severity: "error",
      });
      return;
    }
    const editsAtStart = editCountRef.current;
    const loadsAtStart = loadCountRef.current;
    setIsSaving(true);
    try {
      const formData = {
        ...form,
        slug: form.slug || generateSlug(form.name),
        recipients: form.recipients ?? [],
        riskTierSystem: form.riskTierSystem ?? "eu_ai_act",
        llmKeyId: activeLlmKeyId,
        suggestedQuestionsEnabled: form.suggestedQuestionsEnabled ?? false,
        euAiActRiskStepEnabled: form.euAiActRiskStepEnabled ?? false,
        liveChecksEnabled: form.liveChecksEnabled ?? true,
        ...(canEditRouting ? {} : { routing: undefined }),
        status: IntakeFormStatus.ACTIVE,
      };
      const formIdNum = isEditing && formId ? parseInt(formId) : undefined;
      let publishedData;
      if (formIdNum) {
        const response = await updateIntakeForm(formIdNum, formData);
        publishedData = response.data;
      } else {
        const response = await createIntakeForm(formData);
        publishedData = response.data;
        if (publishedData?.id && loadCountRef.current === loadsAtStart) {
          createdIdRef.current = publishedData.id;
          navigate(`/intake-forms/${publishedData.id}/edit`, { replace: true });
        }
      }
      applySaved(publishedData, editsAtStart, loadsAtStart, { status: IntakeFormStatus.ACTIVE });
      setSnackbar({
        open: true,
        message: "Form published successfully",
        severity: "success",
      });
    } catch (error) {
      showWriteError(error, activeLlmKeyId, "Failed to publish form");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (logicErrors.length > 0) {
      setSnackbar({
        open: true,
        message: "Fix the highlighted fields before publishing",
        severity: "error",
      });
      return;
    }
    if (form.schema.fields.length === 0) {
      setSnackbar({
        open: true,
        message: "Add at least one field before publishing",
        severity: "error",
      });
      return;
    }
    if (!form.name.trim()) {
      setSnackbar({
        open: true,
        message: "Form name is required",
        severity: "error",
      });
      return;
    }

    // Block publish if required entity fields are unmapped
    if (mappingCoverage.missingRequired.length > 0) {
      setRequiredFieldsModalOpen(true);
      return;
    }

    // Block publish if any mapped field has incompatible type
    if (mappingCoverage.typeMismatches.length > 0) {
      const details = mappingCoverage.typeMismatches
        .map(
          (m) =>
            `"${m.formField.label}" is ${m.formField.type} but "${m.entityMapping.label}" requires ${m.entityMapping.requiredFieldType.join(" or ")}`,
        )
        .join("; ");
      setSnackbar({
        open: true,
        message: `Field type mismatch: ${details}`,
        severity: "error",
      });
      return;
    }

    // Warn if optional entity fields are unmapped
    if (mappingCoverage.missingOptional.length > 0) {
      setPublishWarningOpen(true);
      return;
    }

    await doPublish();
  };

  const handleArchiveBuilder = async () => {
    if (!formId || formId === "new" || isSaving) return;
    // Shares the saving lock with Save and Publish: a save reply landing
    // after the archive would put the old status back.
    const loadsAtStart = loadCountRef.current;
    setIsSaving(true);
    try {
      await updateIntakeForm(parseInt(formId), {
        status: IntakeFormStatus.ARCHIVED,
      });
      if (loadCountRef.current === loadsAtStart) {
        setForm((prev) => ({ ...prev, status: IntakeFormStatus.ARCHIVED }));
      }
      setSnackbar({
        open: true,
        message: "Form archived successfully",
        severity: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: "Failed to archive form",
        severity: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyBuilderLink = () => {
    const publicId = form.publicId;
    if (!publicId) {
      setSnackbar({
        open: true,
        message: "Publish the form first to generate a shareable link",
        severity: "error",
      });
      return;
    }
    const link = `${window.location.origin}/${publicId}/use-case-form-intake`;
    navigator.clipboard.writeText(link).catch(() => {});
    setSnackbar({
      open: true,
      message: "Form link copied to clipboard",
      severity: "info",
    });
  };

  const handlePreviewBuilder = () => {
    const publicId = form.publicId;
    if (publicId) window.open(`/${publicId}/use-case-form-intake`, "_blank");
  };

  const [publishWarningOpen, setPublishWarningOpen] = useState(false);
  const [requiredFieldsModalOpen, setRequiredFieldsModalOpen] = useState(false);

  // ============================================================================
  // Derived values
  // ============================================================================

  // Same checks the server runs on save, shown while editing.
  const logicErrors = useMemo(
    () => validateSchemaLogic(form.schema, form.entityType),
    [form.schema, form.entityType],
  );
  const logicErrorFieldIds = useMemo(
    () => new Set(logicErrors.map((error) => error.fieldId)),
    [logicErrors],
  );

  const mappingCoverage = useMemo(
    () =>
      analyzeMappingCoverage(form.schema.fields, form.entityType, {
        riskStepEnabled: form.euAiActRiskStepEnabled ?? false,
      }),
    [form.schema.fields, form.entityType, form.euAiActRiskStepEnabled],
  );

  const selectedField = form.schema.fields.find((f) => f.id === selectedFieldId);
  const fieldToDeleteLabel = fieldToDelete
    ? form.schema.fields.find((f) => f.id === fieldToDelete)?.label || "this field"
    : "this field";

  const llmKeyItems = [
    { _id: "", name: "None" },
    ...llmKeys.map((key) => ({
      _id: String(key.id),
      name: `${key.name} — ${key.model}`,
    })),
    // The stored key while the list is loading or failed to load, so the
    // picker shows it rather than an empty value.
    ...(activeLlmKeyId && !llmKeys.some((key) => key.id === activeLlmKeyId)
      ? [{ _id: String(activeLlmKeyId), name: "Saved key" }]
      : []),
  ];

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Stack className="vwhome" gap="16px">
      <PageBreadcrumbs
        items={[
          {
            label: "Intake forms",
            path: "/intake-forms",
            icon: <ClipboardList size={14} strokeWidth={1.5} />,
          },
          {
            label: isEditing ? form.name || "Edit form" : formId === "new" ? "New form" : "Builder",
            icon: <ClipboardList size={14} strokeWidth={1.5} />,
          },
        ]}
      />

      <Box sx={{ height: "calc(100vh - 100px)" }}>
        <Box
          sx={{
            height: "100%",
            backgroundColor: theme.palette.background.main,
            borderRadius: theme.shape.borderRadius,
            border: `1px solid ${theme.palette.border.dark}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {isLoadingForm ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
              }}
            >
              <CircularProgress sx={{ color: theme.palette.primary.main }} />
            </Box>
          ) : loadFailed ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
              }}
            >
              <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
                Failed to load form
              </Typography>
            </Box>
          ) : (
            <>
              {/* Builder header */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 2,
                  py: 1,
                  borderBottom: `1px solid ${theme.palette.border.dark}`,
                  backgroundColor: theme.palette.background.main,
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    minWidth: 0,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Chip label={`Status: ${form.status}`} uppercase={false} />
                    <Chip
                      label={
                        form.entityType === IntakeEntityType.USE_CASE
                          ? "Type: AI use case"
                          : "Type: Model inventory"
                      }
                      uppercase={false}
                      backgroundColor="#E3F2FD"
                      textColor="#1565C0"
                    />
                    {isDirty && (
                      <Typography sx={{ color: theme.palette.text.accent, fontSize: "11px" }}>
                        Unsaved
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Centered Edit / Design / Logic toggle */}
                <Box
                  sx={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex",
                    border: `1px solid ${theme.palette.border.dark}`,
                    borderRadius: "6px",
                    overflow: "hidden",
                  }}
                >
                  {BUILDER_MODES.map(({ mode, label, Icon }, index) => (
                    <Box
                      key={mode}
                      component="button"
                      type="button"
                      aria-pressed={builderMode === mode}
                      onClick={() => setBuilderMode(mode)}
                      sx={{
                        "display": "flex",
                        "alignItems": "center",
                        "gap": "5px",
                        "px": "12px",
                        "py": "5px",
                        "border": "none",
                        "borderLeft":
                          index === 0 ? "none" : `1px solid ${theme.palette.border.dark}`,
                        "font": "inherit",
                        "cursor": "pointer",
                        "fontSize": "12px",
                        "fontWeight": 600,
                        "userSelect": "none",
                        "backgroundColor":
                          builderMode === mode
                            ? theme.palette.primary.main
                            : theme.palette.background.main,
                        "color":
                          builderMode === mode
                            ? theme.palette.background.main
                            : theme.palette.text.secondary,
                        "transition": "all 0.15s ease",
                        "&:hover": {
                          backgroundColor:
                            builderMode === mode
                              ? "brand.primaryHover"
                              : theme.palette.background.accent,
                        },
                      }}
                    >
                      <Icon size={13} />
                      {label}
                    </Box>
                  ))}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flexShrink: 0,
                  }}
                >
                  {form.status === IntakeFormStatus.ACTIVE && (
                    <>
                      <Tooltip title="Copy link">
                        <Box
                          onClick={handleCopyBuilderLink}
                          sx={{
                            "cursor": "pointer",
                            "display": "flex",
                            "alignItems": "center",
                            "p": 0.5,
                            "borderRadius": "4px",
                            "&:hover": { backgroundColor: theme.palette.background.accent },
                          }}
                        >
                          <Copy size={15} color={theme.palette.text.tertiary} />
                        </Box>
                      </Tooltip>
                      <Tooltip title="Preview">
                        <Box
                          onClick={handlePreviewBuilder}
                          sx={{
                            "cursor": "pointer",
                            "display": "flex",
                            "alignItems": "center",
                            "p": 0.5,
                            "borderRadius": "4px",
                            "&:hover": { backgroundColor: theme.palette.background.accent },
                          }}
                        >
                          <Eye size={15} color={theme.palette.text.tertiary} />
                        </Box>
                      </Tooltip>
                    </>
                  )}
                  {form.status === IntakeFormStatus.ACTIVE && (
                    <CustomizableButton
                      variant="outlined"
                      onClick={handleArchiveBuilder}
                      isDisabled={isSaving}
                      icon={<Archive size={14} />}
                      text="Archive"
                      sx={{
                        "height": 34,
                        "fontSize": "13px",
                        "borderColor": theme.palette.border.dark,
                        "color": theme.palette.text.secondary,
                        "&:hover": {
                          borderColor: theme.palette.text.accent,
                          backgroundColor: theme.palette.background.accent,
                        },
                      }}
                    />
                  )}
                  <CustomizableButton
                    variant="outlined"
                    onClick={handleSave}
                    isDisabled={isSaving || !isDirty || form.status === IntakeFormStatus.ARCHIVED}
                    loading={isSaving}
                    icon={<Save size={14} />}
                    text="Save"
                    sx={{
                      "height": 34,
                      "fontSize": "13px",
                      "borderColor": theme.palette.border.dark,
                      "color": theme.palette.text.secondary,
                      "&:hover": {
                        borderColor: theme.palette.text.accent,
                        backgroundColor: theme.palette.background.accent,
                      },
                    }}
                  />
                  {form.status !== IntakeFormStatus.ACTIVE &&
                    form.status !== IntakeFormStatus.ARCHIVED && (
                      <CustomizableButton
                        variant="contained"
                        onClick={handlePublish}
                        isDisabled={isSaving}
                        icon={<Send size={14} />}
                        text="Publish"
                        sx={{
                          "height": 34,
                          "fontSize": "13px",
                          "backgroundColor": theme.palette.primary.main,
                          "&:hover": { backgroundColor: "brand.primaryHover" },
                        }}
                      />
                    )}
                </Box>
              </Box>

              {/* Builder content */}
              <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
                <FieldPalette
                  disabled={form.status === IntakeFormStatus.ARCHIVED}
                  fieldCount={form.schema.fields.length}
                  onAddField={addField}
                />
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <FormCanvas
                    ref={canvasRef}
                    fields={form.schema.fields}
                    selectedFieldId={selectedFieldId}
                    onSelectField={setSelectedFieldId}
                    onDeleteField={requestDeleteField}
                    onDuplicateField={duplicateField}
                    onMoveUp={moveFieldUp}
                    onMoveDown={moveFieldDown}
                    formName={form.name}
                    formDescription={form.description}
                    onNameChange={(name) => updateForm({ name })}
                    onDescriptionChange={(description) => updateForm({ description })}
                    collectContactInfo
                    euAiActRiskStepEnabled={
                      form.entityType === IntakeEntityType.USE_CASE &&
                      (form.euAiActRiskStepEnabled ?? false)
                    }
                    errorFieldIds={logicErrorFieldIds}
                  />
                  {form.suggestedQuestionsEnabled && (
                    <SuggestedQuestionsPanel
                      ref={suggestedPanelRef}
                      fieldCount={form.schema.fields.length}
                      existingFieldLabels={form.schema.fields.map((f) => f.label)}
                      entityType={form.entityType}
                      llmKeyId={activeLlmKeyId}
                      onAdd={addField}
                    />
                  )}
                </Box>
                {builderMode === "design" ? (
                  <DesignPanel
                    settings={form.designSettings ?? DEFAULT_DESIGN_SETTINGS}
                    onChange={(designSettings) => {
                      updateForm({ designSettings });
                    }}
                  />
                ) : builderMode === "logic" ? (
                  <LogicOverviewPanel
                    fields={form.schema.fields}
                    logicErrors={logicErrors}
                    routing={form.routing ?? null}
                    reviewers={routingReviewers}
                    reviewersLoaded={routingReviewersLoaded}
                    onSelectField={(fieldId) => {
                      setSelectedFieldId(fieldId);
                      setBuilderMode("edit");
                    }}
                  />
                ) : selectedField ? (
                  <FieldEditor
                    field={selectedField}
                    allFields={form.schema.fields}
                    logicErrors={logicErrors.filter((error) => error.fieldId === selectedField.id)}
                    entityType={form.entityType}
                    usedEntityMappings={usedEntityMappingsFor(
                      form.schema.fields,
                      selectedField.id,
                      form.euAiActRiskStepEnabled,
                    )}
                    llmKeyId={activeLlmKeyId}
                    onChange={updateField}
                    onEdit={markEdited}
                    onClose={() => setSelectedFieldId(null)}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 325,
                      borderLeft: `1px solid ${theme.palette.border.dark}`,
                      backgroundColor: theme.palette.background.main,
                      overflowY: "auto",
                      flexShrink: 0,
                    }}
                  >
                    <Box
                      onClick={() => setFormSettingsOpen((prev) => !prev)}
                      sx={{
                        "display": "flex",
                        "alignItems": "center",
                        "justifyContent": "space-between",
                        "px": "8px",
                        "py": "8px",
                        "cursor": "pointer",
                        "borderBottom": `1px solid ${theme.palette.border.dark}`,
                        "userSelect": "none",
                        "&:hover": { backgroundColor: theme.palette.background.accent },
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <Settings size={15} color={theme.palette.text.tertiary} />
                        <Typography
                          sx={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: theme.palette.text.primary,
                          }}
                        >
                          Form settings
                        </Typography>
                      </Box>
                      {formSettingsOpen ? (
                        <ChevronDown size={15} color={theme.palette.text.tertiary} />
                      ) : (
                        <ChevronRight size={15} color={theme.palette.text.tertiary} />
                      )}
                    </Box>

                    <Collapse in={formSettingsOpen}>
                      <Box
                        sx={{
                          p: "8px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "20px",
                        }}
                      >
                        {/* Entity field mapping coverage */}
                        {(() => {
                          const { missingRequired, missingOptional, typeMismatches } =
                            mappingCoverage;
                          const allMapped =
                            missingRequired.length === 0 &&
                            missingOptional.length === 0 &&
                            typeMismatches.length === 0;
                          const entityLabel =
                            form.entityType === IntakeEntityType.USE_CASE ? "use case" : "model";
                          const handleAddField = (m: (typeof missingRequired)[0]) => {
                            const newField = createFieldFromMapping(m, form.schema.fields.length);
                            setForm((prev) => ({
                              ...prev,
                              schema: { ...prev.schema, fields: [...prev.schema.fields, newField] },
                            }));
                            markEdited();
                          };

                          return (
                            <Box>
                              <Typography
                                sx={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: theme.palette.text.secondary,
                                  mb: allMapped ? 0 : "4px",
                                }}
                              >
                                {allMapped
                                  ? `All ${entityLabel} fields mapped`
                                  : "Optional but not mapped fields"}
                              </Typography>
                              {missingRequired.length > 0 && (
                                <Box sx={{ mb: "6px" }}>
                                  <Typography
                                    sx={{
                                      fontSize: 11,
                                      color: "#DC2626",
                                      fontWeight: 500,
                                      mb: "2px",
                                    }}
                                  >
                                    Required (blocks publishing):
                                  </Typography>
                                  {missingRequired.map((m) => (
                                    <Stack
                                      key={m.field}
                                      direction="row"
                                      alignItems="center"
                                      justifyContent="space-between"
                                      sx={{ py: "2px" }}
                                    >
                                      <Typography
                                        sx={{ fontSize: 12, color: theme.palette.text.secondary }}
                                      >
                                        {m.label}
                                        <Typography
                                          component="span"
                                          sx={{
                                            fontSize: 11,
                                            color: theme.palette.text.accent,
                                            ml: "4px",
                                          }}
                                        >
                                          ({m.requiredFieldType.join(" or ")})
                                        </Typography>
                                      </Typography>
                                      <Typography
                                        component="span"
                                        onClick={() => handleAddField(m)}
                                        sx={{
                                          "fontSize": 11,
                                          "fontWeight": 500,
                                          "color": "brand.primary",
                                          "cursor": "pointer",
                                          "display": "flex",
                                          "alignItems": "center",
                                          "gap": "2px",
                                          "whiteSpace": "nowrap",
                                          "&:hover": { textDecoration: "underline" },
                                        }}
                                      >
                                        <Plus size={11} strokeWidth={2} />
                                        Add field
                                      </Typography>
                                    </Stack>
                                  ))}
                                </Box>
                              )}
                              {typeMismatches.length > 0 && (
                                <Box sx={{ mb: "6px" }}>
                                  <Typography
                                    sx={{
                                      fontSize: 11,
                                      color: "#DC2626",
                                      fontWeight: 500,
                                      mb: "2px",
                                    }}
                                  >
                                    Type mismatch (blocks publishing):
                                  </Typography>
                                  {typeMismatches.map((m) => (
                                    <Typography
                                      key={m.formField.id}
                                      sx={{
                                        fontSize: 12,
                                        color: theme.palette.text.secondary,
                                        py: "2px",
                                      }}
                                    >
                                      &quot;{m.formField.label}&quot; is {m.formField.type}, needs{" "}
                                      {m.entityMapping.requiredFieldType.join(" or ")}
                                    </Typography>
                                  ))}
                                </Box>
                              )}
                              {missingOptional.length > 0 && (
                                <Box>
                                  {missingOptional.map((m) => (
                                    <Stack
                                      key={m.field}
                                      direction="row"
                                      alignItems="center"
                                      justifyContent="space-between"
                                      sx={{ py: "2px" }}
                                    >
                                      <Typography
                                        sx={{ fontSize: 12, color: theme.palette.text.secondary }}
                                      >
                                        {m.label}
                                      </Typography>
                                      <Typography
                                        component="span"
                                        onClick={() => handleAddField(m)}
                                        sx={{
                                          "fontSize": 11,
                                          "fontWeight": 500,
                                          "color": "brand.primary",
                                          "cursor": "pointer",
                                          "display": "flex",
                                          "alignItems": "center",
                                          "gap": "2px",
                                          "whiteSpace": "nowrap",
                                          "&:hover": { textDecoration: "underline" },
                                        }}
                                      >
                                        <Plus size={11} strokeWidth={2} />
                                        Add field
                                      </Typography>
                                    </Stack>
                                  ))}
                                </Box>
                              )}
                            </Box>
                          );
                        })()}

                        <Box>
                          <CustomizableMultiSelect
                            label="Recipients"
                            value={form.recipients || []}
                            onChange={(e) => {
                              const val = e.target.value;
                              const ids = (Array.isArray(val) ? val : [val]).map(Number);
                              setForm((prev) => ({ ...prev, recipients: ids }));
                              markEdited();
                            }}
                            items={orgUsers.map((u) => ({
                              _id: u.id,
                              name: [u.name, u.surname].filter(Boolean).join(" "),
                              email: u.email,
                            }))}
                            placeholder="Select recipients"
                            sx={{
                              "fontSize": 13,
                              "minHeight": 34,
                              "backgroundColor": theme.palette.background.main,
                              "borderRadius": "4px",
                              "& .MuiOutlinedInput-input": {
                                paddingTop: "6px",
                                paddingBottom: "6px",
                              },
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: "11px",
                              color: theme.palette.text.accent,
                              mt: "4px",
                            }}
                          >
                            Submission responses will be emailed to selected recipients
                          </Typography>
                        </Box>

                        <RoutingSettingsSection
                          value={form.routing ?? null}
                          onChange={(routing) => updateForm({ routing })}
                          reviewers={routingReviewers}
                          reviewersLoaded={routingReviewersLoaded}
                        />

                        <Box>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: theme.palette.text.secondary,
                              mb: "4px",
                            }}
                          >
                            LLM key
                          </Typography>
                          <Select
                            id="llm-key"
                            label=""
                            value={activeLlmKeyId ? String(activeLlmKeyId) : ""}
                            onChange={(e) =>
                              updateForm({
                                llmKeyId: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            items={llmKeyItems}
                            sx={{
                              "& .MuiOutlinedInput-root": {
                                height: 34,
                                fontSize: 13,
                              },
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: "11px",
                              color: theme.palette.text.accent,
                              mt: "6px",
                              lineHeight: 1.4,
                            }}
                          >
                            {activeLlmKeyId
                              ? "Used to score submissions and suggest risks. You can also generate suggested questions and field guidance text with AI."
                              : "Used to score submissions and suggest risks. Without a key, reviewers see the rule-based classification only. Add a key in Settings > LLM keys."}
                          </Typography>
                        </Box>

                        {/* Shown whenever the panel can render, so it can always be turned off. */}
                        {(activeLlmKeyId || form.suggestedQuestionsEnabled) && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "4px",
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              updateForm({
                                suggestedQuestionsEnabled: !form.suggestedQuestionsEnabled,
                              })
                            }
                          >
                            <Checkbox
                              id="suggested-questions"
                              isChecked={form.suggestedQuestionsEnabled ?? false}
                              value="suggestedQuestionsEnabled"
                              onChange={() =>
                                updateForm({
                                  suggestedQuestionsEnabled: !form.suggestedQuestionsEnabled,
                                })
                              }
                              size="small"
                              label=""
                              sx={{ p: 0, mt: "1px", flexShrink: 0 }}
                            />
                            <Box>
                              <Typography
                                sx={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: theme.palette.text.secondary,
                                }}
                              >
                                Suggested questions
                              </Typography>
                              <Typography
                                sx={{ fontSize: "11px", color: theme.palette.text.accent }}
                              >
                                Show AI-suggested questions while building the form
                              </Typography>
                            </Box>
                          </Box>
                        )}

                        <EuAiActStepToggle
                          entityType={form.entityType}
                          enabled={form.euAiActRiskStepEnabled ?? false}
                          hasRiskMapping={form.schema.fields.some((f) =>
                            isRiskStepSetField(f.entityFieldMapping),
                          )}
                          onToggle={(enabled) =>
                            updateForm({
                              euAiActRiskStepEnabled: enabled,
                              ...(enabled
                                ? {
                                    schema: {
                                      ...form.schema,
                                      fields: form.schema.fields.map((f) =>
                                        isRiskStepSetField(f.entityFieldMapping)
                                          ? { ...f, entityFieldMapping: undefined }
                                          : f,
                                      ),
                                    },
                                  }
                                : {}),
                            })
                          }
                        />

                        <LiveChecksToggle
                          enabled={form.liveChecksEnabled ?? true}
                          onToggle={(enabled) => updateForm({ liveChecksEnabled: enabled })}
                        />
                      </Box>
                    </Collapse>
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Delete field modal */}
      <StandardModal
        title="Delete field"
        description={`Are you sure you want to delete "${fieldToDeleteLabel}"? This action cannot be undone.`}
        isOpen={deleteFieldModalOpen}
        onClose={() => {
          setDeleteFieldModalOpen(false);
          setFieldToDelete(null);
        }}
        onSubmit={confirmDeleteField}
        submitButtonText="Delete"
        submitButtonColor="#c62828"
        maxWidth="440px"
        fitContent
      />

      {/* Publish warning modal (optional fields unmapped) */}
      <StandardModal
        title="Publish with unmapped fields?"
        description=""
        isOpen={publishWarningOpen}
        onClose={() => setPublishWarningOpen(false)}
        onSubmit={async () => {
          setPublishWarningOpen(false);
          await doPublish();
        }}
        submitButtonText="Publish anyway"
        maxWidth="480px"
        fitContent
      >
        <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary, mb: "12px" }}>
          The following optional fields are not mapped to any form field. These fields will be empty
          when the entity is created.
        </Typography>
        <Box component="ul" sx={{ pl: "20px", m: 0 }}>
          {mappingCoverage.missingOptional.map((m) => (
            <Typography
              key={m.field}
              component="li"
              sx={{ fontSize: 13, color: theme.palette.text.secondary, mb: "4px" }}
            >
              {m.label}
            </Typography>
          ))}
        </Box>
      </StandardModal>

      {/* Required fields not mapped modal */}
      <StandardModal
        title="Required fields not mapped"
        description=""
        isOpen={requiredFieldsModalOpen}
        onClose={() => setRequiredFieldsModalOpen(false)}
        onSubmit={() => setRequiredFieldsModalOpen(false)}
        submitButtonText="OK"
        maxWidth="480px"
        fitContent
      >
        <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary, mb: "12px" }}>
          The following required fields are not mapped to any form field. Add form fields mapped to
          these before publishing.
        </Typography>
        <Box component="ul" sx={{ pl: "20px", m: 0 }}>
          {mappingCoverage.missingRequired.map((m) => (
            <Typography
              key={m.field}
              component="li"
              sx={{ fontSize: 13, color: theme.palette.text.secondary, mb: "4px" }}
            >
              {m.label}
            </Typography>
          ))}
        </Box>
      </StandardModal>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

export default IntakeFormBuilder;
