/**
 * A modal component that displays a form for inviting a user.
 *
 * @component
 * @param {InviteUserModalProps} props - The properties for the InviteUserModal component.
 * @param {boolean} props.isOpen - A boolean indicating whether the modal is open.
 * @param {function} props.setIsOpen - A function to set the modal's open state.
 * @param {function} props.onSendInvite - A function to handle sending the invite.
 *
 * @returns {JSX.Element} The rendered modal component.
 *
 * @example
 * <InviteUserModal isOpen={isOpen} setIsOpen={setIsOpen} onSendInvite={handleSendInvite} />
 */

import { Stack, SelectChangeEvent, Typography } from "@mui/material";
import React, { useState, useMemo, useEffect } from "react";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import { sendInviteEmail } from "../../../../application/repository/mail.repository";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import { useRoles } from "../../../../application/hooks/useRoles";
import { isValidEmail } from "../../../../application/validations/emailAddress.rule";
import { useAuth } from "../../../../application/hooks/useAuth";
import StandardModal from "../StandardModal";

interface InviteUserModalProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSendInvite: (email: string, status: number | string, link?: string) => void;
}

interface FormValues {
  name: string;
  surname: string;
  email: string;
  roleId: string;
}

interface FormErrors {
  name?: string;
  surname?: string;
  email?: string;
  roleId?: string;
}

const initialState: FormValues = {
  name: "",
  surname: "",
  email: "",
  roleId: "1",
};

const InviteUserModal: React.FC<InviteUserModalProps> = ({ isOpen, setIsOpen, onSendInvite }) => {
  const { roles } = useRoles();
  const { organizationId } = useAuth();

  const roleItems = useMemo(
    () =>
      roles.map((role) => ({
        _id: role.id.toString(),
        name: role.name,
      })),
    [roles],
  );

  const [values, setValues] = useState<FormValues>(initialState);
  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form and set initial role when modal opens
  useEffect(() => {
    if (isOpen && roles.length > 0) {
      setValues({
        ...initialState,
        roleId: roles[0].id.toString(),
      });
      setErrors({});
    }
  }, [isOpen, roles]);

  const handleFormFieldChange =
    (prop: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues({ ...values, [prop]: event.target.value });
      setErrors({ ...errors, [prop]: "" });
    };

  const handleOnSelectChange =
    (prop: keyof FormValues) => (event: SelectChangeEvent<string | number>) => {
      setValues({ ...values, [prop]: event.target.value });
      setErrors({ ...errors, [prop]: "" });
    };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const name = checkStringValidation("Name", values.name, 1, 64);
    if (!name.accepted) {
      newErrors.name = name.message;
    }

    if (!isValidEmail(values.email)) {
      newErrors.email = "Invalid email address";
    }

    const roleId = checkStringValidation("Role", values.roleId, 1, 64);
    if (!roleId.accepted) {
      newErrors.roleId = roleId.message;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendInvitation = async () => {
    if (validateForm()) {
      const formData = {
        to: values.email,
        email: values.email,
        name: values.name,
        surname: values.surname,
        roleId: values.roleId,
        organizationId,
      };

      try {
        const response = await sendInviteEmail({
          to: formData.to,
          email: formData.email,
          name: formData.name,
          surname: formData.surname,
          roleId: formData.roleId,
          organizationId: String(formData.organizationId || ""),
        });
        const data = response.data as {
          message: string;
          error?: string;
        };
        if (response.status === 206) {
          onSendInvite(values.email, response.status, data.message);
        } else {
          onSendInvite(values.email, response.status);
        }
      } catch (_error) {
        onSendInvite(values.email, -1);
      } finally {
        setIsOpen(false);
      }
    }
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Invite new team member"
      description="Add a new member to give them access to the VerifyWise dashboard"
      submitButtonText="Send Invite"
      onSubmit={handleSendInvitation}
    >
      <Stack gap="16px">
        <Stack gap="8px">
          <Typography variant="body2" sx={{ fontWeight: 500, color: "rgba(0, 0, 0, 0.87)" }}>
            Name *
          </Typography>
          <Field
            placeholder="Enter name"
            type="name"
            value={values.name}
            onChange={handleFormFieldChange("name")}
            isRequired
            error={errors.name}
          />
        </Stack>
        <Stack gap="8px">
          <Typography variant="body2" sx={{ fontWeight: 500, color: "rgba(0, 0, 0, 0.87)" }}>
            Surname *
          </Typography>
          <Field
            placeholder="Enter surname"
            type="surname"
            value={values.surname}
            onChange={handleFormFieldChange("surname")}
            isRequired
            error={errors.surname}
          />
        </Stack>
        <Stack gap="8px">
          <Typography variant="body2" sx={{ fontWeight: 500, color: "rgba(0, 0, 0, 0.87)" }}>
            Email *
          </Typography>
          <Field
            placeholder="Enter email address"
            type="email"
            value={values.email}
            onChange={handleFormFieldChange("email")}
            isRequired
            error={errors.email}
          />
        </Stack>
        <Stack gap="8px">
          <Typography variant="body2" sx={{ fontWeight: 500, color: "rgba(0, 0, 0, 0.87)" }}>
            Role *
          </Typography>
          <Select
            id="role-select"
            value={values.roleId}
            onChange={handleOnSelectChange("roleId")}
            items={roleItems}
            error={errors.roleId}
            isRequired
          />
        </Stack>
      </Stack>
    </StandardModal>
  );
};

export default InviteUserModal;
