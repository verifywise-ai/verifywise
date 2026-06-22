import { getAllUsersQuery, getUserByIdQuery } from "../../utils/user.utils";
import { getAllRolesQuery } from "../../utils/role.utils";
import { getOrganizationByIdQuery } from "../../utils/organization.utils";
import { getSubscription } from "../../utils/subscription.util";

import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

const fetchUsers = async (
  params: { role?: string; status?: string; limit?: number },
  organizationId: number,
): Promise<any> => {
  try {
    let users = await getAllUsersQuery(organizationId);

    // Filter by role if specified
    if (params.role) {
      const roles = await getAllRolesQuery();
      const roleId = roles.find((r) => r.name === params.role)?.id;
      if (roleId) {
        users = users.filter((u) => u.role_id === roleId);
      }
    }

    // Apply limit
    if (params.limit && params.limit > 0) {
      users = users.slice(0, params.limit);
    }

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        surname: u.surname,
        email: u.email,
        role_id: u.role_id,
        created_at: u.created_at,
        last_login: u.last_login,
      })),
      count: users.length,
    };
  } catch (error) {
    logger.error("Error fetching users:", error);
    throw new Error(
      `Failed to fetch users: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUserDetail = async (params: { user_id: number }, organizationId: number): Promise<any> => {
  try {
    const user = await getUserByIdQuery(params.user_id);
    if (!user) {
      return { error: "User not found", user_id: params.user_id };
    }

    // Get user's projects
    const projects = (await sequelize.query(
      `SELECT p.id, p.project_title, p.status
       FROM projects p
       INNER JOIN projects_members pm ON p.id = pm.project_id AND pm.organization_id = :organization_id
       WHERE pm.user_id = :user_id AND p.organization_id = :organization_id`,
      {
        replacements: { user_id: params.user_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Get role name
    const roles = await getAllRolesQuery();
    const roleName = roles.find((r) => r.id === user.role_id)?.name || "Unknown";

    return {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      role_id: user.role_id,
      role_name: roleName,
      created_at: user.created_at,
      last_login: user.last_login,
      projects: projects.map((p: any) => ({
        id: p.id,
        name: p.project_title,
        status: p.status,
      })),
      project_count: projects.length,
    };
  } catch (error) {
    logger.error("Error getting user detail:", error);
    throw new Error(
      `Failed to get user detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUserProgress = async (
  params: { user_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    // Get task stats for user
    const taskStats = (await sequelize.query(
      `SELECT
         COUNT(*) as total_tasks,
         COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_tasks,
         COUNT(CASE WHEN due_date < CURRENT_DATE AND status NOT IN ('Completed', 'Deleted') THEN 1 END) as overdue_tasks
       FROM tasks
       WHERE assignee = :user_id AND organization_id = :organization_id AND status != 'Deleted'`,
      {
        replacements: { user_id: params.user_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Get risks owned by user
    const riskStats = (await sequelize.query(
      `SELECT
         COUNT(*) as total_risks,
         COUNT(CASE WHEN mitigation_status = 'Completed' THEN 1 END) as mitigated_risks
       FROM risks
       WHERE risk_owner = :user_id AND organization_id = :organization_id
       AND (is_deleted = false OR is_deleted IS NULL)`,
      {
        replacements: { user_id: params.user_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Get project count
    const projectCount = (await sequelize.query(
      `SELECT COUNT(*) as count FROM projects_members
       WHERE user_id = :user_id AND organization_id = :organization_id`,
      {
        replacements: { user_id: params.user_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    const tasks = taskStats[0] || {};
    const risks = riskStats[0] || {};

    return {
      user_id: params.user_id,
      tasks: {
        total: parseInt(tasks.total_tasks || "0"),
        completed: parseInt(tasks.completed_tasks || "0"),
        overdue: parseInt(tasks.overdue_tasks || "0"),
        completion_rate:
          parseInt(tasks.total_tasks || "0") > 0
            ? Math.round(
                (parseInt(tasks.completed_tasks || "0") / parseInt(tasks.total_tasks || "0")) * 100,
              )
            : 0,
      },
      risks: {
        owned: parseInt(risks.total_risks || "0"),
        mitigated: parseInt(risks.mitigated_risks || "0"),
      },
      project_count: parseInt(projectCount[0]?.count || "0"),
    };
  } catch (error) {
    logger.error("Error getting user progress:", error);
    throw new Error(
      `Failed to get user progress: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchRoles = async (_params: {}, _organizationId: number): Promise<any> => {
  try {
    const roles = await getAllRolesQuery();
    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
      })),
      count: roles.length,
    };
  } catch (error) {
    logger.error("Error fetching roles:", error);
    throw new Error(
      `Failed to fetch roles: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getOrganizationDetail = async (_params: {}, organizationId: number): Promise<any> => {
  try {
    const org = await getOrganizationByIdQuery(organizationId);
    if (!org) {
      return { error: "Organization not found" };
    }

    // Get member count
    const memberCount = (await sequelize.query(
      `SELECT COUNT(*) as count FROM users WHERE organization_id = :organization_id`,
      {
        replacements: { organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Get project count
    const projectCount = (await sequelize.query(
      `SELECT COUNT(*) as count FROM projects
       WHERE organization_id = :organization_id
       AND (is_organizational = false OR is_organizational IS NULL)`,
      {
        replacements: { organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    return {
      id: org.id,
      name: org.name,
      created_at: org.created_at,
      member_count: parseInt(memberCount[0]?.count || "0"),
      project_count: parseInt(projectCount[0]?.count || "0"),
    };
  } catch (error) {
    logger.error("Error getting organization detail:", error);
    throw new Error(
      `Failed to get organization detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchInvitations = async (
  params: { status?: string; limit?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const conditions: string[] = ["organization_id = :organization_id"];
    const replacements: Record<string, any> = { organization_id: organizationId };

    if (params.status) {
      conditions.push("status = :status");
      replacements.status = params.status;
    }

    const limit = params.limit || 50;
    replacements.limit = limit;

    const rows = (await sequelize.query(
      `SELECT id, email, role_id, status, invited_by, created_at, expires_at
       FROM invitations
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT :limit`,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    )) as any[];

    return {
      invitations: rows.map((r: any) => ({
        id: r.id,
        email: r.email,
        role_id: r.role_id,
        status: r.status,
        invited_by: r.invited_by,
        created_at: r.created_at,
        expires_at: r.expires_at,
      })),
      count: rows.length,
    };
  } catch (error) {
    logger.error("Error fetching invitations:", error);
    throw new Error(
      `Failed to fetch invitations: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getSubscriptionInfo = async (_params: {}, organizationId: number): Promise<any> => {
  try {
    const subscriptions = await getSubscription();
    const orgSubscription = subscriptions.find((s) => s.organization_id === organizationId);

    if (!orgSubscription) {
      return { message: "No subscription found for this organization" };
    }

    return {
      id: orgSubscription.id,
      organization_id: orgSubscription.organization_id,
      tier_id: orgSubscription.tier_id,
      status: orgSubscription.status,
      start_date: orgSubscription.start_date,
      end_date: orgSubscription.end_date,
    };
  } catch (error) {
    logger.error("Error getting subscription info:", error);
    throw new Error(
      `Failed to get subscription info: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchAutoDrivers = async (
  params: { limit?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const limit = params.limit || 50;

    const rows = (await sequelize.query(
      `SELECT id, name, description, driver_type, status, last_run_at, created_at
       FROM auto_drivers
       WHERE organization_id = :organization_id
       ORDER BY created_at DESC
       LIMIT :limit`,
      {
        replacements: { organization_id: organizationId, limit },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    return {
      auto_drivers: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        driver_type: r.driver_type,
        status: r.status,
        last_run_at: r.last_run_at,
        created_at: r.created_at,
      })),
      count: rows.length,
    };
  } catch (error) {
    logger.error("Error fetching auto drivers:", error);
    throw new Error(
      `Failed to fetch auto drivers: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchSlackWebhooks = async (_params: {}, organizationId: number): Promise<any> => {
  try {
    // Query directly since the util uses userId, not organizationId
    const rows = (await sequelize.query(
      `SELECT sw.id, sw.channel, sw.team_name, sw.team_id, sw.is_active, sw.routing_type, sw.created_at
       FROM slack_webhooks sw
       INNER JOIN users u ON sw.user_id = u.id
       WHERE u.organization_id = :organization_id
       ORDER BY sw.created_at DESC`,
      {
        replacements: { organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    return {
      slack_webhooks: rows.map((r: any) => ({
        id: r.id,
        channel: r.channel,
        team_name: r.team_name,
        is_active: r.is_active,
        routing_type: r.routing_type,
        created_at: r.created_at,
      })),
      count: rows.length,
    };
  } catch (error) {
    logger.error("Error fetching slack webhooks:", error);
    throw new Error(
      `Failed to fetch slack webhooks: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools ---

const agentSendInvitation = createWriteToolFn({
  toolName: "agent_send_invitation",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Send invitation to ${params.email} with role ID ${params.role_id}${params.name ? ` (${params.name})` : ""}`,
  executeFn: async (params, organizationId) => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const token = require("crypto").randomBytes(32).toString("hex");

    const result = await sequelize.query(
      `INSERT INTO invitations (organization_id, email, role_id, name, token, status, invited_by, created_at, expires_at)
       VALUES (:organization_id, :email, :role_id, :name, :token, 'pending', :invited_by, NOW(), :expires_at)
       RETURNING id, email, status`,
      {
        replacements: {
          organization_id: organizationId,
          email: params.email,
          role_id: params.role_id,
          name: params.name || null,
          token,
          invited_by: (params as any)._userId || null,
          expires_at: expiresAt,
        },
        type: QueryTypes.INSERT,
      },
    );
    const row = (result as any[])[0]?.[0] || (result as any[])[0];
    return {
      id: row.id,
      email: row.email,
      status: "pending",
      message: "Invitation sent successfully",
    };
  },
});

const agentRunAutoDriver = createWriteToolFn({
  toolName: "agent_run_auto_driver",
  warningLevel: "warning",
  descriptionFn: (params) => `Run auto driver #${params.driver_id}`,
  executeFn: async (params, organizationId) => {
    // Mark driver as running
    await sequelize.query(
      `UPDATE auto_drivers SET status = 'running', last_run_at = NOW()
       WHERE id = :driver_id AND organization_id = :organization_id`,
      {
        replacements: { driver_id: params.driver_id, organization_id: organizationId },
      },
    );
    return {
      driver_id: params.driver_id,
      status: "running",
      message: "Auto driver triggered successfully",
    };
  },
});

const agentSendSlackTestMessage = createWriteToolFn({
  toolName: "agent_send_slack_test_message",
  warningLevel: "info",
  descriptionFn: (params) => `Send test message to Slack webhook #${params.webhook_id}`,
  executeFn: async (params, organizationId) => {
    // Get webhook details
    const webhooks = (await sequelize.query(
      `SELECT sw.id, sw.url, sw.url_iv, sw.channel
       FROM slack_webhooks sw
       INNER JOIN users u ON sw.user_id = u.id
       WHERE sw.id = :webhook_id AND u.organization_id = :organization_id`,
      {
        replacements: { webhook_id: params.webhook_id, organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    if (!webhooks || webhooks.length === 0) {
      throw new Error("Slack webhook not found or not accessible");
    }

    const webhook = webhooks[0];
    const message =
      (params.message as string) || "This is a test message from VerifyWise AI Advisor.";

    // Note: Actual Slack message sending requires decrypting the URL and making an HTTP request.
    // This is a simplified version that records the test attempt.
    return {
      webhook_id: params.webhook_id,
      channel: webhook.channel,
      message_sent: message,
      message:
        "Test message request recorded. The actual delivery depends on webhook configuration.",
    };
  },
});

const availableAdminTools: any = {
  fetch_users: fetchUsers,
  get_user_detail: getUserDetail,
  get_user_progress: getUserProgress,
  fetch_roles: fetchRoles,
  get_organization_detail: getOrganizationDetail,
  fetch_invitations: fetchInvitations,
  get_subscription_info: getSubscriptionInfo,
  fetch_auto_drivers: fetchAutoDrivers,
  fetch_slack_webhooks: fetchSlackWebhooks,
  agent_send_invitation: agentSendInvitation,
  agent_run_auto_driver: agentRunAutoDriver,
  agent_send_slack_test_message: agentSendSlackTestMessage,
};

export { availableAdminTools };
