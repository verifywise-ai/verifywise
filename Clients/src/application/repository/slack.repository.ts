import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * The Slack extension's routes (Servers/extensions/slack/slack.route.ts). All
 * of them are Admin only and need the extension enabled.
 */

const BASE = "/extensions/slack/oauth";

/** Notification types a connection can receive; the server accepts exactly these values. */
export const SLACK_ROUTING_TYPES = [
  "Membership and roles",
  "Projects and organizations",
  "Policy reminders and status",
  "Evidence and task alerts",
  "Control or policy changes",
] as const;

export type SlackRoutingType = (typeof SLACK_ROUTING_TYPES)[number];

export interface SlackConnection {
  id: number;
  team_name: string;
  channel: string;
  created_at?: string;
  is_active: boolean;
  routing_type?: string[];
  /** "organization": posts every routed event; "user" (legacy): only its owner's events. */
  delivery_scope?: "organization" | "user";
}

/** A connection of the caller's with no organization. It sends nothing and can only be removed. */
export interface UnlinkedSlackConnection {
  id: number;
  team_name: string;
  channel: string;
  created_at?: string;
}

export async function getSlackConnections(): Promise<SlackConnection[]> {
  const response = await apiServices.get<{ data?: SlackConnection[] }>(`${BASE}/workspaces`);
  return response.data?.data ?? [];
}

/** Exchanges the OAuth code Slack returned for a new connection. */
export async function connectSlackWorkspace(code: string): Promise<void> {
  await apiServices.post(`${BASE}/workspaces`, { code });
}

export async function updateSlackConnection(
  id: number,
  changes: { routing_type?: string[]; is_active?: boolean },
): Promise<void> {
  await apiServices.patch(`${BASE}/workspaces/${id}`, changes);
}

export async function deleteSlackConnection(id: number): Promise<void> {
  await apiServices.delete(`${BASE}/workspaces/${id}`);
}

export async function getUnlinkedSlackConnections(): Promise<UnlinkedSlackConnection[]> {
  const response = await apiServices.get<{ data?: UnlinkedSlackConnection[] }>(`${BASE}/unlinked`);
  return response.data?.data ?? [];
}

export async function deleteUnlinkedSlackConnection(id: number): Promise<void> {
  await apiServices.delete(`${BASE}/unlinked/${id}`);
}
