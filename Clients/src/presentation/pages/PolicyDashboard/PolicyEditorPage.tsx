import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { sanitizeRichText } from "../../../application/utils/richTextSanitizer";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TipTapUnderline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TipTapLink from "@tiptap/extension-link";
import {
  Table as TipTapTable,
  TableRow as TipTapTableRow,
  TableCell as TipTapTableCell,
  TableHeader as TipTapTableHeader,
} from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import TypographyExtension from "@tiptap/extension-typography";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import {
  Box,
  Stack,
  Typography,
  useTheme,
  Skeleton,
  Snackbar,
  Alert,
  GlobalStyles,
} from "@mui/material";

import { CustomizableButton } from "../../components/button/customizable-button";
import { HistorySidebar } from "../../components/Common/HistorySidebar";
import { type CustomFieldsSectionHandle } from "../../components/CustomFieldsSection";
import { useRequiredCustomFieldsGate } from "../../components/CustomFieldsSection/RequiredCustomFieldsGate";
import { usePolicyChangeHistory } from "../../../application/hooks/usePolicyChangeHistory";
import InsertLinkModal from "../../components/Modals/InsertLinkModal/InsertLinkModal";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { uploadFileToManager } from "../../../application/repository/file.repository";
import {
  getPolicyById,
  getAllTags,
  importDocxToHtml,
} from "../../../application/repository/policy.repository";
import { useCreatePolicy, useUpdatePolicy } from "../../../application/hooks/usePolicyMutations";
import useUsers from "../../../application/hooks/useUsers";
import { User } from "../../../domain/types/User";
import { PolicyFormData, PolicyFormErrors, PolicyInput } from "../../types/interfaces/i.policy";
import { PolicyManagerModel } from "../../../domain/models/Common/policy/policyManager.model";
import { checkStringValidation } from "../../../application/validations/stringValidation";
import { useFormValidation } from "../../../application/hooks/useFormValidation";
import { store } from "../../../application/redux/store";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";
import { AuthImageExtension } from "./PolicyEditor/AuthImage";
import { normalizeSlateHtml } from "./PolicyEditor/normalizeSlateHtml";
import { createSearchHighlightExtension } from "./PolicyEditor/searchHighlightExtension";
import { policyEditorStyles } from "./PolicyEditor/editorStyles";
import { usePolicyFindReplace } from "./PolicyEditor/usePolicyFindReplace";
import { FindReplacePopover } from "./PolicyEditor/FindReplacePopover";
import { PolicyTableBubbleMenu } from "./PolicyEditor/PolicyTableBubbleMenu";
import { PolicyToolbar } from "./PolicyEditor/PolicyToolbar";
import { PolicyHeader } from "./PolicyEditor/PolicyHeader";
import { PolicyMetadataSidebar } from "./PolicyEditor/PolicyMetadataSidebar";

// ── Component ─────────────────────────────────────────────────────────
export default function PolicyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const { users } = useUsers();
  const createPolicyMutation = useCreatePolicy();
  const updatePolicyMutation = useUpdatePolicy();

  const isNew = !id;
  const templateId = searchParams.get("templateId");

  // Policy templates (loaded dynamically)
  const [policyTemplates, setPolicyTemplates] = useState<
    { id: number; title: string; tags: string[]; content: string }[]
  >([]);

  useEffect(() => {
    if (!templateId) return;
    fetch("/data/PolicyTemplates.json")
      .then((res) => res.json())
      .then(setPolicyTemplates)
      .catch(() => {});
  }, [templateId]);

  // Data loading state
  const [policy, setPolicy] = useState<PolicyManagerModel | null>(null);
  const customFieldsRef = useRef<CustomFieldsSectionHandle | null>(null);
  const customFieldsGate = useRequiredCustomFieldsGate("policy", policy?.id ?? null);
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editor state
  const [openLink, setOpenLink] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState("");
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingDOCX, setIsExportingDOCX] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [serverErrors, setServerErrors] = useState<PolicyFormErrors>({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isLoadingContentRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [validationSnackbar, setValidationSnackbar] = useState(false);

  const validators = useMemo(
    () => ({
      title: (v: unknown) => {
        const r = checkStringValidation("Policy title", v as string, 1, 128);
        return r.accepted ? "" : r.message;
      },
      status: (v: unknown) => (!v ? "Status is required." : ""),
      tags: (v: unknown) => {
        const t = v as string[];
        return t.filter((tag) => tag.trim() !== "").length === 0
          ? "At least one tag is required."
          : "";
      },
      nextReviewDate: (v: unknown) => {
        const r = checkStringValidation("Next review date", (v as string) || "", 1);
        return r.accepted ? "" : r.message;
      },
      assignedReviewers: () => "",
    }),
    [],
  );

  const {
    errors: validationErrors,
    validateAll,
    resetErrors,
    clearFieldError,
  } = useFormValidation<PolicyFormData>(validators);

  const displayErrors = useMemo(
    () => ({ ...validationErrors, ...serverErrors }),
    [validationErrors, serverErrors],
  );

  const [formData, setFormData] = useState<PolicyFormData>({
    title: "",
    status: "Under Review",
    tags: [],
    nextReviewDate: "",
    policyOwner: null,
    assignedReviewers: [],
    content: "",
  });

  const handleStartEditTitle = useCallback(() => {
    setEditedTitle(formData.title);
    setIsEditingTitle(true);
  }, [formData.title]);

  const handleSaveTitle = useCallback(async () => {
    const trimmed = editedTitle.trim();
    if (!trimmed) return;

    // Reuse the same title validator for consistency with the main save flow.
    const titleError = validators.title(trimmed);
    if (titleError) {
      setServerErrors((prev) => ({ ...prev, title: titleError }));
      return;
    }

    // New policy: no row to update yet — commit to local form state only.
    if (!policy?.id) {
      setFormData((prev) => ({ ...prev, title: trimmed }));
      clearFieldError("title");
      setServerErrors((prev) => ({ ...prev, title: undefined }));
      setIsEditingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      const updated = await updatePolicyMutation.mutateAsync({
        id: policy.id,
        input: { title: trimmed } as PolicyInput,
      });
      setFormData((prev) => ({ ...prev, title: trimmed }));
      setPolicy((prev) => (prev ? { ...prev, ...updated, title: trimmed } : updated));
      clearFieldError("title");
      setServerErrors((prev) => ({ ...prev, title: undefined }));
      setIsEditingTitle(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      const errorData = err?.originalError?.response || err?.response?.data || err?.response;
      const fieldErr = errorData?.errors?.find((e: any) => e.field === "title")?.message;
      setTitleSaveError(fieldErr || "Failed to save title");
      if (fieldErr) {
        setServerErrors((prev) => ({ ...prev, title: fieldErr }));
      }
    } finally {
      setIsSavingTitle(false);
    }
  }, [editedTitle, validators, policy?.id, clearFieldError]);

  const handleCancelEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    setEditedTitle("");
  }, []);

  // Resolve template from query param (memoized to avoid new object each render)
  const template = useMemo(() => {
    if (!templateId) return undefined;
    const t = policyTemplates.find((p) => p.id === Number(templateId));
    return t ? { title: t.title, tags: t.tags, content: t.content } : undefined;
  }, [templateId, policyTemplates]);

  // Prefetch change history for existing policies
  usePolicyChangeHistory(!isNew && policy?.id ? policy.id : undefined);

  // ── Load data ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);

      try {
        // Always fetch tags
        const fetchedTags = await getAllTags();
        if (cancelled) return;
        setTags(fetchedTags);

        // Fetch policy for edit mode
        if (id) {
          const fetchedPolicy = await getPolicyById(id);
          if (cancelled) return;
          setPolicy(fetchedPolicy);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(id ? "Failed to load policy. It may not exist." : "Failed to load tags.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Populate form from policy/template ────────────────────────────
  useEffect(() => {
    if (policy) {
      setFormData({
        title: policy.title || "",
        status: policy.status || "Draft",
        tags: policy.tags || [],
        nextReviewDate: policy.next_review_date
          ? new Date(policy.next_review_date).toISOString().slice(0, 10)
          : "",
        policyOwner:
          policy.policy_owner_id != null
            ? (users.find((u) => u.id === policy.policy_owner_id) ?? null)
            : null,
        assignedReviewers: policy.assigned_reviewer_ids
          ? policy.assigned_reviewer_ids
              .map((i) => users.find((u) => u.id === i))
              .filter((u): u is User => u !== undefined)
          : [],
        content: policy.content_html || "",
      });
    } else if (template) {
      setFormData((prev) => ({
        ...prev,
        title: template.title,
        tags: template.tags,
        content: template.content,
      }));
    }
  }, [policy, template, users]);

  // ── Compute initial editor content ──────────────────────────────
  const initialContent = (() => {
    const raw = policy?.content_html || template?.content || "";
    if (!raw) return "";
    return sanitizeRichText(normalizeSlateHtml(raw));
  })();

  // ── TipTap editor ─────────────────────────────────────────────────
  // Pass `deps` array so the editor re-creates when content changes
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        TipTapUnderline,
        Highlight,
        TextAlign.configure({ types: ["heading", "paragraph", "blockquote"] }),
        TipTapLink.configure({
          openOnClick: false,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        }),
        AuthImageExtension.configure({ inline: false, allowBase64: true }),
        TipTapTable.configure({ resizable: true }),
        TipTapTableRow,
        TipTapTableCell,
        TipTapTableHeader,
        Placeholder.configure({ placeholder: "Start typing your policy content..." }),
        TaskList,
        TaskItem.configure({ nested: true }),
        CharacterCount,
        Superscript,
        Subscript,
        TypographyExtension,
        TextStyle,
        Color,
        createSearchHighlightExtension(),
      ],
      content: initialContent,
      autofocus: false,
      onUpdate: ({ editor: e }) => {
        if (isLoadingContentRef.current) return;
        setFormData((prev) => ({ ...prev, content: e.getHTML() }));
      },
      editorProps: {
        handleDrop: (view, event, _slice, moved) => {
          if (moved || !event.dataTransfer?.files?.length) return false;
          const file = event.dataTransfer.files[0];
          if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return false;
          event.preventDefault();
          // Capture position before async upload
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const dropPos = coords?.pos ?? view.state.selection.anchor;
          (async () => {
            try {
              const response = await uploadFileToManager({
                file,
                model_id: null,
                source: "policy_editor",
                signal: undefined,
              });
              const fileId = response.data.id;
              const node = view.state.schema.nodes.image.create({
                src: `/api/file-manager/${fileId}`,
                alt: file.name,
              });
              const tr = view.state.tr.insert(Math.min(dropPos, view.state.doc.content.size), node);
              view.dispatch(tr);
            } catch {
              // ignore
            }
          })();
          return true;
        },
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of Array.from(items)) {
            if (!item.type.startsWith("image/")) continue;
            const file = item.getAsFile();
            if (!file || file.size > 10 * 1024 * 1024) continue;
            event.preventDefault();
            (async () => {
              try {
                const response = await uploadFileToManager({
                  file,
                  model_id: null,
                  source: "policy_editor",
                  signal: undefined,
                });
                const fileId = response.data.id;
                const node = view.state.schema.nodes.image.create({
                  src: `/api/file-manager/${fileId}`,
                  alt: file.name,
                });
                const tr = view.state.tr.replaceSelectionWith(node);
                view.dispatch(tr);
              } catch {
                // ignore
              }
            })();
            return true;
          }
          return false;
        },
      },
    },
    [initialContent],
  );

  // ── Image upload handler ──────────────────────────────────────────
  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;

    setIsUploadingImage(true);
    try {
      const response = await uploadFileToManager({
        file,
        model_id: null,
        source: "policy_editor",
        signal: undefined,
      });
      const fileId = response.data.id;
      editor
        ?.chain()
        .focus()
        .setImage({ src: `/api/file-manager/${fileId}`, alt: file.name })
        .run();
    } catch {
      // ignore
    } finally {
      setIsUploadingImage(false);
    }
  };

  const {
    searchAnchorEl,
    openFindReplace,
    closeFindReplace,
    searchText,
    setSearchText,
    replaceText,
    setReplaceText,
    searchMatchCount,
    handleSearchNext,
    handleSearchPrev,
    handleReplaceCurrent,
    handleReplaceAll,
  } = usePolicyFindReplace(editor);

  // ── Save ──────────────────────────────────────────────────────────
  const save = async () => {
    if (customFieldsGate.blocked) return;
    setServerErrors({});
    resetErrors();
    if (!validateAll(formData)) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setValidationSnackbar(true);
      if (!formData.title.trim()) {
        setEditedTitle(formData.title);
        setIsEditingTitle(true);
      }
      return;
    }
    setIsSaving(true);

    const html = editor?.getHTML() || "";
    const payload = {
      title: formData.title,
      status: formData.status,
      tags: formData.tags,
      content_html: html,
      next_review_date: formData.nextReviewDate ? new Date(formData.nextReviewDate) : undefined,
      policy_owner_id: formData.policyOwner?.id ?? null,
      assigned_reviewer_ids: formData.assignedReviewers
        .map((u) => u.id)
        .filter((id) => id !== formData.policyOwner?.id),
    };

    try {
      let savedPolicy: PolicyManagerModel;

      if (isNew) {
        savedPolicy = await createPolicyMutation.mutateAsync(payload);
      } else {
        savedPolicy = await updatePolicyMutation.mutateAsync({
          id: policy!.id,
          input: payload,
        });
      }

      // Flush any locally-staged custom field changes (create OR update).
      let cfFlushFailed = false;
      if (savedPolicy?.id && customFieldsRef.current?.hasPendingValues()) {
        try {
          await customFieldsRef.current.flush(savedPolicy.id);
        } catch (cfError) {
          cfFlushFailed = true;
          console.error("Policy saved, but custom field values failed to save:", cfError);
        }
      }

      setIsSaving(false);

      // For new policies, navigate to the edit URL so subsequent saves work as updates.
      // Skip the success banner when flush failed so the inline warning is the
      // dominant signal.
      if (isNew && savedPolicy?.id) {
        navigate(`/policies/${savedPolicy.id}/edit`, { replace: true });
      }
      if (cfFlushFailed) return;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setIsSaving(false);

      const errorData = err?.originalError?.response || err?.response?.data || err?.response;

      if (errorData?.errors) {
        const apiErrors: PolicyFormErrors = {};
        errorData.errors.forEach((error: any) => {
          if (error.field === "title") apiErrors.title = error.message;
          else if (error.field === "status") apiErrors.status = error.message;
          else if (error.field === "tags") apiErrors.tags = error.message;
          else if (error.field === "content_html") apiErrors.content = error.message;
          else if (error.field === "next_review_date") apiErrors.nextReviewDate = error.message;
          else if (error.field === "assigned_reviewer_ids")
            apiErrors.assignedReviewers = error.message;
          else if (error.field === "policy_owner_id") apiErrors.policyOwner = error.message;
        });
        setServerErrors(apiErrors);
      }
    }
  };

  // ── Export ─────────────────────────────────────────────────────────
  const downloadExport = async (format: "pdf" | "docx") => {
    if (!policy?.id) return;

    const setExporting = format === "pdf" ? setIsExportingPDF : setIsExportingDOCX;
    setExporting(true);
    setExportError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const token = store.getState().auth.authToken;
      const response = await fetch(`/api/policies/${policy.id}/export/${format}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Export failed (${response.status})`);

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `${formData.title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.${format}`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      const finalBlob =
        format === "docx"
          ? new Blob([blob], {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            })
          : blob;

      const url = window.URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      clearTimeout(timeout);
      setExportError(
        error.name === "AbortError"
          ? `${format.toUpperCase()} export timed out. Please try again.`
          : `Failed to export ${format.toUpperCase()}. Please try again.`,
      );
    } finally {
      setExporting(false);
    }
  };

  // ── DOCX import ──────────────────────────────────────────────────
  const MAX_DOCX_SIZE = 10 * 1024 * 1024; // 10 MB (matches backend multer limit)

  const handleDocxFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-selected

    if (file.size > MAX_DOCX_SIZE) {
      setImportError("File is too large. Maximum size is 10 MB.");
      return;
    }

    // If editor has content, show confirmation dialog
    if (editor && !editor.isEmpty) {
      setPendingImportFile(file);
    } else {
      processDocxImport(file);
    }
  };

  const processDocxImport = async (file: File) => {
    setIsImporting(true);
    setImportError(null);
    try {
      const { html } = await importDocxToHtml(file);
      const sanitized = sanitizeRichText(html);
      if (editor) {
        editor.commands.setContent(sanitized);
      }
    } catch {
      setImportError("Failed to import DOCX file. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const confirmImport = async () => {
    if (pendingImportFile) {
      await processDocxImport(pendingImportFile);
    }
    setPendingImportFile(null);
  };

  const cancelImport = () => {
    setPendingImportFile(null);
  };

  // ── Loading / error states ────────────────────────────────────────
  if (isLoading) {
    return (
      <Stack gap={2} sx={{ p: 0 }}>
        <Skeleton variant="rectangular" height={32} width={300} />
        <Skeleton variant="rectangular" height={80} />
        <Skeleton variant="rectangular" height={40} />
        <Skeleton variant="rectangular" height={400} />
      </Stack>
    );
  }

  if (loadError) {
    return (
      <Stack gap={2} sx={{ p: 0 }}>
        <PageBreadcrumbs />
        <Box
          sx={{
            p: 4,
            textAlign: "center",
            border: "1px solid",
            borderColor: "border.dark",
            borderRadius: "4px",
          }}
        >
          <Typography sx={{ color: "text.secondary", mb: 2 }}>{loadError}</Typography>
          <CustomizableButton
            variant="outlined"
            text="Back to policies"
            onClick={() => navigate("/policies")}
          />
        </Box>
      </Stack>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  const pageTitle = isNew
    ? template
      ? "New policy from template"
      : "New policy"
    : formData.title || "Edit policy";

  return (
    <>
      <InsertLinkModal
        open={openLink}
        onClose={() => {
          setOpenLink(false);
          setSelectedTextForLink("");
        }}
        onInsert={(url, text) => {
          if (!editor) return;
          const { from, to } = editor.state.selection;
          if (from !== to && !text) {
            editor.chain().focus().setLink({ href: url, target: "_blank" }).run();
          } else {
            const linkText = text || url;
            editor
              .chain()
              .focus()
              .insertContent({
                type: "text",
                text: linkText,
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: url,
                      target: "_blank",
                      rel: "noopener noreferrer",
                    },
                  },
                ],
              })
              .run();
          }
        }}
        selectedText={selectedTextForLink}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageFileChange}
      />

      <Stack className="vwhome" gap="16px">
        {/* ── Breadcrumbs ──────────────────────────────────────────── */}
        <PageBreadcrumbs />

        <Stack
          sx={{
            height: "calc(100vh - 100px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <PolicyHeader
            pageTitle={pageTitle}
            isEditingTitle={isEditingTitle}
            editedTitle={editedTitle}
            isSavingTitle={isSavingTitle}
            titleError={displayErrors.title}
            onBack={() => navigate("/policies")}
            onStartEditTitle={handleStartEditTitle}
            onEditedTitleChange={setEditedTitle}
            onSaveTitle={handleSaveTitle}
            onCancelEditTitle={handleCancelEditTitle}
            isNew={isNew}
            hasPolicyId={Boolean(policy?.id)}
            isHistorySidebarOpen={isHistorySidebarOpen}
            onToggleHistorySidebar={() => setIsHistorySidebarOpen((prev) => !prev)}
            isExportingPDF={isExportingPDF}
            isExportingDOCX={isExportingDOCX}
            exportError={exportError}
            onDownloadExport={downloadExport}
            isImporting={isImporting}
            onDocxFileSelect={handleDocxFileSelect}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
            isSaveDisabled={isSaving || customFieldsGate.blocked}
            saveButtonText={
              isSaving
                ? "Saving..."
                : saveSuccess
                  ? "Saved"
                  : isNew && template
                    ? "Save in organizational policies"
                    : "Save"
            }
            onSave={save}
          />

          {/* ── Metadata form ────────────────────────────────────────── */}
          <PolicyMetadataSidebar
            formRef={formRef}
            formData={formData}
            setFormData={setFormData}
            tags={tags}
            errors={displayErrors}
            clearFieldError={clearFieldError}
            customFieldsRef={customFieldsRef}
            entityId={isNew ? null : (policy?.id ?? null)}
            onPendingChange={customFieldsGate.onPendingChange}
          />

          <PolicyToolbar
            editor={editor}
            isUploadingImage={isUploadingImage}
            onInsertImage={() => imageInputRef.current?.click()}
            onOpenLink={(selectedText) => {
              setSelectedTextForLink(selectedText);
              setOpenLink(true);
            }}
            onOpenFindReplace={openFindReplace}
          />

          <FindReplacePopover
            anchorEl={searchAnchorEl}
            onClose={closeFindReplace}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            replaceText={replaceText}
            onReplaceTextChange={setReplaceText}
            searchMatchCount={searchMatchCount}
            onSearchNext={handleSearchNext}
            onSearchPrev={handleSearchPrev}
            onReplaceCurrent={handleReplaceCurrent}
            onReplaceAll={handleReplaceAll}
          />

          {/* ── Editor + History sidebar ────────────────────────────── */}
          <Stack direction="row" sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            {/* Editor */}
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: "auto",
                border: "1px solid",
                borderColor: "border.dark",
                borderRadius: "4px",
              }}
            >
              <EditorContent editor={editor} className="policy-tiptap-editor" />
              {editor && <PolicyTableBubbleMenu editor={editor} />}
              <GlobalStyles styles={policyEditorStyles} />
            </Box>

            {displayErrors.content && (
              <Typography
                component="span"
                color={theme.palette.status?.error?.text || theme.palette.error.main}
                sx={{ opacity: 0.8, fontSize: 11, mt: 1 }}
              >
                {displayErrors.content}
              </Typography>
            )}

            {/* History sidebar */}
            {!isNew && policy?.id && (
              <HistorySidebar
                isOpen={isHistorySidebarOpen}
                entityType="policy"
                entityId={policy.id}
                height="100%"
              />
            )}
          </Stack>
        </Stack>
      </Stack>

      {/* Validation error snackbar */}
      <Snackbar
        open={validationSnackbar}
        autoHideDuration={4000}
        onClose={() => setValidationSnackbar(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert onClose={() => setValidationSnackbar(false)} severity="error" sx={{ width: "100%" }}>
          Please fill in all required fields before saving.
        </Alert>
      </Snackbar>

      {/* Import error snackbar */}
      <Snackbar
        open={Boolean(importError)}
        autoHideDuration={4000}
        onClose={() => setImportError(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert onClose={() => setImportError(null)} severity="error" sx={{ width: "100%" }}>
          {importError}
        </Alert>
      </Snackbar>

      {/* Title save error snackbar */}
      <Snackbar
        open={Boolean(titleSaveError)}
        autoHideDuration={4000}
        onClose={() => setTitleSaveError(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert onClose={() => setTitleSaveError(null)} severity="error" sx={{ width: "100%" }}>
          {titleSaveError}
        </Alert>
      </Snackbar>

      {/* Import confirmation dialog */}
      <ConfirmationModal
        isOpen={pendingImportFile !== null}
        isLoading={isImporting}
        title="Replace existing content?"
        body={
          <Typography sx={{ fontSize: 13, color: "text.tertiary" }}>
            Importing this file will replace all current content in the editor. This action cannot
            be undone.
          </Typography>
        }
        cancelText="Cancel"
        proceedText="Replace content"
        proceedButtonVariant="contained"
        onCancel={cancelImport}
        onProceed={confirmImport}
        confirmBtnSx={{
          "backgroundColor": "brand.primary",
          "&:hover": { backgroundColor: "brand.primaryHover" },
        }}
      />
    </>
  );
}
