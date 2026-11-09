import type { ChipVariant } from "../types/interfaces/i.chip";

/**
 * Category colors for the dataset tables (Evals "My datasets" and the
 * built-in templates list). These are categories, not statuses, so they use
 * the accent group and status tokens only where a state is implied.
 */

/** single-turn / multi-turn / simulated */
export const getDatasetTypeVariant = (type?: string): ChipVariant => {
  switch (type) {
    case "single-turn":
      return "warning";
    case "multi-turn":
      return "info";
    case "simulated":
      return "accent-purple";
    default:
      return "default";
  }
};

/** chatbot / rag / agent */
export const getDatasetCategoryVariant = (category?: string): ChipVariant => {
  switch (category) {
    case "chatbot":
      return "accent-teal";
    case "rag":
      return "accent-purple";
    case "agent":
      return "accent-pink";
    default:
      return "default";
  }
};

/** Easy / Medium / Hard */
export const getDifficultyVariant = (difficulty?: string): ChipVariant => {
  switch (difficulty) {
    case "Easy":
      return "success";
    case "Medium":
      return "warning";
    case "Hard":
      return "error";
    default:
      return "default";
  }
};
