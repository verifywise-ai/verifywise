import {
  Autocomplete,
  AutocompleteProps,
  Stack,
  SxProps,
  TextField,
  Theme,
  Typography,
  useTheme,
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import "./index.css";
import { getAutocompleteStyles } from "../../../utils/inputStyles";

interface AutoCompleteFieldProps<
  T,
  Multiple extends boolean | undefined = undefined,
  DisableClearable extends boolean | undefined = undefined,
  FreeSolo extends boolean | undefined = undefined,
> extends Omit<AutocompleteProps<T, Multiple, DisableClearable, FreeSolo>, "renderInput" | "sx"> {
  label?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  isRequired?: boolean;
  isOptional?: boolean;
  optionalLabel?: string;
  sx?: SxProps<Theme>;
}

function AutoCompleteField<
  T,
  Multiple extends boolean | undefined = undefined,
  DisableClearable extends boolean | undefined = undefined,
  FreeSolo extends boolean | undefined = undefined,
>({
  label,
  placeholder,
  error,
  helperText,
  isRequired,
  isOptional,
  optionalLabel,
  sx,
  disabled,
  ...autocompleteProps
}: AutoCompleteFieldProps<T, Multiple, DisableClearable, FreeSolo>) {
  const theme = useTheme();

  const LAYOUT_KEYS = [
    "width",
    "flex",
    "flexGrow",
    "flexShrink",
    "flexBasis",
    "minWidth",
    "maxWidth",
  ] as const;

  const extractedLayoutProps = (() => {
    if (!sx || typeof sx !== "object" || Array.isArray(sx)) return {};
    const s = sx as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    LAYOUT_KEYS.forEach((key) => {
      if (s[key] !== undefined) props[key] = s[key];
    });
    return props;
  })();

  const sxWithoutLayoutProps = (() => {
    if (!sx || typeof sx !== "object" || Array.isArray(sx)) return sx;
    const s = sx as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(s).filter(([key]) => !(LAYOUT_KEYS as readonly string[]).includes(key)),
    );
  })();

  return (
    <Stack
      sx={[
        {
          gap: theme.spacing(2),
        },
        ...(Array.isArray(extractedLayoutProps) ? extractedLayoutProps : [extractedLayoutProps]),
      ]}
    >
      {label && (
        <Typography
          component="p"
          variant="body1"
          color={theme.palette.text.secondary}
          sx={{
            fontWeight: 500,
            fontSize: "13px",
            margin: 0,
            height: "22px",
          }}
        >
          {label}
          {isRequired && (
            <Typography
              component="span"
              color={theme.palette.error.text}
              sx={{
                ml: theme.spacing(1),
              }}
            >
              *
            </Typography>
          )}
          {isOptional && (
            <Typography
              component="span"
              sx={{
                fontSize: "inherit",
                fontWeight: 400,
                ml: theme.spacing(2),
                opacity: 0.6,
              }}
            >
              {optionalLabel || "(optional)"}
            </Typography>
          )}
        </Typography>
      )}
      <Autocomplete<T, Multiple, DisableClearable, FreeSolo>
        disabled={disabled}
        popupIcon={<ChevronDown size={16} color={theme.palette.text.tertiary} />}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder={placeholder}
            error={!!error || !!helperText}
            helperText={helperText}
            sx={{
              "& .MuiOutlinedInput-root": {
                minHeight: "34px",
                paddingTop: "2px !important",
                paddingBottom: "2px !important",
              },
              "& ::placeholder": {
                fontSize: "13px",
              },
            }}
          />
        )}
        sx={{
          ...getAutocompleteStyles(theme, { hasError: !!error }),
          "backgroundColor": theme.palette.background.main,
          "& .MuiOutlinedInput-root": {
            ...getAutocompleteStyles(theme, { hasError: !!error })["& .MuiOutlinedInput-root"],
            borderRadius: theme.shape.borderRadius,
          },
          "& .MuiChip-root": {
            borderRadius: theme.shape.borderRadius,
            height: "22px",
            margin: "1px 2px",
            fontSize: "13px",
          },
          ...sxWithoutLayoutProps,
        }}
        slotProps={{
          popper: {
            sx: {
              "& ul": { p: 0 },
              "& li": {
                "fontSize": 13,
                "borderRadius": theme.shape.borderRadius,
                "transition": "color 0.2s ease, background-color 0.2s ease",
                "&:hover": {
                  color: theme.palette.primary.main,
                  backgroundColor: theme.palette.background.accent,
                },
              },
            },
          },
          paper: {
            sx: {
              p: 2,
              fontSize: 13,
              borderRadius: theme.shape.borderRadius,
              boxShadow: theme.boxShadow,
            },
          },
        }}
        {...autocompleteProps}
      />
      {error && (
        <Typography
          component="span"
          role="alert"
          className="input-error"
          color={theme.palette.status.error.text}
          sx={{
            mt: theme.spacing(2),
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

export default AutoCompleteField;
