import { apiServices } from "../../infrastructure/api/networkServices";
import { VendorRiskModel } from "../../domain/models/Common/vendorRisk/vendorRisk.model";

export async function getAllVendorRisks({
  signal,
  filter = "active",
}: {
  signal?: AbortSignal;
  filter?: "active" | "deleted" | "all";
} = {}): Promise<any> {
  const response = await apiServices.get(`/vendorRisks/all?filter=${filter}`, {
    signal,
  });
  return response.data;
}

export async function getVendorRisksByProjectId({
  projectId,
  signal,
  filter = "active",
}: {
  projectId: number;
  signal?: AbortSignal;
  filter?: "active" | "deleted" | "all";
}): Promise<any> {
  const response = await apiServices.get(`/vendorRisks/by-projid/${projectId}?filter=${filter}`, {
    signal,
  });
  return response.data;
}

export async function getVendorRisksByVendorId({
  vendorId,
  signal,
  filter = "active",
}: {
  vendorId: number;
  signal?: AbortSignal;
  filter?: "active" | "deleted" | "all";
}): Promise<any> {
  const response = await apiServices.get(`/vendorRisks/by-vendorid/${vendorId}?filter=${filter}`, {
    signal,
  });
  return response.data;
}

/** A vendor risk, deleted ones included (with is_deleted) so they open read-only. */
export async function getVendorRiskById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/v1/vendor-risks/${id}`, {
    signal,
  });
  return response.data;
}

export async function createVendorRisk({ body }: { body: Partial<VendorRiskModel> }): Promise<any> {
  const response = await apiServices.post("/vendorRisks", body);
  return response;
}

export async function updateVendorRisk({
  id,
  body,
}: {
  id: number;
  body: Partial<VendorRiskModel>;
}): Promise<any> {
  const response = await apiServices.patch(`/vendorRisks/${id}`, body);
  return response;
}

export async function deleteVendorRisk({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/vendorRisks/${id}`);
  return response;
}

/** Restores a deleted vendor risk (vendor.edit). */
export async function restoreVendorRisk({ id }: { id: number }): Promise<any> {
  const response = await apiServices.patch(`/v1/vendor-risks/${id}/restore`);
  return response;
}

export async function getVendorRisksByFrameworkId({
  frameworkId,
  signal,
  filter = "active",
}: {
  frameworkId: number;
  signal?: AbortSignal;
  filter?: "active" | "deleted" | "all";
}): Promise<any> {
  const response = await apiServices.get(
    `/vendorRisks/by-frameworkid/${frameworkId}?filter=${filter}`,
    {
      signal,
    },
  );
  return response.data;
}
