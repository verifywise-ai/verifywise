import { apiServices } from "../../infrastructure/api/networkServices";
import { SubControlModel } from "../../domain/models/EU-AI-Act/subcontrol/subControl.model";

export async function getSubcontrolById({
  id,
  signal,
  responseType = "json",
}: {
  id: number;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/subcontrols/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

export async function createSubcontrol({ body }: { body: Partial<SubControlModel> }): Promise<any> {
  const response = await apiServices.post("/subcontrols", body);
  return response;
}

export async function updateSubcontrol({
  id,
  body,
}: {
  id: number;
  body: Partial<SubControlModel>;
}): Promise<any> {
  const response = await apiServices.patch(`/subcontrols/${id}`, body);
  return response;
}

export async function deleteSubcontrol({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/subcontrols/${id}`);
  return response;
}
