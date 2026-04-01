import { sequelize } from "../database/db";

/**
 * NIST AI RMF Functions - derived from categories_struct table
 * The 4 functions are: GOVERN, MAP, MEASURE, MANAGE
 */

export interface NISTFunction {
  function: string;
  title: string;
  description: string;
  order_no: number;
}

// Function descriptions and order
const FUNCTION_METADATA: Record<string, { title: string; description: string; order_no: number }> = {
  'GOVERN': {
    title: 'Govern',
    description: 'Policies, processes, procedures, and practices across the organization related to the mapping, measuring, and managing of AI risks are in place, transparent, and implemented effectively.',
    order_no: 1,
  },
  'MAP': {
    title: 'Map',
    description: 'Context is established and understood. Categorization of the AI system is performed.',
    order_no: 2,
  },
  'MEASURE': {
    title: 'Measure',
    description: 'Appropriate methods and metrics are identified and applied.',
    order_no: 3,
  },
  'MANAGE': {
    title: 'Manage',
    description: 'AI risks based on assessments and other analytical output from the MAP and MEASURE functions are prioritized, responded to, and managed.',
    order_no: 4,
  },
};

export const getAllNISTAIRMFfunctionsQuery = async (
  _organizationId: number
): Promise<NISTFunction[]> => {
  // Get unique functions from nist_ai_rmf_categories_struct
  const [results] = await sequelize.query(
    `SELECT DISTINCT function FROM nist_ai_rmf_categories_struct ORDER BY function`,
  );

  // Map to function objects with metadata
  const functions: NISTFunction[] = (results as any[]).map((row) => {
    const func = row.function;
    const metadata = FUNCTION_METADATA[func] || { title: func, description: '', order_no: 99 };
    return {
      function: func,
      title: metadata.title,
      description: metadata.description,
      order_no: metadata.order_no,
    };
  });

  // Sort by order_no
  return functions.sort((a, b) => a.order_no - b.order_no);
};

export const getNISTAIRMFfunctionByIdQuery = async (
  functionName: string,
  _organizationId: number
): Promise<NISTFunction | null> => {
  const functions = await getAllNISTAIRMFfunctionsQuery(_organizationId);
  return functions.find((f) => f.function === functionName) || null;
};
