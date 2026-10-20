// Tooltips for an experiment's rerun, download and copy actions, shared by the
// experiments table menu and the experiment detail header. Translated by exact text
// (i18n/translations.ts), so keep the wording identical in both places.
export const EXPERIMENT_ACTION_TOOLTIPS = {
  // A rerun copies the experiment's config; a standard judge is optional, so say
  // "settings" rather than listing a judge.
  rerun:
    "Start a new experiment with the same settings. This experiment is kept, and every prompt is run and scored again.",
  rerunWhileRunning: "You can rerun this experiment once it finishes.",
  // The table exports the experiment record: settings, average scores and
  // results.detailed_results, which holds up to the first 10 samples. The table only
  // offers these for completed runs.
  downloadSummary:
    "Save this experiment's settings, average scores and up to 10 samples as a JSON file. For more samples, open the experiment and use Download there.",
  copySummary:
    "Copy this experiment's settings, average scores and up to 10 samples as JSON. For more samples, open the experiment and use Copy there.",
  // The detail view exports the experiment plus the logs it loaded: getLogs returns the
  // newest first, limit 1000.
  downloadFull:
    "Save this experiment's settings and each sample's input, output and scores as a JSON file. Up to the 1,000 most recent samples are included.",
  copyFull:
    "Copy this experiment's settings and each sample's input, output and scores to the clipboard as JSON. Up to the 1,000 most recent samples are included.",
} as const;
