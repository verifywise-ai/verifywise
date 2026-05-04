import { riskCategoryItems } from "../AddNewRiskForm/projectRiskValue";
import { RiskData, DEFAULT_VALUES } from "./types";

/**
 * Maps risk category strings to their corresponding IDs
 * Categories are separated by semicolons in the source data
 *
 * @param riskCategories - Semicolon-separated category string
 * @returns Array of category IDs, defaults to [DEFAULT_CATEGORY_ID] if no matches found
 */
export const mapRiskCategories = (riskCategories: string): number[] => {
  const categories = riskCategories.split(";").map((cat) => cat.trim());
  const mappedCategories: number[] = [];

  categories.forEach((category) => {
    const matchedCategory = riskCategoryItems.find(
      (item) => item.name.toLowerCase() === category.toLowerCase(),
    );
    if (matchedCategory) {
      mappedCategories.push(matchedCategory._id);
    }
  });

  return mappedCategories.length > 0 ? mappedCategories : [DEFAULT_VALUES.DEFAULT_CATEGORY_ID];
};

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
