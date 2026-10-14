import { RiskData } from "./types";

/**
 * Filters risks based on search term
 * Searches across Summary, Risk Category, and Description fields
 *
 * @param risks - Array of risk data to filter
 * @param searchTerm - Search string to match against
 * @returns Filtered array of risks
 */
export const filterRisks = (risks: RiskData[], searchTerm: string): RiskData[] => {
  if (!searchTerm.trim()) return risks;

  const lowercaseSearch = searchTerm.toLowerCase();
  return risks.filter(
    (risk) =>
      risk.Summary.toLowerCase().includes(lowercaseSearch) ||
      risk["Risk Category"].toLowerCase().includes(lowercaseSearch) ||
      risk.Description.toLowerCase().includes(lowercaseSearch),
  );
};
