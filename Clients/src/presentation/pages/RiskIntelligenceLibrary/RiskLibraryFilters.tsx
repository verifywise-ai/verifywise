import { Box, SelectChangeEvent } from "@mui/material";
import Select from "../../components/Inputs/Select";
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

const toItems = (options: string[]) => [
  { _id: "", name: "All" },
  ...options.map((opt) => ({ _id: opt, name: opt })),
];

const RiskLibraryFilterBar = ({ filters, onFilterChange, filterOptions }: Props) => {
  const handleChange = (key: keyof FilterState) => (event: SelectChangeEvent<string | number>) => {
    onFilterChange(key, event.target.value as string);
  };

  const renderSelect = (
    key: keyof FilterState,
    label: string,
    options: string[]
  ) => (
    <Select
      id={`risk-library-filter-${key}`}
      label={label}
      placeholder="All"
      value={filters[key]}
      items={toItems(options)}
      onChange={handleChange(key)}
      isFilterApplied={!!filters[key]}
      sx={{ minWidth: 140 }}
    />
  );

  return (
    <Box sx={{ display: "flex", gap: "20px", flexWrap: "wrap", mb: 2 }}>
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
