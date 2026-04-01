import { Transaction } from "sequelize";
import { createEUFrameworkQuery, deleteProjectFrameworkEUQuery } from "../utils/eu.utils";
import { createISOFrameworkQuery, deleteProjectFrameworkISOQuery } from "../utils/iso42001.utils";
import { createISO27001FrameworkQuery, deleteProjectFrameworkISO27001Query } from "../utils/iso27001.utils";
import { createNISTAI_RMFFrameworkQuery, deleteProjectFrameworkNISTQuery } from "../utils/nistAiRmfCorrect.utils";

export const frameworkAdditionMap: Record<number, (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction
) => Promise<Object>> = {
  1: createEUFrameworkQuery,
  2: createISOFrameworkQuery,
  3: createISO27001FrameworkQuery,
  4: createNISTAI_RMFFrameworkQuery
};

export const frameworkDeletionMap: Record<number, (id: number, organizationId: number, transaction: Transaction) => Promise<boolean>> = {
  1: deleteProjectFrameworkEUQuery,
  2: deleteProjectFrameworkISOQuery,
  3: deleteProjectFrameworkISO27001Query,
  4: deleteProjectFrameworkNISTQuery
};

export const frameworkFilesDeletionSourceMap: Record<number, string[]> = {
  1: ["Assessment tracker group", "Compliance tracker group"],
  2: ["Management system clauses group", "Reference controls group"],
  3: ["Main clauses group", "Annex controls group"],
  4: ["Subcategories group"]  // Only subcategories are tenant-based and have files
}
