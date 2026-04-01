/**
 * NIST AI RMF Function Types
 * These match the `function` column values in nist_ai_rmf_categories_struct table
 */
export enum NISTAIMRFFunctionType {
  GOVERN = "GOVERN",
  MAP = "MAP",
  MEASURE = "MEASURE",
  MANAGE = "MANAGE",
}

/**
 * Display titles for NIST AI RMF functions
 */
export const NISTFunctionTitles: Record<NISTAIMRFFunctionType, string> = {
  [NISTAIMRFFunctionType.GOVERN]: "Govern",
  [NISTAIMRFFunctionType.MAP]: "Map",
  [NISTAIMRFFunctionType.MEASURE]: "Measure",
  [NISTAIMRFFunctionType.MANAGE]: "Manage",
};
