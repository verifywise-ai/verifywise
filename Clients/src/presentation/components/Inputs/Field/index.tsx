/**
 * A customizable input field component that supports various types of inputs,
 * including text, password, and URL. It also provides options for labels,
 * placeholders, error messages, and adornments.
 *
 * @component
 * @param {FieldProps} props - The properties for the Field component.
 * @param {string} [props.type="text"] - The type of the input field.
 * @param {string} [props.id] - The id of the input field.
 * @param {string} [props.label] - The label for the input field.
 * @param {boolean} [props.https] - Whether to use "https" in the URL input.
 * @param {boolean} [props.isRequired] - Whether the field is required.
 * @param {boolean} [props.isOptional] - Whether the field is optional.
 * @param {string} [props.optionalLabel] - The label for optional fields.
 * @param {string} [props.autoComplete] - The autocomplete attribute for the input field.
 * @param {string} [props.placeholder] - The placeholder text for the input field.
 * @param {string} [props.value] - The value of the input field.
 * @param {function} [props.onChange] - The function to call when the input value changes.
 * @param {function} [props.onInput] - The function to call when the input event occurs.
 * @param {string} [props.error] - The error message to display.
 * @param {boolean} [props.disabled] - Whether the input field is disabled.
 * @param {ForwardedRef<HTMLInputElement>} ref - The forwarded ref for the input field.
 * @returns {JSX.Element} The rendered Field component.
 */

import {
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  TextFieldProps,
  Typography,
  useTheme,
} from "@mui/material";
import "./index.css";
import { forwardRef, useState } from "react";
import { Eye as VisibilityIcon, EyeOff as VisibilityOffIcon } from "lucide-react";
import { ForwardedRef } from "react";
import { FieldProps as OriginalFieldProps } from "../../../types/widget.types";
import { getInputStyles } from "../../../utils/inputStyles";

// Extend FieldProps to add optional rows
interface FieldProps extends OriginalFieldProps {
  rows?: number;
  helperText?: string;
  InputProps?: TextFieldProps["InputProps"];
  formHelperTextProps?: TextFieldProps["FormHelperTextProps"];
  autoFocus?: boolean;
  multiline?: boolean;
  minRows?: number;
}

const Field = forwardRef(
  (
    {
      type = "text",
      id,
      label,
      https,
      isRequired,
      isOptional,
      optionalLabel,
      autoComplete,
      autoFocus,
      placeholder,
      value,
      onChange,
      onInput,
      onFocus,
      onBlur,
      onKeyDown,
      error,
      disabled,
      width,
      sx,
      rows,
      helperText,
      InputProps: inputPropsOverride,
      formHelperTextProps,
      min,
      max,
      multiline: multilineProp,
      minRows,
    }: FieldProps,
    ref: ForwardedRef<HTMLInputElement>
  ) => {
    const theme = useTheme();

    const [isVisible, setVisible] = useState(false);

    const rootSx = sx;

    return (
      <Stack
        gap={theme.spacing(2)}
        className={`field field-${type}`}
        sx={{
          ...getInputStyles(theme, { hasError: !!error }),
          width: width,
          ...(rootSx || {}),
        }}
      >
        {label && (
          <Typography
            component="p"
            variant="body1"
            color={theme.palette.text.secondary}
            fontWeight={500}
            fontSize={"13px"}
            sx={{ margin: 0, height: '22px' }}
          >
            {label}
            {isRequired && (
              <Typography
                component="span"
                ml={theme.spacing(1)}
                color={theme.palette.error.text}
              >
                *
              </Typography>
            )}
            {isOptional && (
              <Typography
                component="span"
                fontSize="inherit"
                fontWeight={400}
                ml={theme.spacing(2)}
                sx={{ opacity: 0.6 }}
              >
                {optionalLabel || "(optional)"}
              </Typography>
            )}
          </Typography>
        )}
        <TextField
          className="field-input"
          type={type === "password" ? (isVisible ? "text" : type) : type}
          id={id}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          multiline={multilineProp || type === "description" || (rows !== undefined && rows > 1)}
          minRows={minRows}
          rows={multilineProp ? undefined : (type === "description" ? (rows || 4) : (rows || 1))}
          value={value}
          onInput={onInput as React.FormEventHandler<HTMLDivElement>}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          disabled={disabled}
          inputRef={ref}
          inputProps={{
            min: min,
            max: max,
            sx: {
              color: theme.palette.text.secondary,
              "&:-webkit-autofill": {
                WebkitBoxShadow: `0 0 0 100px ${theme.palette.background.fill} inset`,
                WebkitTextFillColor: theme.palette.text.secondary,
              },
              overflowY: "auto",
            },
          }}
          sx={sx}
          helperText={helperText}
          FormHelperTextProps={formHelperTextProps}
          InputProps={{
            ...inputPropsOverride,
            startAdornment:
              inputPropsOverride?.startAdornment ||
              (type === "url" && (
                <Stack
                  direction="row"
                  alignItems="center"
                  height="100%"
                  sx={{
                    borderRight: `solid 1px ${theme.palette.border.dark}`,
                    backgroundColor: theme.palette.background.accent,
                    pl: theme.spacing(6),
                  }}
                >
                  <Typography
                    component="h5"
                    color={theme.palette.text.secondary}
                    sx={{ lineHeight: 1 }}
                  >
                    {https ? "https" : "http"}://
                  </Typography>
                </Stack>
              )),
            endAdornment:
              inputPropsOverride?.endAdornment ||
              (type === "password" && (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setVisible((show) => !show)}
                    tabIndex={-1}
                    sx={{
                      color: theme.palette.border.dark,
                      padding: theme.spacing(1),
                      "&:focus": {
                        outline: "none",
                      },
                      "& .MuiTouchRipple-root": {
                        pointerEvents: "none",
                        display: "none",
                      },
                    }}
                  >
                    {!isVisible ? <VisibilityOffIcon size={16} /> : <VisibilityIcon size={16} />}
                  </IconButton>
                </InputAdornment>
              )),
          }}
        />
        {error && (
          <Typography
            component="span"
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
);

Field.displayName = "Field";

export default Field;
