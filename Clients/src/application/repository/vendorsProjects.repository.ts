import { apiServices } from "../../infrastructure/api/networkServices";

// Get all vendors
export async function getAllVendors({
  signal,
  responseType = "json",
}: {
  signal?: AbortSignal;
  responseType?: string;
} = {}): Promise<any> {
  const response = await apiServices.get("/vendors", {
    signal,
    responseType,
  });
  return response.data;
}

// Get all vendors for a project
export async function getVendorsByProjectId({
  projectId,
  signal,
  responseType = "json",
}: {
  projectId: number;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/vendors/project-id/${projectId}`, {
    signal,
    responseType,
  });
  return response.data;
}

// Get a vendor by ID
export async function getVendorById({
  id,
  signal,
  responseType = "json",
}: {
  id: number;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/vendors/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

// Create a vendor
export async function createVendor({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/vendors", body);
  return response;
}

// Update a vendor
export async function updateVendor({ id, body }: { id: number; body: any }): Promise<any> {
  const response = await apiServices.patch(`/vendors/${id}`, body);
  return response;
}

// Delete a vendor
export async function deleteVendor({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/vendors/${id}`);
  return response;
}
