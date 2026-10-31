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
  const response = await apiServices.post("/vendors", body);
  return response;
}

export async function update({
  id,
  body,
}: {
  id: number;
  body: Partial<VendorModel>;
}): Promise<any> {
  const response = await apiServices.patch(`/vendors/${id}`, body);
  return response;
}

export async function deleteVendor({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/vendors/${id}`);
  return response;
}
