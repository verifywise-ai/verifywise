/**
 * Customer-visible labels for identifiers the stance would otherwise print as
 * slugs. Pure: no I/O. An identifier with no entry is made readable rather
 * than printed raw.
 */
const PRESET_LABEL: Record<string, string> = {
  nyc_ll144: "New York City Local Law 144",
};

const METRIC_LABEL: Record<string, string> = {
  selection_rate: "Selection rate",
  scoring_rate: "Scoring rate",
};

const BLANK_FIELD_LABEL: Record<string, string> = {
  distribution_date: "Distribution date",
  job_description: "Job description tested",
};

/** "some_preset" becomes "Some preset". */
function humanize(slug: string): string {
  const spaced = slug.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const presetLabel = (id: string) => PRESET_LABEL[id] ?? humanize(id);
export const metricLabel = (id: string) => METRIC_LABEL[id] ?? humanize(id);
export const blankFieldLabel = (key: string) => BLANK_FIELD_LABEL[key] ?? humanize(key);
