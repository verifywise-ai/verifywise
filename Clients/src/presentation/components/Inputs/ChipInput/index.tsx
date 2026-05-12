import { Autocomplete, TextField, Stack, Typography, useTheme } from "@mui/material";
import { getAutocompleteStyles } from "../../../utils/inputStyles";

export interface ChipInputProps {
  id: string;
  label?: string;
  value: string[];
  onChange: (newValue: string[]) => void;
  placeholder?: string;
  error?: string;
  isRequired?: boolean;
  sx?: object;
  disabled?: boolean;
}

function ChipInput({
  id,
  label,
  value,
  onChange,
  placeholder = "Enter values",
  error,
  isRequired = false,
  sx,
  disabled = false,
}: ChipInputProps) {
  const theme = useTheme();

  return (
    <Stack gap={theme.spacing(2)} sx={sx}>
      {label && (
        <Typography
          component="p"
          variant="body1"
          color={theme.palette.text.secondary}
          fontWeight={500}
          fontSize={"13px"}
          sx={{
            margin: 0,
            height: "22px",
            display: "flex",
            alignItems: "center",
          }}
        >
          {label}
          {isRequired && (
            <Typography component="span" ml={theme.spacing(1)} color={theme.palette.error.text}>
              *
            </Typography>
          )}
        </Typography>
      )}

      <Autocomplete
        multiple
        id={id}
        size="small"
        freeSolo
        value={value}
        options={[]}
        onChange={(_event, newValue: string[]) => {
          onChange(newValue);
        }}
        getOptionLabel={(option: string) => option}
        filterSelectedOptions
        disabled={disabled}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            error={!!error}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const input = e.target as HTMLInputElement;
                const newValue = input.value.trim();
                if (newValue && !value.includes(newValue)) {
                  onChange([...value, newValue]);
                  input.value = "";
                }
              }
            }}
          />
        )}
        sx={{
          ...getAutocompleteStyles(theme, { hasError: !!error }),
          "width": "100%",
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
        }}
        slotProps={{
          paper: {
            sx: {
              display: "none",
            },
          },
        }}
      />

      {error && (
        <Typography
          className="input-error"
          color={theme.palette.status.error.text}
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

export default ChipInput;
