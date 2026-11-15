import { Dispatch, RefObject, SetStateAction } from "react";
import { Box, Stack } from "@mui/material";
import PolicyForm from "../../../components/Policies/PolicyForm";
import CustomFieldsSection, {
  type CustomFieldsSectionHandle,
} from "../../../components/CustomFieldsSection";
import { PolicyFormData, PolicyFormErrors } from "../../../types/interfaces/i.policy";
import ReadOnlyFieldset from "../../../components/ReadOnlyFieldset";
import { PolicyApprovalSection } from "./PolicyApprovalSection";

export interface PolicyMetadataSidebarProps {
  formRef: RefObject<HTMLDivElement | null>;
  formData: PolicyFormData;
  setFormData: Dispatch<SetStateAction<PolicyFormData>>;
  tags: string[];
  errors: PolicyFormErrors;
  clearFieldError: (field: keyof PolicyFormData) => void;
  customFieldsRef: RefObject<CustomFieldsSectionHandle | null>;
  entityId: number | null;
  onPendingChange: (
    pendingDefinitionIds: ReadonlySet<number>,
    clearedRequired?: ReadonlyArray<{ id: number; label: string }>,
  ) => void;
  /** Disables the metadata fields for roles that cannot edit policies. */
  readOnly?: boolean;
  /** The saved status; null for a new policy. Drives the status options. */
  savedStatus: string | null;
  /** The policy has a pending approval request, so its status is locked. */
  hasPendingApproval: boolean;
  /** The editor holds unsaved changes (approval actions wait for a save). */
  hasUnsavedChanges: boolean;
  /** Reloads the policy after an approval action. */
  onApprovalChanged?: () => void;
}

/** Metadata form and custom fields region of the policy editor. */
export function PolicyMetadataSidebar({
  formRef,
  formData,
  setFormData,
  tags,
  errors,
  clearFieldError,
  customFieldsRef,
  entityId,
  onPendingChange,
  readOnly = false,
  savedStatus,
  hasPendingApproval,
  hasUnsavedChanges,
  onApprovalChanged,
}: PolicyMetadataSidebarProps) {
  return (
    <>
      <ReadOnlyFieldset readOnly={readOnly}>
        <Box
          ref={formRef}
          sx={{
            flexShrink: 0,
            mb: "8px",
            overflow: "visible",
            position: "relative",
            zIndex: 1,
          }}
        >
          <PolicyForm
            formData={formData}
            setFormData={setFormData}
            tags={tags}
            errors={errors}
            clearFieldError={clearFieldError}
            currentStatus={savedStatus}
            statusLocked={hasPendingApproval}
          />
        </Box>
      </ReadOnlyFieldset>

      {/* Outside the read-only fieldset: the server decides who may act. */}
      <PolicyApprovalSection
        policyId={entityId}
        policyStatus={savedStatus}
        hasUnsavedChanges={hasUnsavedChanges}
        canEdit={!readOnly}
        onPolicyChanged={onApprovalChanged}
      />

      <ReadOnlyFieldset readOnly={readOnly}>
        <Stack>
          {/* Custom fields — staging in create mode, write-through in edit */}
          <CustomFieldsSection
            ref={customFieldsRef}
            entityType="policy"
            entityId={entityId}
            onPendingChange={onPendingChange}
          />
        </Stack>
      </ReadOnlyFieldset>
    </>
  );
}
