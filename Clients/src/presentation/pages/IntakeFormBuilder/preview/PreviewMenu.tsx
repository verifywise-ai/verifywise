import { Typography, useTheme } from "@mui/material";
import { Eye } from "lucide-react";
import {
  PREVIEW_ROLES,
  PREVIEW_ROLE_LABELS,
  type PreviewRole,
} from "../../../../application/utils/intakeRouting/previewRole";
import { MenuOption, PopoverMenu } from "./PopoverMenu";

interface PreviewMenuProps {
  onPreviewForm: () => void;
  onPreviewReview: (role: PreviewRole) => void;
}

/** The builder's Preview button: the public form, or the review flow as a role. */
export const PreviewMenu = ({ onPreviewForm, onPreviewReview }: PreviewMenuProps) => {
  const theme = useTheme();
  return (
    <PopoverMenu text="Preview" testId="button-intake-preview" startIcon={<Eye size={14} />}>
      {(close) => (
        <>
          <MenuOption
            label="Form as a submitter"
            description="Opens the public form in a new tab"
            onSelect={() => {
              close();
              onPreviewForm();
            }}
          />
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 600,
              color: theme.palette.text.secondary,
              p: "8px 12px 4px",
            }}
          >
            Review flow as
          </Typography>
          {PREVIEW_ROLES.map((role) => (
            <MenuOption
              key={role}
              label={PREVIEW_ROLE_LABELS[role]}
              onSelect={() => {
                close();
                onPreviewReview(role);
              }}
            />
          ))}
        </>
      )}
    </PopoverMenu>
  );
};

interface RoleSwitchProps {
  role: PreviewRole;
  onChange: (role: PreviewRole) => void;
}

/** Switches the simulated role in place. */
export const RoleSwitch = ({ role, onChange }: RoleSwitchProps) => (
  <PopoverMenu text="Switch role" testId="button-preview-switch-role">
    {(close) =>
      PREVIEW_ROLES.map((r) => (
        <MenuOption
          key={r}
          label={PREVIEW_ROLE_LABELS[r]}
          selected={r === role}
          onSelect={() => {
            close();
            onChange(r);
          }}
        />
      ))
    }
  </PopoverMenu>
);
