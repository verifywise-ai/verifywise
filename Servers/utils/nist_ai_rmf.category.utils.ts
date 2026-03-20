import { sequelize } from "../database/db";

/**
 * NIST AI RMF Categories - derived from categories_struct table
 * Categories are grouped by function (GOVERN, MAP, MEASURE, MANAGE)
 */

export interface NISTCategory {
  id: number;
  function: string;
  category_id: number;
  description: string;
  order_no: number;
  title: string;
  index: number;
}

// Map function names to their display titles
const FUNCTION_TITLES: Record<string, string> = {
  GOVERN: "GOVERN",
  MAP: "MAP",
  MEASURE: "MEASURE",
  MANAGE: "MANAGE",
};

function addTitleAndIndex(categories: any[]): NISTCategory[] {
  return categories.map((cat) => ({
    ...cat,
    title: FUNCTION_TITLES[cat.function] || cat.function,
    index: cat.category_id,
  }));
}

/**
 * Get all categories for a given function (e.g., GOVERN, MAP, MEASURE, MANAGE)
 */
export const getAllNISTAIRMFCategoriesByFunctionQuery = async (
  functionName: string,
  _organizationId: number
): Promise<NISTCategory[]> => {
  const [results] = await sequelize.query(
    `SELECT id, function, category_id, description, order_no
     FROM nist_ai_rmf_categories_struct
     WHERE function = :functionName
     ORDER BY order_no ASC, category_id ASC`,
    { replacements: { functionName } }
  );
  return addTitleAndIndex(results);
};

/**
 * Get a specific category by function and category_id
 */
export const getNISTAIRMFCategoryQuery = async (
  functionName: string,
  categoryId: number,
  _organizationId: number
): Promise<NISTCategory | null> => {
  const [results] = await sequelize.query(
    `SELECT id, function, category_id, description, order_no
     FROM nist_ai_rmf_categories_struct
     WHERE function = :functionName AND category_id = :categoryId`,
    { replacements: { functionName, categoryId } }
  );
  const categories = addTitleAndIndex(results);
  return categories[0] || null;
};

/**
 * Get category by its struct id
 */
export const getNISTAIRMFCategoryByIdQuery = async (
  id: number,
  _organizationId: number
): Promise<NISTCategory | null> => {
  const [results] = await sequelize.query(
    `SELECT id, function, category_id, description, order_no
     FROM nist_ai_rmf_categories_struct
     WHERE id = :id`,
    { replacements: { id } }
  );
  const categories = addTitleAndIndex(results);
  return categories[0] || null;
};

/**
 * Get all categories (all functions)
 */
export const getAllNISTAIRMFCategoriesQuery = async (
  _organizationId: number
): Promise<NISTCategory[]> => {
  const [results] = await sequelize.query(
    `SELECT id, function, category_id, description, order_no
     FROM nist_ai_rmf_categories_struct
     ORDER BY
       CASE function
         WHEN 'GOVERN' THEN 1
         WHEN 'MAP' THEN 2
         WHEN 'MEASURE' THEN 3
         WHEN 'MANAGE' THEN 4
         ELSE 5
       END,
       order_no ASC,
       category_id ASC`
  );
  return addTitleAndIndex(results);
};

// Legacy function - kept for backward compatibility
// Maps the old "title" parameter to function name
export const getAllNISTAIRMFCategoriesBytitleQuery = async (
  title: string,
  organizationId: number
): Promise<NISTCategory[]> => {
  // Map old title format to function name (e.g., "Govern" -> "GOVERN")
  const functionName = title.toUpperCase();
  return getAllNISTAIRMFCategoriesByFunctionQuery(functionName, organizationId);
};
