/** Display names for a result table's `categoryKey`, shared by the run figures and the trend. */
export const CATEGORY_LABEL: Record<string, string> = {
  sex: "Sex",
  race_ethnicity: "Race or ethnicity",
  intersectional: "Sex by race or ethnicity",
};

/** The display name for a category key, or the key itself when it has none. */
export const categoryLabel = (key: string) => CATEGORY_LABEL[key] ?? key;
