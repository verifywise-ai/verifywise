/**
 * NIST AI RMF Function
 *
 * Functions are derived from the categories_struct table (GOVERN, MAP, MEASURE, MANAGE).
 * There is no separate functions table - this interface defines the shape of
 * function data returned by utility functions.
 */
export interface NISTAIMRFFunctionModel {
  function: string;
  title: string;
  description: string;
  order_no: number;
}

/**
 * NIST AI RMF Function Types
 */
export const NIST_AI_RMF_FUNCTIONS = ['GOVERN', 'MAP', 'MEASURE', 'MANAGE'] as const;
export type NISTAIMRFFunctionType = typeof NIST_AI_RMF_FUNCTIONS[number];
