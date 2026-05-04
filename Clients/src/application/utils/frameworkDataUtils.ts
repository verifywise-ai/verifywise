/**
 * Framework Data Processing Utilities
 *
 * Centralized utilities for processing ISO 42001 and ISO 27001 framework data
 * to reduce code duplication and improve maintainability.
 */

import { isISO27001 } from "../constants/frameworks";

/**
 * Common interfaces used across framework components
 */
export interface BaseFrameworkData {
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
}

export interface SubClauseData {
  id: number;
  title: string;
  status: string;
  owner?: number | null;
}

export interface ClauseData {
  id: number;
  title: string;
  clause_no: string;
  arrangement: string;
  subClauses: SubClauseData[];
}

export interface AnnexItemData {
  id: number;
  title: string;
  status: string;
  owner?: number | null;
}

export interface AnnexData {
  id: number;
  title: string;
  annex_no?: string;
  arrangement?: string;
  annexcontrols?: AnnexItemData[];
  annexCategories?: AnnexItemData[];
  annexControls?: AnnexItemData[];
}

/**
 * Response validation utility for API responses
 */
export interface ValidationResult {
  isValid: boolean;
  data: any[];
  error?: string;
}

/**
 * Validates API response structure and extracts array data
 * @param response - API response to validate
 * @param frameworkName - Framework name for error context
 * @param dataType - Type of data being validated (e.g., 'clauses', 'annexes')
 * @returns Validation result with extracted data or error information
 */
export const validateApiResponse = (
  response: any,
  frameworkName: string,
  dataType: string,
): ValidationResult => {
  if (!response) {
    return {
      isValid: false,
      data: [],
      error: `Null response received for ${frameworkName} ${dataType}`,
    };
  }

  // Handle different response structures
  let extractedData: any[] = [];

  if (Array.isArray(response)) {
    extractedData = response;
  } else if (response.data) {
    if (Array.isArray(response.data)) {
      extractedData = response.data;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      extractedData = response.data.data;
    } else {
      return {
        isValid: false,
        data: [],
        error: `Invalid nested data structure in ${frameworkName} ${dataType} response`,
      };
    }
  } else {
    return {
      isValid: false,
      data: [],
      error: `Unexpected response structure for ${frameworkName} ${dataType}`,
    };
  }

  if (!Array.isArray(extractedData)) {
    return {
      isValid: false,
      data: [],
      error: `Data is not an array for ${frameworkName} ${dataType}`,
    };
  }

  return {
    isValid: true,
    data: extractedData,
    error: undefined,
  };
};

/**
 * Validates and processes subclauses/items with proper error handling
 * @param items - Raw subclause/item data
 * @param parentId - Parent clause/annex identifier for error context
 * @param frameworkName - Framework name for error context
 * @returns Processed array of valid subclauses/items
 */
export const processSubItems = (
  items: any[],
  parentId: string | number,
  frameworkName: string,
): SubClauseData[] => {
  if (!Array.isArray(items)) {
    console.warn(`Invalid subclauses structure in ${frameworkName} item ${parentId}: not an array`);
    return [];
  }

  return items
    .map((item: any) => {
      if (!item || typeof item !== "object") {
        console.warn(`Invalid subclause structure in ${frameworkName} item ${parentId}:`, item);
        return null;
      }

      return {
        id: Number(item.id) || 0,
        title: String(item.title || "Untitled"),
        status: String(item.status || "Not started"),
        owner: item.owner !== null && item.owner !== undefined ? Number(item.owner) : null,
      };
    })
    .filter(Boolean) as SubClauseData[];
};

/**
 * Calculates completion and assignment percentages for items
 * @param items - Array of processed items
 * @returns Object with completion and assignment percentages
 */
export const calculateItemPercentages = (items: SubClauseData[]) => {
  if (items.length === 0) {
    return {
      completionPercentage: 0,
      assignmentPercentage: 0,
    };
  }

  // Calculate completion percentage (implemented items)
  const implementedCount = items.filter((item) => item.status === "Implemented").length;
  const completionPercentage = Math.round((implementedCount / items.length) * 100);

  // Calculate assignment percentage (items with owner assigned)
  const assignedCount = items.filter(
    (item) => item.owner !== null && item.owner !== undefined,
  ).length;
  const assignmentPercentage = Math.round((assignedCount / items.length) * 100);

  return {
    completionPercentage,
    assignmentPercentage,
  };
};

/**
 * Validates clause number range for ISO frameworks (4-10)
 * @param clause - Clause data to validate
 * @param frameworkName - Framework name for error context
 * @returns True if clause number is in valid range
 */
export const isValidClauseNumber = (clause: any, frameworkName: string): boolean => {
  if (!clause) {
    console.warn(`Invalid clause structure in ${frameworkName} data:`, clause);
    return false;
  }

  // Different frameworks use different field names
  let clauseNumber: number;

  if (isISO27001(0, frameworkName)) {
    // ISO 27001 uses 'arrangement' field
    if (typeof clause.arrangement === "undefined" && typeof clause.clause_no === "undefined") {
      console.warn(`Missing clause number in ${frameworkName} data:`, clause);
      return false;
    }
    clauseNumber = parseInt(clause.arrangement || clause.clause_no);
  } else {
    // ISO 42001 uses 'clause_no' field
    if (typeof clause.clause_no === "undefined") {
      console.warn(`Missing clause_no in ${frameworkName} data:`, clause);
      return false;
    }
    clauseNumber = parseInt(clause.clause_no);
  }

  if (isNaN(clauseNumber)) {
    console.warn(`Invalid clause number in ${frameworkName} data:`, clause);
    return false;
  }

  return clauseNumber >= 4 && clauseNumber <= 10;
};

/**
 * Extracts clause number from clause data based on framework type
 * @param clause - Clause data
 * @param frameworkName - Framework name to determine field to use
 * @returns Parsed clause number
 */
export const getClauseNumber = (clause: any, frameworkName: string): number => {
  if (isISO27001(0, frameworkName)) {
    return parseInt(clause.arrangement || clause.clause_no);
  }
  return parseInt(clause.clause_no);
};

/**
 * Validates data consistency (assigned <= total)
 * @param assigned - Number of assigned items
 * @param total - Total number of items
 * @param dataType - Type of data for error context
 * @param frameworkName - Framework name for error context
 * @returns Validated assigned count (capped at total if inconsistent)
 */
export const validateDataConsistency = (
  assigned: number,
  total: number,
  dataType: string,
  frameworkName: string,
): number => {
  if (assigned > total) {
    console.warn(
      `Inconsistent ${dataType} data for ${frameworkName}: assigned (${assigned}) > total (${total})`,
    );
    return total;
  }
  return assigned;
};

/**
 * Annex number processing result
 */
export interface AnnexNumberResult {
  displayNumber: string;
  cleanTitle: string;
}

/**
 * Extracts and processes annex numbers from titles, handling both embedded and separate numbering
 * @param annex - Annex data with title and optional numbering fields
 * @param frameworkName - Framework name to determine numbering strategy
 * @returns Processed display number and clean title
 */
export const processAnnexNumber = (annex: AnnexData, frameworkName: string): AnnexNumberResult => {
  let cleanTitle = annex.title;
  let displayNumber = "";

  // Check if title already starts with annex number (like "A.5 Organizational...")
  const annexNumberRegex = /^A\.\d+\s*/;

  if (annexNumberRegex.test(cleanTitle)) {
    // Extract the number and clean title
    const match = cleanTitle.match(/^(A\.\d+)\s*(.+)$/);
    if (match) {
      displayNumber = match[1]; // "A.5"
      cleanTitle = match[2]; // "Organizational policies and governance"
    }
  } else {
    // Generate annex number based on framework type and available data
    if (isISO27001(0, frameworkName)) {
      // For ISO 27001, use id + 4 to get correct annex numbers (id 1->A.5, 2->A.6, 3->A.7, 4->A.8)
      const annexNumber = annex.id + 4; // Maps id 1,2,3,4 to 5,6,7,8
      displayNumber = `A.${annexNumber}`;
    } else {
      // For other frameworks (like ISO 42001), use arrangement/annex_no
      const annexNumber = annex.arrangement || annex.annex_no || annex.id;
      displayNumber = `A.${annexNumber}`;
    }
  }

  return {
    displayNumber,
    cleanTitle,
  };
};

/**
 * Clamps a value to prevent negative numbers
 * @param value - Value to clamp
 * @param min - Minimum value (default: 0)
 * @returns Clamped value
 */
export const clampValue = (value: number, min: number = 0): number => {
  return Math.max(value, min);
};

/**
 * Checks if HTTP response status indicates success (2xx range)
 * @param status - HTTP status code
 * @returns True if status is in 2xx range
 */
export const isSuccessResponse = (status: number): boolean => {
  return status >= 200 && status < 300;
};

/**
 * Creates detailed error logging information for API failures
 * @param error - Error object or message
 * @param context - Additional context information
 * @returns Formatted error object for logging
 */
export const createErrorLogData = (
  error: any,
  context: {
    frameworkName: string;
    projectFrameworkId: number;
    operation: string;
    routeUrl?: string;
    [key: string]: any;
  },
) => {
  return {
    error: error instanceof Error ? error.message : error,
    timestamp: new Date().toISOString(),
    ...context,
  };
};
