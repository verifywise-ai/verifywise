import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ICreateGroupInput, IGroup, IUpdateGroupInput } from "../../domain/interfaces/i.group";
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  listGroupMembers,
  listGroups,
  listProjectGroups,
  removeGroupMember,
  setGroupMembers,
  setProjectGroups,
  updateGroup,
} from "../repository/group.repository";

export const groupsKeys = {
  all: ["groups"] as const,
  lists: () => [...groupsKeys.all, "list"] as const,
  detail: (id: number | null) => [...groupsKeys.all, "detail", id] as const,
  members: (id: number | null) => [...groupsKeys.all, "members", id] as const,
  projectGroups: (projectId: number | null) => [...groupsKeys.all, "project", projectId] as const,
};

export function useGroups() {
  return useQuery<IGroup[]>({
    queryKey: groupsKeys.lists(),
    queryFn: ({ signal }) => listGroups({ signal }),
  });
}

export function useGroupMembers(groupId: number | null) {
  return useQuery({
    queryKey: groupsKeys.members(groupId),
    queryFn: ({ signal }) => listGroupMembers({ id: groupId!, signal }),
    enabled: groupId !== null,
  });
}

export function useProjectGroups(projectId: number | null) {
  return useQuery({
    queryKey: groupsKeys.projectGroups(projectId),
    queryFn: ({ signal }) => listProjectGroups({ projectId: projectId!, signal }),
    enabled: projectId !== null,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ICreateGroupInput) => createGroup(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupsKeys.lists() });
    },
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: IUpdateGroupInput }) =>
      updateGroup({ id, body }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: groupsKeys.lists() });
      qc.invalidateQueries({ queryKey: groupsKeys.detail(id) });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupsKeys.lists() });
    },
  });
}

export function useAddGroupMembers(groupId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userIds: number[]) => addGroupMembers({ id: groupId, userIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupsKeys.members(groupId) });
      qc.invalidateQueries({ queryKey: groupsKeys.lists() });
    },
  });
}

export function useSetGroupMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIds }: { id: number; userIds: number[] }) =>
      setGroupMembers({ id, userIds }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: groupsKeys.members(id) });
      qc.invalidateQueries({ queryKey: groupsKeys.lists() });
    },
  });
}

export function useRemoveGroupMember(groupId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeGroupMember({ id: groupId, userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupsKeys.members(groupId) });
      qc.invalidateQueries({ queryKey: groupsKeys.lists() });
    },
  });
}

export function useSetProjectGroups(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupIds: number[]) => setProjectGroups({ projectId, groupIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupsKeys.projectGroups(projectId) });
    },
  });
}
