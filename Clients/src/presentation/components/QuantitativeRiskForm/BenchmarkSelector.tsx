import { FC, useCallback } from "react";
import {
  Stack,
  Typography,
  useTheme,
  Autocomplete,
  TextField,
  Box,
} from "@mui/material";
import { ChevronDown as GreyDownArrowIcon } from "lucide-react";
import { useBenchmarks } from "../../../application/hooks/useQuantitativeRisk";
import { IRiskBenchmark } from "../../../domain/interfaces/i.quantitativeRisk";
import { getAutocompleteStyles } from "../../utils/inputStyles";

interface BenchmarkSelectorProps {
  onApply: (benchmark: IRiskBenchmark) => void;
  disabled?: boolean;
}

/**
 * Dropdown to select and apply an industry benchmark as a starting point
 * for FAIR quantitative fields.
 */
const BenchmarkSelector: FC<BenchmarkSelectorProps> = ({
  onApply,
  disabled = false,
}) => {
  const theme = useTheme();
  const { benchmarks, isLoading } = useBenchmarks();

  const handleBenchmarkSelect = useCallback(
    (_: React.SyntheticEvent, value: IRiskBenchmark | null) => {
      if (value) {
        onApply(value);
      }
    },
    [onApply]
  );

  return (
    <Stack sx={{ gap: 2 }}>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.palette.text.primary,
        }}
      >
        Start from industry benchmark
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: theme.palette.text.tertiary,
          lineHeight: 1.5,
        }}
      >
        Optionally select an industry benchmark to pre-fill frequency and loss
        values. You can adjust them after applying.
      </Typography>

      {/* Benchmark selector */}
      <Autocomplete
        id="benchmark-selector"
        size="small"
        options={benchmarks}
        loading={isLoading}
        disabled={disabled}
        groupBy={(option) => option.industry}
        getOptionLabel={(option) =>
          `${option.category} (${option.ai_risk_type})`
        }
        renderOption={(props, option) => {
          const { key, ...optionProps } = props;
          return (
            <Box key={key} component="li" {...optionProps}>
              <Stack>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                  {option.category}
                </Typography>
                <Typography
                  sx={{ fontSize: 11, color: theme.palette.text.tertiary }}
                >
                  {option.ai_risk_type}
                  {option.regulation ? ` \u00B7 ${option.regulation}` : ""}
                </Typography>
              </Stack>
            </Box>
          );
        }}
        renderGroup={(params) => (
          <li key={params.key}>
            <Box
              sx={{
                position: "sticky",
                top: "-8px",
                zIndex: 1,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: theme.palette.text.secondary,
                backgroundColor: theme.palette.background.default,
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              {params.group}
            </Box>
            <ul style={{ padding: 0 }}>{params.children}</ul>
          </li>
        )}
        popupIcon={<GreyDownArrowIcon size={20} />}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={
              isLoading ? "Loading benchmarks..." : "Search benchmarks..."
            }
            sx={{
              "& .MuiInputBase-input": { fontSize: 13 },
              "& ::placeholder": { fontSize: 13 },
            }}
          />
        )}
        onChange={handleBenchmarkSelect}
        sx={{
          ...getAutocompleteStyles(theme, { hasError: false }),
          width: "100%",
          maxWidth: 985,
          backgroundColor: theme.palette.background.main,
        }}
        slotProps={{
          paper: {
            sx: {
              "& .MuiAutocomplete-listbox": {
                "& .MuiAutocomplete-option": {
                  fontSize: 13,
                  padding: "8px 12px",
                },
              },
            },
          },
        }}
      />
    </Stack>
  );
};

export default BenchmarkSelector;
