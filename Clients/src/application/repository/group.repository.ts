import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  ICreateGroupInput,
  IGroup,
  IGroupMember,
  IUpdateGroupInput,
} from "../../domain/interfaces/i.group";

// Backend wraps every payload in STATUS_CODE[xxx](...) → { message, data }.
type Envelope<T> = { data: T; message?: string };

export async function listGroups({ signal }: { signal?: AbortSignal } = {}): Promise<IGroup[]> {
  const response = await apiServices.get<Envelope<IGroup[]>>("/groups", { signal });
  return response.data?.data ?? [];
}

export async function getGroupById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<IGroup | null> {
  const response = await apiServices.get<Envelope<IGroup>>(`/groups/${id}`, { signal });
  return response.data?.data ?? null;
}

export async function createGroup(body: ICreateGroupInput): Promise<IGroup> {
  const response = await apiServices.post<Envelope<IGroup>>("/groups", body);
  return response.data.data;
}

export async function updateGroup({
  id,
  body,
}: {
  id: number;
  body: IUpdateGroupInput;
}): Promise<IGroup> {
  const response = await apiServices.patch<Envelope<IGroup>>(`/groups/${id}`, body);
  return response.data.data;
}

export async function deleteGroup(id: number): Promise<void> {
  await apiServices.delete(`/groups/${id}`);
}

export async function listGroupMembers({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<IGroupMember[]> {
  const response = await apiServices.get<Envelope<IGroupMember[]>>(`/groups/${id}/members`, {
    signal,
  });
  return response.data?.data ?? [];
}

export async function addGroupMembers({
  id,
  userIds,
}: {
  id: number;
  userIds: number[];
}): Promise<{ added: number }> {
  const response = await apiServices.post<Envelope<{ added: number }>>(`/groups/${id}/members`, {
    userIds,
  });
  return response.data?.data ?? { added: 0 };
}

export async function setGroupMembers({
  id,
  userIds,
}: {
  id: number;
  userIds: number[];
}): Promise<void> {
  await apiServices.put(`/groups/${id}/members`, { userIds });
}

export async function removeGroupMember({
  id,
  userId,
}: {
  id: number;
  userId: number;
}): Promise<void> {
  await apiServices.delete(`/groups/${id}/members/${userId}`);
}

export async function listProjectGroups({
  projectId,
  signal,
}: {
  projectId: number;
  signal?: AbortSignal;
}): Promise<IGroup[]> {
  const response = await apiServices.get<Envelope<IGroup[]>>(
    `/groups/projects/${projectId}/groups`,
    { signal },
  );
  return response.data?.data ?? [];
}

export async function setProjectGroups({
  projectId,
  groupIds,
}: {
  projectId: number;
  groupIds: number[];
}): Promise<void> {
  await apiServices.put(`/groups/projects/${projectId}/groups`, { groupIds });
}
