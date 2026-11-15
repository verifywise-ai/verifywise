import { apiServices } from "../../infrastructure/api/networkServices";

/** Risk import extension: the import is served at /api/v1/risk-import, the template at /api/extensions/risk-import. */
const IMPORT_URL = "/v1/risk-import/import";

export interface RiskImportError {
  row: number;
  field: string;
  message: string;
}

export interface RiskImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: RiskImportError[];
  importedAt: string;
}

/**
 * A rejected import answers 400 with the full result (per-row errors) under
 * `data`; apiServices throws it as a CustomException carrying the response
 * body. Return that result so the caller can list the rows; anything else is a
 * real failure and is rethrown.
 */
function rejectedResultOf(error: unknown): RiskImportResult | null {
  const err = error as { status?: number; response?: { data?: unknown } };
  const data = err?.response?.data as Partial<RiskImportResult> | undefined;
  if (err?.status === 400 && data && Array.isArray(data.errors)) {
    return data as RiskImportResult;
  }
  return null;
}

export async function importRisks(rows: unknown[]): Promise<RiskImportResult | undefined> {
  try {
    const response = await apiServices.post<{ data?: RiskImportResult }>(IMPORT_URL, {
      csvData: rows,
    });
    return response.data?.data;
  } catch (error) {
    const result = rejectedResultOf(error);
    if (result) return result;
    throw error;
  }
}
