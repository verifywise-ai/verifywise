import { apiServices } from "../../infrastructure/api/networkServices";
import { VendorModel } from "../../domain/models/Common/vendor/vendor.model";

export async function getAllVendors({
  signal,
  suppressGlobalErrorToast,
}: {
  signal?: AbortSignal;
  /** Skip the global error toast; the caller shows its own message. */
  suppressGlobalErrorToast?: boolean;
} = {}): Promise<any> {
  const response = await apiServices.get("/vendors", {
    signal,
    ...(suppressGlobalErrorToast ? { suppressGlobalErrorToast } : {}),
  });
  return response.data;
}

export async function getVendorById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/vendors/${id}`, {
    signal,
  });
  return response.data;
}

export async function getVendorsByProjectId({
  projectId,
  signal,
  suppressGlobalErrorToast,
}: {
  projectId: number;
  signal?: AbortSignal;
  /** Skip the global error toast; the caller shows its own message. */
  suppressGlobalErrorToast?: boolean;
}): Promise<any> {
  const response = await apiServices.get(`/vendors/project-id/${projectId}`, {
    signal,
    ...(suppressGlobalErrorToast ? { suppressGlobalErrorToast } : {}),
  });
  return response.data;
}

export async function createNewVendor({ body }: { body: Partial<VendorModel> }): Promise<any> {
  // ADR 0001: the body takes the other names and the identifiers, so the create is under /v1.
  const response = await apiServices.post("/v1/vendors", body);
  return response;
}

export async function update({
  id,
  body,
}: {
  id: number;
  body: Partial<VendorModel>;
}): Promise<any> {
  // ADR 0001: as the create. The reads and the delete did not change, so they stay on /vendors.
  const response = await apiServices.patch(`/v1/vendors/${id}`, body);
  return response;
}

export async function deleteVendor({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/vendors/${id}`);
  return response;
}
