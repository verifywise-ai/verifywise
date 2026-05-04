import {
  MenuItem,
  Select as MuiSelect,
  SelectChangeEvent,
  Stack,
  SxProps,
  Theme,
  Typography,
  useTheme,
  Checkbox,
  ListItemText,
  Chip,
  Box,
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import { getSelectStyles } from "../../../utils/inputStyles";

interface MultiSelectProps {
  id: string;
  label?: string;
  placeholder?: string;
  value: number[];
  items: Array<{ _id: number; name: string; surname?: string }>;
  isRequired?: boolean;
  error?: string;
  onChange: (event: SelectChangeEvent<number[]>) => void;
  sx?: SxProps<Theme>;
  disabled?: boolean;
}

function MultiSelect({
  id,
  label,
  placeholder,
  value,
  items,
  isRequired,
  error,
  onChange,
  sx,
  disabled,
}: MultiSelectProps) {
  const theme = useTheme();

  // Extract width, flexGrow, minWidth, maxWidth from sx prop to apply to wrapper Stack
  const extractedLayoutProps = (() => {
    if (!sx || typeof sx !== "object" || Array.isArray(sx)) return {};
    const s = sx as Record<string, unknown>;
    return {
      width: s.width as string | number | undefined,
      flexGrow: s.flexGrow as number | undefined,
      minWidth: s.minWidth as string | number | undefined,
      maxWidth: s.maxWidth as string | number | undefined,
    };
  })();

  // Create a copy of sx without layout props to pass to MuiSelect
  const sxWithoutLayoutProps = (() => {
    if (!sx || typeof sx !== "object" || Array.isArray(sx)) return sx;
    const s = sx as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(s).filter(
        ([key]) => !["width", "flexGrow", "minWidth", "maxWidth"].includes(key),
      ),
    );
  })();

  const renderValue = (selected: number[]) => {
    if (selected.length === 0) {
      return <span style={{ color: theme.palette.text.disabled }}>{placeholder}</span>;
    }

    return (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {selected.map((selectedId) => {
          const item = items.find((i) => i._id === selectedId);
          if (!item) return null;
          const displayName = item.name + (item.surname ? " " + item.surname : "");
          return (
            <Chip
              key={selectedId}
              label={displayName}
              size="small"
              sx={{
                height: "24px",
                fontSize: "13px",
              }}
            />
          );
        })}
      </Box>
    );
  };

  return (
    <Stack spacing={1} sx={extractedLayoutProps}>
      {label && (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            fontSize: "var(--env-var-font-size-small)",
            color: theme.palette.text.secondary,
          }}
        >
          {label}
          {isRequired && <span style={{ color: theme.palette.error.main }}> *</span>}
        </Typography>
      )}
      <MuiSelect
        id={id}
        multiple
        value={value}
        onChange={onChange}
        disabled={disabled}
        renderValue={renderValue}
        displayEmpty
        IconComponent={ChevronDown}
        sx={{
          ...getSelectStyles(theme, { hasError: !!error }),
          ...sxWithoutLayoutProps,
        }}
        MenuProps={{
          PaperProps: {
            style: {
              maxHeight: 300,
            },
          },
        }}
      >
        {items.map((item) => {
          const displayName = item.name + (item.surname ? " " + item.surname : "");
          return (
            <MenuItem
              key={item._id}
              value={item._id}
              sx={{
                fontSize: "var(--env-var-font-size-medium)",
                color: theme.palette.text.tertiary,
                borderRadius: theme.shape.borderRadius,
                margin: "4px 8px",
              }}
            >
              <Checkbox checked={value.indexOf(item._id) > -1} />
              <ListItemText primary={displayName} />
            </MenuItem>
          );
        })}
      </MuiSelect>
      {error && (
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.error.main,
            fontSize: "var(--env-var-font-size-small)",
          }}
        >
          {error}
        </Typography>
      )}
    </Stack>
  );
}

export default MultiSelect;
