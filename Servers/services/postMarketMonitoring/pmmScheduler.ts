/**
 * Post-Market Monitoring Scheduler Service
 *
 * This service handles the automated scheduling and notification flow for PMM:
 * 1. Creates new cycles when due
 * 2. Sends initial notifications
 * 3. Sends reminders
 * 4. Handles escalations
 * 5. Schedules PDF report generation after completion
 */

import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import { sequelize } from "../../database/db";
import {
  getActiveConfigsForNotificationHourQuery,
  getPendingCyclesForProcessingQuery,
  createPMMCycleQuery,
  getLatestCycleNumberQuery,
  markCycleReminderSentQuery,
  markCycleEscalationSentQuery,
  getAssignedStakeholderQuery,
  getActiveCycleByConfigIdQuery,
} from "../../utils/postMarketMonitoring.utils";
import {
  IPMMConfigWithDetails,
  IPMMCycleWithDetails,
  IPMMNotificationData,
  IPMMEscalationData,
} from "../../domain.layer/interfaces/i.postMarketMonitoring";
import { enqueueAutomationAction } from "../automations/automationProducer";
import logger from "../../utils/logger/fileLogger";

const BASE_URL = process.env.BASE_URL || "http://localhost:5173";

/**
 * Calculate next due date based on frequency settings
 */
function calculateNextDueDate(
  frequencyValue: number,
  frequencyUnit: string,
  startDate?: Date | string
): Date {
  const start = startDate ? new Date(startDate) : new Date();
  const dueDate = new Date(start);

  switch (frequencyUnit) {
    case "days":
      dueDate.setDate(dueDate.getDate() + frequencyValue);
      break;
    case "weeks":
      dueDate.setDate(dueDate.getDate() + frequencyValue * 7);
      break;
    case "months":
      dueDate.setMonth(dueDate.getMonth() + frequencyValue);
      break;
    default:
      dueDate.setDate(dueDate.getDate() + frequencyValue);
  }

  return dueDate;
}

/**
 * Build notification data for email
 */
function buildNotificationData(
  cycle: IPMMCycleWithDetails,
  config: any,
  organizationName: string
): IPMMNotificationData {
  const dueDate = new Date(cycle.due_at);
  const now = new Date();
  const daysRemaining = Math.ceil(
    (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    stakeholder_name: cycle.stakeholder_name || "Team Member",
    stakeholder_email: cycle.stakeholder_email || "",
    use_case_title: cycle.project_title || "Unknown Use Case",
    use_case_id: config.project_id,
    cycle_number: cycle.cycle_number,
    due_date: dueDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    days_remaining: daysRemaining,
    monitoring_link: `${BASE_URL}/project/${config.project_id}/post-market-monitoring`,
    organization_name: organizationName,
  };
}

/**
 * Build escalation data for email
 */
function buildEscalationData(
  cycle: IPMMCycleWithDetails,
  config: any,
  organizationName: string
): IPMMEscalationData {
  const dueDate = new Date(cycle.due_at);
  const now = new Date();
  const daysOverdue = Math.floor(
    (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const notificationData = buildNotificationData(cycle, config, organizationName);

  return {
    ...notificationData,
    escalation_contact_name: (config as any).escalation_contact_name || "Admin",
    escalation_contact_email: (config as any).escalation_contact_email || "",
    days_overdue: daysOverdue,
  };
}

/**
 * Create a new monitoring cycle for a config
 */
async function createNewCycle(
  config: IPMMConfigWithDetails,
  organizationId: number
): Promise<void> {
  const transaction = await sequelize.transaction();

  try {
    // Check if there's already an active cycle
    const existingCycle = await getActiveCycleByConfigIdQuery(config.id!, organizationId);
    if (existingCycle) {
      await transaction.rollback();
      return; // Don't create if there's already an active cycle
    }

    // Get next cycle number
    const latestCycleNumber = await getLatestCycleNumberQuery(config.id!, organizationId);
    const nextCycleNumber = latestCycleNumber + 1;

    // Calculate due date
    const dueDate = calculateNextDueDate(
      config.frequency_value,
      config.frequency_unit,
      config.start_date
    );

    // Get stakeholder
    const stakeholder = await getAssignedStakeholderQuery(config.project_id, organizationId);

    // Create cycle
    await createPMMCycleQuery(
      config.id!,
      nextCycleNumber,
      dueDate,
      stakeholder?.id || null,
      organizationId,
      transaction
    );

    await transaction.commit();

    logger.info(
      `Created PMM cycle #${nextCycleNumber} for config ${config.id} (project: ${config.project_id})`
    );
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error creating PMM cycle for config ${config.id}:`, error);
    throw error;
  }
}

/**
 * Send initial notification for a cycle
 */
async function sendInitialNotification(
  cycle: IPMMCycleWithDetails,
  config: any,
  organizationName: string,
  organizationId: number
): Promise<void> {
  const notificationData = buildNotificationData(cycle, config, organizationName);

  if (!notificationData.stakeholder_email) {
    logger.warn(
      `No stakeholder email for cycle ${cycle.id}, skipping initial notification`
    );
    return;
  }

  await enqueueAutomationAction("send_pmm_notification", {
    type: "initial",
    data: notificationData,
    organizationId,
  });

  logger.info(
    `Sent initial PMM notification for cycle ${cycle.id} to ${notificationData.stakeholder_email}`
  );
}

/**
 * Send reminder notification for a cycle
 */
async function sendReminderNotification(
  cycle: IPMMCycleWithDetails,
  config: any,
  organizationName: string,
  organizationId: number
): Promise<void> {
  const notificationData = buildNotificationData(cycle, config, organizationName);

  if (!notificationData.stakeholder_email) {
    logger.warn(
      `No stakeholder email for cycle ${cycle.id}, skipping reminder notification`
    );
    return;
  }

  await enqueueAutomationAction("send_pmm_notification", {
    type: "reminder",
    data: notificationData,
    organizationId,
  });

  await markCycleReminderSentQuery(cycle.id!, organizationId);

  logger.info(
    `Sent reminder PMM notification for cycle ${cycle.id} to ${notificationData.stakeholder_email}`
  );
}

/**
 * Send escalation notification
 */
async function sendEscalationNotification(
  cycle: IPMMCycleWithDetails,
  config: any,
  organizationName: string,
  organizationId: number
): Promise<void> {
  const escalationData = buildEscalationData(cycle, config, organizationName);

  if (!escalationData.escalation_contact_email) {
    logger.warn(
      `No escalation contact email for cycle ${cycle.id}, skipping escalation`
    );
    return;
  }

  await enqueueAutomationAction("send_pmm_notification", {
    type: "escalation",
    data: escalationData,
    organizationId,
  });

  await markCycleEscalationSentQuery(cycle.id!, organizationId);

  logger.info(
    `Sent escalation PMM notification for cycle ${cycle.id} to ${escalationData.escalation_contact_email}`
  );
}

/**
 * Process pending cycles for an organization
 */
async function processPendingCycles(
  organizationId: number,
  organizationName: string
): Promise<void> {
  const cycles = await getPendingCyclesForProcessingQuery(organizationId);

  for (const cycle of cycles) {
    const config = cycle as any; // Contains joined config data
    const now = new Date();
    const dueDate = new Date(cycle.due_at);
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysOverdue = Math.floor(
      (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if cycle just started (same day) and no notification sent
    if (cycle.status === "pending" && !cycle.reminder_sent_at && !cycle.escalation_sent_at) {
      // Send initial notification on the start day
      const startDate = new Date(cycle.started_at);
      if (
        startDate.toDateString() === now.toDateString() ||
        daysUntilDue <= config.reminder_days
      ) {
        await sendInitialNotification(cycle, config, organizationName, organizationId);
      }
    }

    // Check if reminder should be sent
    if (
      !cycle.reminder_sent_at &&
      daysUntilDue <= config.reminder_days &&
      daysUntilDue > 0
    ) {
      await sendReminderNotification(cycle, config, organizationName, organizationId);
    }

    // Check if escalation should be sent
    if (
      !cycle.escalation_sent_at &&
      daysOverdue >= config.escalation_days &&
      cycle.status !== "completed"
    ) {
      await sendEscalationNotification(cycle, config, organizationName, organizationId);
    }
  }
}

/**
 * Check and create new cycles for configs where the current cycle is completed
 * or where no cycle exists yet
 */
async function checkAndCreateNewCycles(
  organizationId: number,
  currentHour: number
): Promise<void> {
  const configs = await getActiveConfigsForNotificationHourQuery(currentHour, organizationId);

  for (const config of configs) {
    // Check if there's an active cycle
    const activeCycle = await getActiveCycleByConfigIdQuery(config.id!, organizationId);

    if (!activeCycle) {
      // No active cycle, create one if start_date allows
      if (config.start_date) {
        const startDate = new Date(config.start_date);
        if (startDate <= new Date()) {
          await createNewCycle(config, organizationId);
        }
      } else {
        // No start_date specified, create immediately
        await createNewCycle(config, organizationId);
      }
    }
  }
}

/**
 * Main PMM hourly check function
 * This is called by the automation worker every hour
 */
export async function processPMMHourlyCheck(): Promise<void> {
  const currentHour = new Date().getHours();
  logger.info(`Running PMM hourly check at hour ${currentHour}`);

  const organizations = await getAllOrganizationsQuery();

  for (const org of organizations) {
    const organizationId = org.id!;
    const organizationName = org.name || "Organization";

    try {
      // Check if we should create new cycles (at the notification hour)
      await checkAndCreateNewCycles(organizationId, currentHour);

      // Process pending cycles (reminders, escalations)
      await processPendingCycles(organizationId, organizationName);
    } catch (error) {
      logger.error(`Error processing PMM for organization ${org.id}:`, error);
      // Continue with next organization
    }
  }

  logger.info("PMM hourly check completed");
}

/**
 * Schedule PMM check job in the automation queue
 */
export async function schedulePMMCheck(): Promise<void> {
  const { automationQueue } = await import("../automations/automationProducer");

  logger.info("Adding PMM hourly check jobs to the queue...");

  await automationQueue.add(
    "pmm_hourly_check",
    { type: "pmm" },
    {
      repeat: {
        pattern: "0 * * * *", // Every hour at minute 0
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}
