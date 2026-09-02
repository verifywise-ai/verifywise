import { Stack, SxProps, Theme, Typography, useTheme } from "@mui/material";
import React from "react";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker as MuiDatePicker } from "@mui/x-date-pickers/DatePicker";
import "./index.css";
import dayjs from "dayjs";
import { DatePickerProps } from "../../../types/widget.types";
import { DatePickerStyle } from "./style";
import { getDatePickerStyles } from "../../../utils/inputStyles";

function isRecordSx(sx: SxProps<Theme>): sx is Record<string, unknown> {
  return typeof sx === "object" && sx !== null && !Array.isArray(sx);
}

function DatePicker({
  label,
  isRequired,
  isOptional,
  optionalLabel,
  sx,
  date,
  error,
  handleDateChange,
  disabled = false,
  id,
  onBlur,
}: DatePickerProps) {
  const theme = useTheme();
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;

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
    if (!sx || !isRecordSx(sx)) return {};
    const props: Record<string, unknown> = {};
    LAYOUT_KEYS.forEach((key) => {
      if (sx[key] !== undefined) props[key] = sx[key];
    });
    return props;
  })();

  const sxWithoutLayoutProps =
    sx && isRecordSx(sx)
      ? Object.fromEntries(
          Object.entries(sx).filter(([key]) => !(LAYOUT_KEYS as readonly string[]).includes(key)),
        )
      : sx;

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
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <MuiDatePicker
          className="mui-date-picker"
          sx={{
            ...DatePickerStyle,
            ...getDatePickerStyles(theme, { hasError: !!error }),
            "& .MuiInputBase-root": {
              cursor: "pointer",
            },
            ...sxWithoutLayoutProps,
          }}
          value={date ? dayjs(date) : null}
          onChange={(value) => handleDateChange(value)}
          format="MM/DD/YYYY"
          disabled={disabled}
          slotProps={{
            textField: {
              id: fieldId,
              onBlur,
            },
          }}
        />
      </LocalizationProvider>
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

export default DatePicker;
