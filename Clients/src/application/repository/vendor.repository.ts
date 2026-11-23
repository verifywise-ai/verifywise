import { apiServices } from "../../infrastructure/api/networkServices";
import { VendorModel } from "../../domain/models/Common/vendor/vendor.model";
import { RequestParams } from "../../infrastructure/api/api.types";

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

/** `config` lets a caller that shows its own error turn off the global toast. */
export async function createNewVendor({
  body,
  config,
}: {
  body: Partial<VendorModel>;
  config?: RequestParams;
}): Promise<any> {
  const response = await apiServices.post("/vendors", body, config);
  return response;
}

export async function update({
  id,
  body,
  config,
}: {
  id: number;
  body: Partial<VendorModel>;
  config?: RequestParams;
}): Promise<any> {
  const response = await apiServices.patch(`/vendors/${id}`, body, config);
  return response;
}

export async function deleteVendor({
  id,
  config,
}: {
  id: number;
  config?: RequestParams;
}): Promise<any> {
  const response = await apiServices.delete(`/vendors/${id}`, config);
  return response;
}
