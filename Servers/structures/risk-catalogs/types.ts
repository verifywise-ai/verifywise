/**
 * One entry in a built-in AI risk catalog (MIT AI Risk Repository, IBM AI
 * Risk Atlas). camelCase fields; `riskCategories` is the source's
 * semicolon-joined "Risk Category" string pre-split and trimmed. Category
 * strings are the catalog's own vocabulary — normalization onto
 * PROJECT_RISK_CATEGORIES happens in services/riskSuggestions.
 */
export interface RiskCatalogEntry {
  id: number;
  summary: string;
  description: string;
  /** Catalog string, e.g. "Major" — NOT necessarily the risk_severity enum. */
  riskSeverity: string;
  /** Catalog string, e.g. "Possible" — NOT necessarily the likelihood enum. */
  likelihood: string;
  riskCategories: string[];
}
