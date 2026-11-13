/**
 * Groups / teams (#5253, VW-CQ-01).
 *
 * Mirrors Servers/utils/group.utils.ts. Groups are organization-scoped;
 * attaching a group to a use case grants every member access.
 */

export interface IGroup {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  member_count?: number;
}

export interface IGroupMember {
  user_id: number;
  name: string;
  surname: string;
  email: string;
}

export interface ICreateGroupInput {
  name: string;
  description?: string | null;
}

export interface IUpdateGroupInput {
  name?: string;
  description?: string | null;
}
