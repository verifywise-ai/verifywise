// Subset of the feed shapes we rely on; ignore other fields (additive-safe).

export type RegulationChange =
  | { field: "regulationCount"; from: number; to: number }
  | { field: "regulation.status"; regulation: string; from: string; to: string }
  | { field: "regulation.effectiveDate"; regulation: string; from: string; to: string }
  | { field: "regulation"; change: "added" | "removed"; value: string };

export interface IFeedCountryHistory {
  firstAssessed: string;
  lastChanged: string;
  lastChecked: string;
  assessmentCount: number;
  hashHistory: { date: string; hash: string; regulationCount: number }[];
  lastChange: { date: string; changes: RegulationChange[] } | null;
}

// The manifest's per-country entry (what we store + hash on).
export interface IManifestCountry {
  slug: string;
  name: string;
  region: string;
  regulationCount: number;
  hash: string;
  history: IFeedCountryHistory | null;
  url: string;
}

export interface IManifest {
  feedVersion: number;
  generatedAt: string;
  meta: Record<string, unknown>;
  counts: Record<string, number>;
  countries: IManifestCountry[];
}

// Row shape for the global catalog table.
export interface IRegulationCountry {
  id?: number;
  slug: string;
  name: string;
  region?: string | null;
  regulation_count?: number | null;
  data: IManifestCountry;
  hash: string;
  is_active: boolean;
  removed_at?: Date | null;
  last_changed_at?: Date | null;
  last_fetched_at?: Date | null;
}
