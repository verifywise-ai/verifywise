import { useEffect } from "react";
import {
  Stack,
  Typography,
  Button,
  Box,
  RadioGroup,
  FormControlLabel,
  Radio,
  SelectChangeEvent,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import { Check, X } from "lucide-react";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import { ROLE_OPTIONS } from "../../../../application/constants/roles";
import { generatePassword } from "../../../../application/tools/generatePassword";
import {
  useEmailAvailability,
  EmailAvailabilityStatus,
} from "../../../../application/hooks/useEmailAvailability";

const ROLE_SELECT_ITEMS = ROLE_OPTIONS.map((r) => ({ _id: r.value, name: r.label }));

export type UserFormMode = "invite" | "direct";

export interface UserFormValues {
  email: string;
  name: string;
  surname: string;
  roleId: number;
  password: string;
}

interface Props {
  mode: UserFormMode;
  onModeChange: (mode: UserFormMode) => void;
  values: UserFormValues;
  onChange: (patch: Partial<UserFormValues>) => void;
  emailAutoFocus?: boolean;
  onEmailStatusChange?: (status: EmailAvailabilityStatus) => void;
}

function EmailAdornment({ status }: { status: EmailAvailabilityStatus }) {
  if (status === "checking") return <CircularProgress size={14} thickness={5} />;
  if (status === "available") return <Check size={16} color="#16a34a" />;
  if (status === "taken") return <X size={16} color="#dc2626" />;
  return null;
}

function emailHelperText(status: EmailAvailabilityStatus): string | undefined {
  if (status === "invalid") return "Enter a valid email address.";
  if (status === "taken") return "A user with this email already exists.";
  if (status === "error") return "Could not verify email. Try again.";
  return undefined;
}

/**
 * Shared user fields (invite vs direct-create) used across SuperAdmin flows.
 * Owns the mode toggle so callers don't duplicate it. Backend password rules
 * live in Clients/src/application/validations/passwordValidation.ts.
 */
const UserFormFields = ({
  mode,
  onModeChange,
  values,
  onChange,
  emailAutoFocus,
  onEmailStatusChange,
}: Props) => {
  const { status: emailStatus } = useEmailAvailability(values.email);

  useEffect(() => {
    onEmailStatusChange?.(emailStatus);
  }, [emailStatus, onEmailStatusChange]);

  const emailError =
    emailStatus === "taken" || emailStatus === "invalid" || emailStatus === "error";
  const emailHelper = emailHelperText(emailStatus);

  return (
    <Stack spacing={2}>
      <RadioGroup row value={mode} onChange={(e) => onModeChange(e.target.value as UserFormMode)}>
        <FormControlLabel
          value="invite"
          control={<Radio size="small" />}
          label={<Typography sx={{ fontSize: 13 }}>Invite via email</Typography>}
        />
        <FormControlLabel
          value="direct"
          control={<Radio size="small" />}
          label={<Typography sx={{ fontSize: 13 }}>Create directly</Typography>}
        />
      </RadioGroup>
      <Field
        label="Email"
        isRequired
        placeholder="user@example.com"
        type="email"
        value={values.email}
        onChange={(e) => onChange({ email: e.target.value })}
        autoFocus={emailAutoFocus}
        error={emailError ? emailHelper : undefined}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <EmailAdornment status={emailStatus} />
            </InputAdornment>
          ),
        }}
        sx={{ width: "100%" }}
      />
      <Field
        label="First name"
        isRequired
        placeholder="First name"
        value={values.name}
        onChange={(e) => onChange({ name: e.target.value })}
        sx={{ width: "100%" }}
      />
      <Field
        label="Last name"
        isRequired={mode === "direct"}
        placeholder="Last name"
        value={values.surname}
        onChange={(e) => onChange({ surname: e.target.value })}
        sx={{ width: "100%" }}
      />
      <Select
        id="user-form-role"
        label="Role"
        value={values.roleId}
        items={ROLE_SELECT_ITEMS}
        onChange={(e: SelectChangeEvent<string | number>) =>
          onChange({ roleId: Number(e.target.value) })
        }
        getOptionValue={(item: { _id: string | number }) => item._id}
        sx={{ width: "100%" }}
      />
      {mode === "direct" && (
        <Stack spacing={0.5}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
            <Field
              label="Password"
              isRequired
              type="password"
              placeholder="Enter or generate"
              value={values.password}
              onChange={(e) => onChange({ password: e.target.value })}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              onClick={() => onChange({ password: generatePassword(16) })}
              sx={{
                textTransform: "none",
                height: 34,
                fontSize: "13px",
                borderRadius: "4px",
                borderColor: "#d0d5dd",
                color: "text.primary",
              }}
            >
              Generate
            </Button>
          </Box>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Must include an uppercase letter, a lowercase letter, and a digit. Minimum 8 characters.
          </Typography>
        </Stack>
      )}
    </Stack>
  );
};

export default UserFormFields;
