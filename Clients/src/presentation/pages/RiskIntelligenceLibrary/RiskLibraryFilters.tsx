import { Box, FormControl, InputLabel, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import { RiskLibraryFilters as FiltersType } from "../../../domain/types/RiskLibrary";

interface FilterState {
  source: string;
  risk_type: string;
  risk_source: string;
  domain: string;
  eu_ai_act_tier: string;
  severity: string;
  likelihood: string;
  industry: string;
  lifecycle_phase: string;
}

interface Props {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  filterOptions?: FiltersType;
}

const selectSx = { minWidth: 140, "& .MuiSelect-select": { py: 1 } };

const RiskLibraryFilterBar = ({ filters, onFilterChange, filterOptions }: Props) => {
  const handleChange = (key: keyof FilterState) => (event: SelectChangeEvent) => {
    onFilterChange(key, event.target.value);
  };

  const renderSelect = (
    key: keyof FilterState,
    label: string,
    options: string[]
  ) => (
    <FormControl size="small" sx={selectSx}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={filters[key]}
        label={label}
        onChange={handleChange(key)}
      >
        <MenuItem value="">All</MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {opt}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
      {renderSelect("source", "Source", filterOptions?.sources || [])}
      {renderSelect("risk_type", "Risk Type", filterOptions?.riskTypes || [])}
      {renderSelect("risk_source", "Risk Source", filterOptions?.riskSources || [])}
      {renderSelect("domain", "Domain", filterOptions?.domains || [])}
      {renderSelect("eu_ai_act_tier", "EU AI Act Tier", filterOptions?.euAiActTiers || [])}
      {renderSelect("severity", "Severity", filterOptions?.severities || [])}
      {renderSelect("likelihood", "Likelihood", filterOptions?.likelihoods || [])}
      {renderSelect("industry", "Industry", filterOptions?.industries || [])}
      {renderSelect("lifecycle_phase", "Lifecycle Phase", filterOptions?.lifecyclePhases || [])}
    </Box>
  );
};

export default RiskLibraryFilterBar;
