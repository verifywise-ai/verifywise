import { Stack, Typography } from "@mui/material";
import Field from "../Inputs/Field";

interface ExternalOwnerFieldsProps {
  name: string;
  email: string;
  nameError?: string;
  emailError?: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  width?: number | string;
}

/** Name and email of an external owner, shown when "External owner" is selected. */
const ExternalOwnerFields = ({
  name,
  email,
  nameError,
  emailError,
  onNameChange,
  onEmailChange,
  width = "100%",
}: ExternalOwnerFieldsProps) => (
  <Stack gap="8px" sx={{ width }}>
    <Field
      id="external-owner-name-input"
      label="Name"
      value={name}
      onChange={(event) => onNameChange(event.target.value)}
      error={nameError}
      isRequired
    />
    <Field
      id="external-owner-email-input"
      label="Email"
      type="email"
      value={email}
      onChange={(event) => onEmailChange(event.target.value)}
      error={emailError}
      isRequired
    />
    <Typography sx={{ fontSize: 13 }}>
      External owners receive email notices only. They have no login and no access to VerifyWise.
    </Typography>
  </Stack>
);

export default ExternalOwnerFields;
