/**
 * @fileoverview Searchable model picker for LLM Evals: saved models first, then the
 * provider's catalog with prices and context window. Any model ID can be typed.
 *
 * @module components/Inputs/ModelPicker
 */

import { Box, Stack, Typography, useTheme } from "@mui/material";
import AutoCompleteField from "../Autocomplete";
import type { ModelInfo } from "../../../utils/providers";

/** Models retiring within this many days carry a "Retires" date. */
export const RETIRING_SOON_DAYS = 90;

interface PickerOption extends ModelInfo {
  group: string;
}

export interface ModelPickerProps {
  label?: string;
  /** The selected or typed model ID */
  value: string;
  onChange: (modelId: string) => void;
  models: ModelInfo[];
  /** IDs of the organization's saved models; they are listed first */
  savedModelIds?: string[];
  /** Show input/output prices per 1M tokens on each row */
  showPrices?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** The catalog is still loading; the list may change */
  loading?: boolean;
  testId?: string;
}

const formatContext = (tokens: number) =>
  tokens >= 1_000_000
    ? `${Number((tokens / 1_000_000).toFixed(1))}M`
    : `${Math.round(tokens / 1000)}K`;

/** The retirement date when it falls within RETIRING_SOON_DAYS, else undefined. */
export const retiringSoon = (deprecationDate?: string, today = new Date()): string | undefined => {
  if (!deprecationDate) return undefined;
  const days = (Date.parse(deprecationDate) - today.getTime()) / 86_400_000;
  return days >= 0 && days <= RETIRING_SOON_DAYS ? deprecationDate : undefined;
};

export default function ModelPicker({
  label = "Model",
  value,
  onChange,
  models,
  savedModelIds = [],
  showPrices = false,
  placeholder = "Search or type a model ID",
  disabled,
  loading = false,
  testId,
}: ModelPickerProps) {
  const theme = useTheme();
  const saved = new Set(savedModelIds);
  const options: PickerOption[] = [
    ...models.filter((m) => saved.has(m.id)).map((m) => ({ ...m, group: "Saved models" })),
    ...models.filter((m) => !saved.has(m.id)).map((m) => ({ ...m, group: "All models" })),
  ];
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <AutoCompleteField<PickerOption, false, false, true>
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      data-testid={testId ? `model-picker-${testId}` : undefined}
      freeSolo
      options={options}
      groupBy={(o) => o.group}
      value={selected}
      inputValue={value}
      // Typing is a choice too: any ID the provider serves can be entered
      onInputChange={(_event, text, reason) => {
        if (reason === "input" || reason === "clear") onChange(text);
      }}
      onChange={(_event, option) => {
        if (option === null) onChange("");
        else onChange(typeof option === "string" ? option : option.id);
      }}
      getOptionLabel={(o) => (typeof o === "string" ? o : o.id)}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      filterOptions={(opts, state) => {
        const query = state.inputValue.trim().toLowerCase();
        // An exact pick shows the whole list again rather than only itself
        if (!query || opts.some((o) => o.id.toLowerCase() === query)) return opts;
        return opts.filter(
          (o) => o.id.toLowerCase().includes(query) || o.name.toLowerCase().includes(query),
        );
      }}
      renderOption={(props, o) => {
        const { key, ...rest } = props as typeof props & { key: string };
        const retires = retiringSoon(o.deprecationDate);
        const details = [
          showPrices && o.inputCost !== undefined && o.outputCost !== undefined
            ? `$${o.inputCost}/1M in • $${o.outputCost}/1M out`
            : null,
          o.contextWindow ? `${formatContext(o.contextWindow)} context` : null,
        ].filter(Boolean);
        return (
          <Box component="li" key={key} {...rest}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              gap="12px"
              sx={{ width: "100%" }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "13px" }} noWrap>
                  {o.name}
                </Typography>
                {o.name !== o.id && (
                  <Typography sx={{ fontSize: "11px", color: theme.palette.text.tertiary }} noWrap>
                    {o.id}
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                {details.length > 0 && (
                  <Typography sx={{ fontSize: "11px", color: theme.palette.text.tertiary }}>
                    {details.join(" • ")}
                  </Typography>
                )}
                {retires && (
                  <Typography sx={{ fontSize: "11px", color: theme.palette.status.warning.text }}>
                    Retires {retires}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>
        );
      }}
    />
  );
}
