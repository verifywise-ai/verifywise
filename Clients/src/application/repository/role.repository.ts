import { apiServices } from "../../infrastructure/api/networkServices";
import { RoleModel } from "../../domain/models/Common/role/role.model";

export async function getAllRoles({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/roles", {
    signal,
  });
  return response.data;
}

export async function getRoleById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/roles/${id}`, {
    signal,
  });
  return response.data;
}

export async function createRole({ body }: { body: Partial<RoleModel> }): Promise<any> {
  const response = await apiServices.post("/roles", body);
  return response;
}

export async function updateRole({
  id,
  body,
}: {
  id: number;
  body: Partial<RoleModel>;
}): Promise<any> {
  const response = await apiServices.put(`/roles/${id}`, body);
  return response;
}

export async function deleteRole({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/roles/${id}`);
  return response;
}
