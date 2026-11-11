import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  FrameworkImportResult,
  FrameworkImportRow,
  ImportedFramework,
  ImportedFrameworkPatch,
} from "../../domain/interfaces/i.frameworkImport";

/** Framework-import extension API (#5254), served at /api/v1/framework-import. */
const BASE = "/v1/framework-import";
type Envelope<T> = { data: T };

/**
 * A rejected import answers 400 with the full result (per-row errors) under
 * `data`. Return that result so the caller can list the rows; anything else
 * is a real failure and is rethrown.
 */
function validationResultOf(error: unknown): FrameworkImportResult | null {
  const err = error as { status?: number; response?: { data?: unknown } };
  const data = err?.response?.data as Partial<FrameworkImportResult> | undefined;
  if (err?.status === 400 && data && Array.isArray(data.errors)) {
    return data as FrameworkImportResult;
  }
  return null;
}

export async function downloadFrameworkImportTemplate(): Promise<Blob> {
  const response = await apiServices.get(`${BASE}/template`, { responseType: "blob" });
  return response.data as unknown as Blob;
}

export async function importFramework(rows: FrameworkImportRow[]): Promise<FrameworkImportResult> {
  try {
    const response = await apiServices.post<Envelope<FrameworkImportResult>>(`${BASE}/import`, {
      csvData: rows,
    });
    return response.data?.data;
  } catch (error) {
    const result = validationResultOf(error);
    if (result) return result;
    throw error;
  }
}

export async function getImportedFrameworks(): Promise<ImportedFramework[]> {
  const response = await apiServices.get<Envelope<ImportedFramework[]>>(`${BASE}/imported`);
  return response.data?.data ?? [];
}

export async function updateImportedFramework({
  id,
  patch,
}: {
  id: number;
  patch: ImportedFrameworkPatch;
}): Promise<ImportedFramework> {
  const response = await apiServices.patch<Envelope<ImportedFramework>>(
    `${BASE}/imported/${id}`,
    patch,
  );
  return response.data?.data;
}

// The delete dialog shows the refusal (409: still used by a use case) inline,
// so the global error toast would repeat it.
export async function deleteImportedFramework(id: number): Promise<void> {
  await apiServices.delete(`${BASE}/imported/${id}`, { suppressGlobalErrorToast: true });
}
