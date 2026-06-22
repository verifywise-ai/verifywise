import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

const fetchShareLinks = async (
  params: { entity_type?: string; entity_id?: number; limit?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const conditions: string[] = ["organization_id = :organization_id"];
    const replacements: Record<string, any> = { organization_id: organizationId };

    if (params.entity_type) {
      conditions.push("resource_type = :entity_type");
      replacements.entity_type = params.entity_type;
    }
    if (params.entity_id) {
      conditions.push("resource_id = :entity_id");
      replacements.entity_id = params.entity_id;
    }

    const limit = params.limit || 50;
    replacements.limit = limit;

    const rows = await sequelize.query(
      `SELECT id, resource_type, resource_id, token, permissions, expires_at, is_active, created_at
       FROM share_links
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT :limit`,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    return {
      share_links: (rows as any[]).map((r: any) => ({
        id: r.id,
        resource_type: r.resource_type,
        resource_id: r.resource_id,
        token: r.token,
        permissions: r.permissions,
        expires_at: r.expires_at,
        is_active: r.is_active,
        created_at: r.created_at,
      })),
      count: (rows as any[]).length,
    };
  } catch (error) {
    logger.error("Error fetching share links:", error);
    throw new Error(
      `Failed to fetch share links: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools ---

const agentCreateShareLink = createWriteToolFn({
  toolName: "agent_create_share_link",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create share link for ${params.entity_type} #${params.entity_id}${params.expires_at ? ` (expires ${params.expires_at})` : ""}`,
  executeFn: async (params, organizationId) => {
    const token = require("crypto").randomBytes(32).toString("hex");
    const result = await sequelize.query(
      `INSERT INTO share_links (organization_id, resource_type, resource_id, token, permissions, expires_at, is_active, created_at)
       VALUES (:organization_id, :resource_type, :resource_id, :token, :permissions, :expires_at, true, NOW())
       RETURNING id, token`,
      {
        replacements: {
          organization_id: organizationId,
          resource_type: params.entity_type,
          resource_id: params.entity_id,
          token,
          permissions: params.permissions || "read",
          expires_at: params.expires_at || null,
        },
        type: QueryTypes.INSERT,
      },
    );
    const row = (result as any[])[0]?.[0] || (result as any[])[0];
    return { id: row.id, token: row.token, message: "Share link created successfully" };
  },
});

const agentRevokeShareLink = createWriteToolFn({
  toolName: "agent_revoke_share_link",
  warningLevel: "danger",
  descriptionFn: (params) => `Revoke share link #${params.link_id}`,
  executeFn: async (params, organizationId) => {
    await sequelize.query(
      `UPDATE share_links SET is_active = false WHERE id = :link_id AND organization_id = :organization_id`,
      {
        replacements: { link_id: params.link_id, organization_id: organizationId },
      },
    );
    return { id: params.link_id, revoked: true, message: "Share link revoked successfully" };
  },
});

const availableShareLinkTools: any = {
  fetch_share_links: fetchShareLinks,
  agent_create_share_link: agentCreateShareLink,
  agent_revoke_share_link: agentRevokeShareLink,
};

export { availableShareLinkTools };
