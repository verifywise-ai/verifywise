import type { SxProps, Theme } from "@mui/material";
import AutoCompleteField from "../Autocomplete";
import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";
import {
  HIGH_RISK_ROLE_ORDER,
  normalizeHighRiskRoles,
} from "../../../../application/utils/highRiskRoles";

interface HighRiskRolesFieldProps {
  id: string;
  value: HighRiskRole[];
  onChange: (roles: HighRiskRole[]) => void;
  onBlur?: () => void;
  /** Defaults to "High-risk roles"; pass "" when the page renders its own label. */
  label?: string;
  error?: string;
  isRequired?: boolean;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

/** EU AI Act roles of a use case: Provider, Deployer or both. */
export default function HighRiskRolesField({
  id,
  value,
  onChange,
  onBlur,
  label = "High-risk roles",
  error,
  isRequired,
  disabled,
  sx,
}: HighRiskRolesFieldProps) {
  return (
    <AutoCompleteField<HighRiskRole, true>
      id={id}
      multiple
      label={label}
      placeholder={value.length === 0 ? "Select roles" : undefined}
      options={[...HIGH_RISK_ROLE_ORDER]}
      value={value}
      onChange={(_event, next) => onChange(normalizeHighRiskRoles(next))}
      onBlur={onBlur}
      getOptionLabel={(role) => role}
      filterSelectedOptions
      error={error}
      isRequired={isRequired}
      disabled={disabled}
      sx={sx}
    />
  );
}
