import { Dispatch, RefObject, SetStateAction } from "react";
import { Box, Stack } from "@mui/material";
import PolicyForm from "../../../components/Policies/PolicyForm";
import CustomFieldsSection, {
  type CustomFieldsSectionHandle,
} from "../../../components/CustomFieldsSection";
import { PolicyFormData, PolicyFormErrors } from "../../../types/interfaces/i.policy";

export interface PolicyMetadataSidebarProps {
  formRef: RefObject<HTMLDivElement | null>;
  formData: PolicyFormData;
  setFormData: Dispatch<SetStateAction<PolicyFormData>>;
  tags: string[];
  errors: PolicyFormErrors;
  clearFieldError: (field: keyof PolicyFormData) => void;
  customFieldsRef: RefObject<CustomFieldsSectionHandle | null>;
  entityId: number | null;
  onPendingChange: (pendingDefinitionIds: ReadonlySet<number>) => void;
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
}: PolicyMetadataSidebarProps) {
  return (
    <>
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
        />
      </Box>

      <Stack>
        {/* Custom fields — staging in create mode, write-through in edit */}
        <CustomFieldsSection
          ref={customFieldsRef}
          entityType="policy"
          entityId={entityId}
          onPendingChange={onPendingChange}
        />
      </Stack>
    </>
  );
}
