import { Dispatch, RefObject, SetStateAction, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Editor } from "@tiptap/react";
import { useCreatePolicy, useUpdatePolicy } from "../../../../application/hooks/usePolicyMutations";
import { PolicyManagerModel } from "../../../../domain/models/Common/policy/policyManager.model";
import { PolicyFormData, PolicyFormErrors } from "../../../types/interfaces/i.policy";
import { type CustomFieldsSectionHandle } from "../../../components/CustomFieldsSection";

export interface UsePolicySaveParams {
  isNew: boolean;
  policy: PolicyManagerModel | null;
  setPolicy: Dispatch<SetStateAction<PolicyManagerModel | null>>;
  formData: PolicyFormData;
  editor: Editor | null;
  formRef: RefObject<HTMLDivElement | null>;
  customFieldsRef: RefObject<CustomFieldsSectionHandle | null>;
  customFieldsBlocked: boolean;
  validateAll: (values: PolicyFormData) => boolean;
  resetErrors: () => void;
  setEditedTitle: Dispatch<SetStateAction<string>>;
  setIsEditingTitle: Dispatch<SetStateAction<boolean>>;
}

/**
 * Owns the save flow: validation gate, payload build, create/update mutation,
 * custom-fields flush, post-create navigation, and the save-related UI state
 * (isSaving, saveSuccess, serverErrors, validationSnackbar).
 *
 * On success the server-persisted entity (including `status`,
 * `last_updated_at`, and the server-sanitized `content_html`) is written back
 * into local `policy` state so the UI reflects what was actually persisted,
 * without a refetch.
 */
export function usePolicySave({
  isNew,
  policy,
  setPolicy,
  formData,
  editor,
  formRef,
  customFieldsRef,
  customFieldsBlocked,
  validateAll,
  resetErrors,
  setEditedTitle,
  setIsEditingTitle,
}: UsePolicySaveParams) {
  const navigate = useNavigate();
  const createPolicyMutation = useCreatePolicy();
  const updatePolicyMutation = useUpdatePolicy();

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [serverErrors, setServerErrors] = useState<PolicyFormErrors>({});
  const [validationSnackbar, setValidationSnackbar] = useState(false);

  const save = async () => {
    if (customFieldsBlocked) return;
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

      // Reflect the server-persisted entity (status, last_updated_at, and the
      // server-sanitized content_html) in local state without a refetch.
      setPolicy(savedPolicy);

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

  return {
    save,
    isSaving,
    saveSuccess,
    setSaveSuccess,
    serverErrors,
    setServerErrors,
    validationSnackbar,
    setValidationSnackbar,
  };
}
