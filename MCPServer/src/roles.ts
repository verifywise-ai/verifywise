/**
 * Role name to id resolution.
 *
 * Role ids are not hardcoded here. The backend resolves role names from the
 * roles table at runtime (Servers/utils/roleMap.ts), so a role added or renamed
 * there would silently break a baked-in mapping.
 */

import { request } from "./client.js";
import type { Profile } from "./config.js";

interface Role {
  id: number;
  name: string;
}

export async function resolveRoleId(profile: Profile, roleName: string): Promise<Role> {
  const { data } = await request<Role[]>(profile, "GET", "/api/roles");

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${profile.name} returned no roles, so "${roleName}" cannot be resolved.`);
  }

  const wanted = roleName.trim().toLowerCase();
  const match = data.find((role) => String(role.name).trim().toLowerCase() === wanted);

  if (!match) {
    const available = data.map((role) => role.name).join(", ");
    throw new Error(`Unknown role "${roleName}" on ${profile.name}. Available roles: ${available}`);
  }

  return { id: match.id, name: match.name };
}
