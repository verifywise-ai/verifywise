import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  FrameworkImportResult,
  FrameworkImportRow,
  ImportedFramework,
  ImportedFrameworkPatch,
} from "../../domain/interfaces/i.frameworkImport";

/** Framework-import extension API (#5254). */
const BASE = "/extensions/framework-import";
type Envelope<T> = { data: T };

export async function downloadFrameworkImportTemplate(): Promise<Blob> {
  const response = await apiServices.get(`${BASE}/template`, { responseType: "blob" });
  return response.data as unknown as Blob;
}

export async function importFramework(rows: FrameworkImportRow[]): Promise<FrameworkImportResult> {
  const response = await apiServices.post<Envelope<FrameworkImportResult>>(`${BASE}/import`, {
    csvData: rows,
  });
  return response.data?.data;
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

export async function deleteImportedFramework(id: number): Promise<void> {
  await apiServices.delete(`${BASE}/imported/${id}`);
}
