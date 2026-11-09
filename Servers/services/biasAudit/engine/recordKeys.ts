/**
 * Canonical keys the engine reads from every record, as the Python engine
 * does. A dataset parser maps uploaded columns onto these before anything runs.
 */
export const RECORD_KEYS = {
  selected: "selected",
  score: "score",
  prediction: "prediction",
  groundTruth: "ground_truth",
} as const;
