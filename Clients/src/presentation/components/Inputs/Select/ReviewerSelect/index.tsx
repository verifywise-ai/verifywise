import {
  MenuItem,
  Select,
  SelectChangeEvent,
  Checkbox,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import "./index.css"; // Include your existing styles
import useUsers from "../../../../../application/hooks/useUsers";

interface ReviewerMultiSelectProps {
  selected: string[];
  setSelected: (ids: string[]) => void;
  label?: string;
  required?: boolean;
  error?: boolean | string;
}

function ReviewerMultiSelect({
  selected,
  setSelected,
  label = "Assigned reviewers",
  required = false,
  error,
}: ReviewerMultiSelectProps) {
  const theme = useTheme();
  const { users } = useUsers();

  const handleChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value },
    } = event;
    setSelected(typeof value === "string" ? value.split(",") : value);
  };

  const renderSelected = (selectedIds: string[]) =>
    users
      .filter((u) => selectedIds.includes(String(u.id)))
      .map((u) => `${u.name} ${u.surname || ""}`)
      .join(", ");

  return (
    <Stack
      className="vw-multi-select"
      gap={theme.spacing(2)}
      sx={{
        ".MuiOutlinedInput-notchedOutline": {
          border: error
            ? `1px solid ${theme.palette.status.error.border}!important`
            : `1px solid ${theme.palette.border.dark}!important`,
        },
      }}
    >
      {label && (
        <Typography
          className="vw-multi-select-label"
          sx={{
            display: "flex",
            alignItems: "center",
            fontWeight: 500,
            fontSize: 13,
            color: `${theme.palette.text.secondary}`,
          }}
        >
          {label}
          {required && (
            <Typography
              className="required"
              sx={{
                ml: 1,
                color: theme.palette.error.text,
              }}
            >
              *
            </Typography>
          )}
        </Typography>
      )}

      <Select
        className="select-component"
        multiple
        value={selected}
        onChange={handleChange}
        renderValue={renderSelected}
        IconComponent={() => <ChevronDown size={16} />}
        error={!!error}
        size="small"
        displayEmpty
        MenuProps={{
          disableScrollLock: true,
          PaperProps: {
            sx: {
              borderRadius: theme.shape.borderRadius,
              boxShadow: theme.shadows[2],
              mt: 1,
              "& .MuiMenuItem-root": {
                fontSize: 13,
                color: theme.palette.text.primary,
                transition: "color 0.2s ease, background-color 0.2s ease",
                "&:hover": {
                  backgroundColor: theme.palette.background.accent,
                  color: theme.palette.primary.main,
                },
                "&.Mui-selected": {
                  backgroundColor: theme.palette.background.accent,
                  "&:hover": {
                    backgroundColor: theme.palette.background.accent,
                    color: theme.palette.primary.main,
                  },
                },
              },
            },
          },
        }}
      >
        {users.map((user) => {
          const idStr = String(user.id);
          return (
            <MenuItem
              key={idStr}
              value={idStr}
              disableRipple
              sx={{
                display: "flex",
                justifyContent: "space-between",
                flexDirection: "row",
                gap: 1,
                fontSize: "var(--env-var-font-size-medium)",
                color: theme.palette.text.tertiary,
                borderRadius: theme.shape.borderRadius,
                margin: theme.spacing(2),
              }}
            >
              <Checkbox checked={selected.includes(idStr)} disableFocusRipple disableRipple />
              <ListItemText
                primary={`${user.name} ${user.surname ?? ""}`}
                secondary={user.email}
                secondaryTypographyProps={{
                  fontSize: 11,
                  color: theme.palette.text.disabled,
                }}
              />
            </MenuItem>
          );
        })}
      </Select>

      {error && (
        <Typography
          className="input-error"
          color={theme.palette.status.error.text}
          mt={theme.spacing(2)}
          sx={{
            opacity: 0.8,
            fontSize: 11,
          }}
        >
          {error}
        </Typography>
      )}
    </Stack>
  );
}

export default ReviewerMultiSelect;
