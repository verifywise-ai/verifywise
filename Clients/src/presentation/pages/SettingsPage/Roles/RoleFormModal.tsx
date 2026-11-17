import React, { useState } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import type { RoleInput } from "../../../../application/hooks/useRoleMutations";

/** roles.name and roles.description are VARCHAR(255). */
export const ROLE_FIELD_MAX_LENGTH = 255;

interface RoleFormModalProps {
  mode: "create" | "edit";
  /** The role being edited (edit mode). */
  initial?: RoleInput & { id: number };
  /** Every role name the organization can see (built-ins and custom). */
  existingRoles: { id: number; name: string; isBuiltIn: boolean }[];
  isSubmitting: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (values: RoleInput) => void;
}

interface FieldErrors {
  name?: string;
  description?: string;
}

/**
 * Create or edit a custom role's name and description. Validates what the
 * server would reject (blank fields, length, a name that is already taken or
 * reserved for a built-in role) before sending, so the user sees it on the
 * field instead of a generic failure.
 */
const RoleFormModal: React.FC<RoleFormModalProps> = ({
  mode,
  initial,
  existingRoles,
  isSubmitting,
  serverError,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  const validate = (trimmedName: string, trimmedDescription: string): FieldErrors => {
    const next: FieldErrors = {};
    if (!trimmedName) {
      next.name = "Enter a role name";
    } else if (trimmedName.length > ROLE_FIELD_MAX_LENGTH) {
      next.name = "Name must be 255 characters or fewer";
    } else {
      const clash = existingRoles.find(
        (role) => role.id !== initial?.id && role.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (clash) {
        next.name = clash.isBuiltIn
          ? "This name is reserved for a built-in role"
          : "A role with this name already exists";
      }
    }
    if (!trimmedDescription) {
      next.description = "Enter a description";
    } else if (trimmedDescription.length > ROLE_FIELD_MAX_LENGTH) {
      next.description = "Description must be 255 characters or fewer";
    }
    return next;
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const nextErrors = validate(trimmedName, trimmedDescription);
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.description) return;

    if (
      mode === "edit" &&
      initial &&
      trimmedName === initial.name &&
      trimmedDescription === initial.description
    ) {
      onClose();
      return;
    }
    onSubmit({ name: trimmedName, description: trimmedDescription });
  };

  return (
    <StandardModal
      isOpen
      title={mode === "create" ? "New role" : "Edit role"}
      description={
        mode === "create"
          ? "Name the role, then choose what it can do on this page."
          : "If you rename the role, people who have it must sign in again."
      }
      submitButtonText={mode === "create" ? "Create role" : "Save changes"}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit}
      maxWidth="480px"
    >
      <Stack sx={{ gap: "16px" }}>
        <Field
          id="role-name"
          label="Name"
          isRequired
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="e.g. Model validator"
          error={errors.name}
          disabled={isSubmitting}
          dataTestId="role-name-input"
        />
        <Field
          id="role-description"
          label="Description"
          isRequired
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
          }}
          placeholder="What this role is for"
          error={errors.description}
          disabled={isSubmitting}
          dataTestId="role-description-input"
        />
        {serverError && (
          <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }}>
            {serverError}
          </Typography>
        )}
      </Stack>
    </StandardModal>
  );
};

export default RoleFormModal;
