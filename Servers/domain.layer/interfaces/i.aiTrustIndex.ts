// Servers/domain.layer/interfaces/i.aiTrustIndex.ts

export type IndicatorAward = {
  award: "full" | "half" | "zero";
  subFlag?: "OK" | "SILENT" | "ADVERSE" | "NA";
};
export type IndicatorMap = Record<string, IndicatorAward>;

/** One app object as it appears inside the feed's `apps[]` (and our `data` JSONB). */
export interface ITrustIndexAppData {
  slug: string;
  name: string;
  vendor: string;
  domain: string;
  category: string;
  scoreOutOf100: number;
  letterGrade: string;
  displayedGrade: string;
  confidence: string;
  dealbreakerFlags: string[];
  summary: string;
  highlights: { label: string; text: string }[];
  policyUrl: string;
  policyLastUpdated: string | null;
  modalities: string[];
  processesBiometrics: boolean;
  indicators?: IndicatorMap | null;
  iconUrl?: string;
}

export interface ITrustIndexApp {
  id?: number;
  slug: string;
  name: string;
  vendor?: string;
  category?: string;
  letter_grade?: string;
  score_out_of_100?: number;
  data: ITrustIndexAppData;
  material_hash: string;
  full_hash: string;
  is_active: boolean;
  removed_at?: Date | null;
  last_changed_at?: Date | null;
  last_fetched_at?: Date | null;
}
