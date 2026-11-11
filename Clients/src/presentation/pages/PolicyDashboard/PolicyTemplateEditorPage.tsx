/**
 * PolicyTemplateEditorPage — edit the body of an organization policy template
 * (#5261) with the same TipTap editor the policy editor uses.
 *
 * Only org-owned templates are editable; a system template opens read-only
 * with a hint to duplicate it first (the backend refuses writes to system
 * rows anyway). Name, description and category stay in the "Edit details"
 * modal on the templates tab; this page only saves `content`.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, Box, Skeleton, Snackbar, Stack, Typography } from "@mui/material";
import { Check, Loader2, Save as SaveIcon } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import {
  usePolicyTemplate,
  useUpdatePolicyTemplate,
} from "../../../application/hooks/usePolicyTemplates";
import { PolicyFormData } from "../../types/interfaces/i.policy";
import { usePolicyEditorContent } from "./PolicyEditor/usePolicyEditorContent";
import { usePolicyFindReplace } from "./PolicyEditor/usePolicyFindReplace";
import { PolicyContentEditor } from "./PolicyEditor/PolicyContentEditor";
import { PolicyEditorTitleArea } from "./PolicyEditor/PolicyEditorTitleArea";

const TEMPLATES_PATH = "/policies/templates";
const noop = () => {};

function parseTemplateId(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export default function PolicyTemplateEditorPage() {
  const { templateId: rawId } = useParams<{ templateId: string }>();
  const templateId = parseTemplateId(rawId);
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  // Same gate as the templates tab (PolicyTemplates.tsx canManageTemplates).
  const canManageTemplates =
    !!userRoleName &&
    (allowedRoles.policies.create.includes(userRoleName) || userRoleName === "Admin");

  const { data: template, isLoading, isError } = usePolicyTemplate(templateId);
  const updateMutation = useUpdatePolicyTemplate();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const readOnly = !canManageTemplates || !template || template.is_system_template;

  // usePolicyEditorContent mirrors the editor into a PolicyFormData; only
  // `content` matters here, and save reads the live editor HTML directly.
  const [, setFormData] = useState<PolicyFormData>({
    title: "",
    status: "Draft",
    tags: [],
    nextReviewDate: "",
    policyOwner: null,
    assignedReviewers: [],
    content: "",
  });

  const editorTemplate = useMemo(
    () =>
      template
        ? { title: template.name, tags: template.tags, content: template.content }
        : undefined,
    [template],
  );

  const {
    editor,
    imageInputRef,
    isUploadingImage,
    handleImageFileChange,
    openLink,
    selectedTextForLink,
    handleOpenLink,
    handleCloseLink,
    handleInsertLink,
  } = usePolicyEditorContent({ policy: null, template: editorTemplate, setFormData });
  const findReplace = usePolicyFindReplace(editor);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  const handleSave = async () => {
    if (!editor || !template || readOnly) return;
    setSaveError(null);
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        body: { content: editor.getHTML() },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Could not save the template. Please try again.",
      );
    }
  };

  if (templateId === undefined || isError || (!isLoading && !template)) {
    return (
      <Stack gap="16px">
        <Box
          sx={{
            p: "32px",
            textAlign: "center",
            border: "1px solid",
            borderColor: "border.dark",
            borderRadius: "4px",
          }}
        >
          <Typography sx={{ color: "text.secondary", mb: "16px" }}>
            Failed to load template. It may not exist.
          </Typography>
          <CustomizableButton
            variant="outlined"
            text="Back to policy templates"
            onClick={() => navigate(TEMPLATES_PATH)}
          />
        </Box>
      </Stack>
    );
  }

  if (isLoading || !template) {
    return (
      <Stack gap="16px">
        <Skeleton variant="rectangular" height={32} width={300} />
        <Skeleton variant="rectangular" height={400} />
      </Stack>
    );
  }

  const isSaving = updateMutation.isPending;

  return (
    <>
      <Stack
        className="vwhome"
        gap="16px"
        sx={{
          height: "100%",
          maxHeight: "calc(100vh - 100px)",
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ flexShrink: 0 }}
        >
          <PolicyEditorTitleArea
            pageTitle={template.name}
            isEditingTitle={false}
            editedTitle=""
            isSavingTitle={false}
            onBack={() => navigate(TEMPLATES_PATH)}
            onStartEditTitle={noop}
            onEditedTitleChange={noop}
            onSaveTitle={noop}
            onCancelEditTitle={noop}
            readOnly
          />
          {!readOnly && (
            <CustomizableButton
              variant="contained"
              text={isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save template"}
              isDisabled={isSaving || !editor}
              onClick={handleSave}
              icon={
                isSaving ? (
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : saveSuccess ? (
                  <Check size={16} />
                ) : (
                  <SaveIcon size={16} />
                )
              }
            />
          )}
        </Stack>

        {template.is_system_template && (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            System templates are read-only. Duplicate this template into your templates to change
            it.
          </Typography>
        )}

        <PolicyContentEditor
          editor={editor}
          imageInputRef={imageInputRef}
          isUploadingImage={isUploadingImage}
          onImageFileChange={handleImageFileChange}
          linkModalOpen={openLink}
          selectedTextForLink={selectedTextForLink}
          onOpenLink={handleOpenLink}
          onCloseLink={handleCloseLink}
          onInsertLink={handleInsertLink}
          findReplace={findReplace}
          readOnly={readOnly}
        />
      </Stack>

      <Snackbar
        open={Boolean(saveError)}
        autoHideDuration={4000}
        onClose={() => setSaveError(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert onClose={() => setSaveError(null)} severity="error" sx={{ width: "100%" }}>
          {saveError}
        </Alert>
      </Snackbar>
    </>
  );
}
