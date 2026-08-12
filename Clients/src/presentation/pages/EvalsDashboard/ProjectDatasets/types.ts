/**
 * @fileoverview Shared types for the Project Datasets page and its extracted subcomponents.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/types
 */

import type {
  DatasetType,
  ListedDataset,
} from "../../../../application/repository/deepEval.repository";

export type BuiltInDataset = ListedDataset & {
  promptCount?: number;
  isUserDataset?: boolean;
  createdAt?: string;
  datasetType?: DatasetType;
  turnType?: "single-turn" | "multi-turn" | "simulated";
  // Additional metadata for templates
  test_count?: number;
  categories?: string[];
  category_count?: number;
  difficulty?: { easy: number; medium: number; hard: number };
  description?: string;
  tags?: string[];
};

export type TemplateWithCategory = BuiltInDataset & {
  category: "chatbot" | "rag" | "agent";
};
