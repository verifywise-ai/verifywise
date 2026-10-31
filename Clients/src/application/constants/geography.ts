/**
 * Use case geographies, as stored in projects.geography (and allowed by
 * use_case_org_settings.default_geography on the server).
 */
export const GEOGRAPHY_ITEMS: ReadonlyArray<{ _id: number; name: string }> = [
  { _id: 1, name: "Global" },
  { _id: 2, name: "Europe" },
  { _id: 3, name: "North America" },
  { _id: 4, name: "South America" },
  { _id: 5, name: "Asia" },
  { _id: 6, name: "Africa" },
];

export const EUROPE_GEOGRAPHY_ID = 2;
