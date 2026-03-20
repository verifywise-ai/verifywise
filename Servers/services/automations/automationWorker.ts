import { Worker, Job } from "bullmq";
import { REDIS_URL } from "../../database/redis";
import sendEmail from "./actions/sendEmail";
import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import { getAllVendorsQuery } from "../../utils/vendor.utils";
import { sequelize } from "../../database/db";
import { TenantAutomationActionModel } from "../../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { buildVendorReplacements } from "../../utils/automation/vendor.automation.utils";
import { replaceTemplateVariables } from "../../utils/automation/automation.utils";
import { enqueueAutomationAction } from "./automationProducer";
import { uploadFile } from "../../utils/fileUpload.utils";
import { mapReportTypeToFileSource } from "../../controllers/reporting.ctrl";
import { buildReportingReplacements } from "../../utils/automation/reporting.automation.utils";
import { logAutomationExecution } from "../../utils/automationExecutionLog.utils";
import { generateReport } from "../reporting";
import { processPMMHourlyCheck } from "../postMarketMonitoring/pmmScheduler";
import {
  runDailyRollup,
  runMonthlyRollup,
  purgeOldEvents,
  runNightlyRiskScoring,
} from "../shadowAiAggregation.service";
import { runAgentDiscoverySync } from "../agentDiscovery/agentDiscoverySync.service";
import { processScheduledAiDetectionScans } from "../aiDetection/scheduledScanProcessor";
// AI Gateway budget/risk jobs — call AIGateway HTTP endpoints via internal API
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://127.0.0.1:8100";
const AI_GATEWAY_KEY = process.env.AI_GATEWAY_INTERNAL_KEY || "";

async function callAIGateway(method: string, path: string, body?: object): Promise<any> {
  const response = await fetch(`${AI_GATEWAY_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": AI_GATEWAY_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AIGateway ${path} returned ${response.status}: ${text}`);
  }
  return response.json();
}

async function resetAllBudgets(): Promise<void> {
  await callAIGateway("POST", "/internal/budget/reset");
}

async function resetVirtualKeyBudgets(): Promise<void> {
  await callAIGateway("POST", "/internal/virtual-keys/reset-budgets");
}

async function runRiskDetection(): Promise<void> {
  // Get all org IDs with gateway data, then run detection for each
  const orgs = await callAIGateway("GET", "/internal/risk/detection-orgs");
  for (const orgId of orgs.data || []) {
    try {
      await fetch(`${AI_GATEWAY_URL}/internal/risk/detect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": AI_GATEWAY_KEY,
          "x-organization-id": String(orgId),
          "x-user-id": "0",
          "x-role": "Admin",
        },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      console.error(`Risk detection failed for org ${orgId}:`, err);
    }
  }
}
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";
import { readFileSync } from "fs";
import { join } from "path";
import { notifyVendorReviewDue, notifyPolicyDueSoon } from "../inAppNotification.service";
import { getAllPoliciesDueSoonQuery } from "../../utils/policyManager.utils";
import { PolicyManagerModel } from "../../domain.layer/models/policy/policy.model";

const handlers = {
  send_email: sendEmail,
};

async function sendVendorReviewDateNotification() {
  const organizations = await getAllOrganizationsQuery();
  for (let org of organizations) {
    const organizationId = org.id!;
    const vendors = await getAllVendorsQuery(organizationId);
    const automations = (await sequelize.query(`SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        a.params AS automation_params,
        aa.*
      FROM automation_triggers pat
      JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
      JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
      JOIN automation_actions paa ON aa.action_type_id = paa.id
      WHERE pat.key = 'vendor_review_date_approaching' AND a.is_active
      ORDER BY aa."order" ASC;`,
      { replacements: { organizationId } }
    )) as [
      (TenantAutomationActionModel & {
        trigger_key: string;
        action_key: string;
        automation_id: number;
        automation_params: { daysBefore: number };
      })[],
      number,
    ];
    if (automations[0].length === 0) {
      continue;
    }
    const automation = automations[0][0];
    for (let vendor of vendors) {
      const automationParams = automation.automation_params || {};

      const notificationDate = new Date(vendor.review_date!);
      notificationDate.setDate(
        notificationDate.getDate() - (automationParams.daysBefore || 0)
      );
      notificationDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (notificationDate.getTime() !== today.getTime()) {
        continue;
      }
      const params = automation.params!;

      // Build replacements with review information
      const replacements = buildVendorReplacements(vendor);

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });

      // Send in-app + dedicated email notification
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const reviewerUserId = vendor.reviewer || vendor.assignee;
      if (reviewerUserId) {
        try {
          const reviewDateStr = vendor.review_date
            ? new Date(vendor.review_date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "Not set";
          await notifyVendorReviewDue(
            organizationId,
            reviewerUserId,
            {
              id: vendor.id!,
              name: vendor.vendor_name,
              reviewDate: reviewDateStr,
              riskLevel: vendor.risk_score != null ? `Score: ${vendor.risk_score}` : "Not assessed",
              lastReviewDate: undefined,
              projectCount: vendor.projects?.length || 0,
            },
            baseUrl,
          );
        } catch (notifyError) {
          console.error(
            `Failed to send vendor review due notification for vendor ${vendor.id}:`,
            notifyError,
          );
        }
      }
    }
  }
}

async function sendPolicyDueSoonEmailNotification() {
  const organizations = await getAllOrganizationsQuery();
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  for (const org of organizations) {
    const organizationId = org.id!;
    try {
      const policies: PolicyManagerModel[] = await getAllPoliciesDueSoonQuery(organizationId);

      for (const policy of policies) {
        if (!policy.author_id) continue;

        const reviewDate = policy.next_review_date
          ? new Date(policy.next_review_date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : "Not set";

        try {
          await notifyPolicyDueSoon(
            organizationId,
            policy.author_id,
            {
              id: policy.id!,
              name: policy.title,
              projectName: "",
              dueDate: reviewDate,
            },
            baseUrl,
          );
        } catch (notifyError) {
          console.error(
            `Failed to send policy due soon notification for policy ${policy.id}:`,
            notifyError,
          );
        }
      }
    } catch (orgError) {
      console.error(`Error processing org ${org.id} for policy due soon:`, orgError);
    }
  }
}

async function generateAndUploadReport(
  reportType: string,
  userId: number,
  projectId: number,
  frameworkId: number,
  projectFrameworkId: number,
  organizationId: number,
  organizationName: string
) {
  try {
    // Use the new v2 reporting system
    const result = await generateReport(
      {
        projectId,
        frameworkId,
        projectFrameworkId,
        reportType,
        format: "docx",
        branding: {
          organizationName,
        },
      },
      userId,
      organizationId
    );

    if (!result.success) {
      console.error("Report generation failed:", result.error);
      return undefined;
    }

    const docFile = {
      originalname: result.filename,
      buffer: result.content,
      fieldname: "file",
      mimetype: result.mimeType,
    };

    const uploadedFile = await uploadFile(
      docFile,
      userId,
      projectId,
      mapReportTypeToFileSource(reportType),
      organizationId
    );
    return uploadedFile;
  } catch (error) {
    console.error("Report generation/upload error:", error);
    return undefined;
  }
}

async function sendReportNotification() {
  const organizations = await getAllOrganizationsQuery();
  for (let org of organizations) {
    const organizationId = org.id!;
    const automations = (await sequelize.query(`SELECT
        pat.key AS trigger_key,
        paa.key AS action_key,
        a.id AS automation_id,
        a.params AS automation_params,
        a.created_by AS user_id,
        aa.*
      FROM automation_triggers pat
      JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
      JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
      JOIN automation_actions paa ON aa.action_type_id = paa.id
      WHERE pat.key = 'scheduled_report' AND a.is_active
      ORDER BY aa."order" ASC;`,
      { replacements: { organizationId } }
    )) as [
      (TenantAutomationActionModel & {
        trigger_key: string;
        action_key: string;
        automation_id: number;
        automation_params: {
          projectId: string;
          reportType: string[];
          frequency: string;
          hour?: number;
          minute?: number;
          dayOfWeek?: number;
          dayOfMonth?: number;
        };
        user_id: number;
      })[],
      number,
    ];
    if (automations[0].length === 0) {
      continue;
    }
    for (let automation of automations[0]) {
      const params = automation.automation_params || {};
      const today = new Date();
      const frequency = params.frequency || "daily";

      const projectDetails = (await sequelize.query(
        `SELECT
          p.project_title AS project_title,
          p.owner AS owner,
          pf.framework_id AS framework_id,
          pf.id AS project_framework_id
        FROM projects AS p
        INNER JOIN projects_frameworks AS pf ON p.id = pf.project_id AND pf.organization_id = :organizationId
        WHERE p.organization_id = :organizationId AND p.id = :projectId;`,
        {
          replacements: { organizationId, projectId: parseInt(params.projectId) },
        }
      )) as [
        {
          project_title: string;
          owner: number;
          framework_id: number;
          project_framework_id: number;
        }[],
        number,
      ];
      const [[{ full_name }]] = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :userId;`,
        {
          replacements: { userId: projectDetails[0][0].owner },
        }
      )) as [{ full_name: string }[], number];
      const [[{ organization_name }]] = (await sequelize.query(
        `SELECT name FROM organizations WHERE id = :orgId;`,
        {
          replacements: { orgId: org.id },
        }
      )) as [{ organization_name: string }[], number];

      if (frequency === "daily") {
        await enqueueAutomationAction(
          "send_report_notification_daily",
          {
            automation,
            organizationId,
            projectDetails: projectDetails[0][0],
            full_name,
            organization_name,
          },
          {
            runAt: new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
              params.hour || 0,
              params.minute || 0,
              0,
              0
            ),
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
        continue;
      } else if (frequency === "monthly") {
        // if (today.getMonth() === 1 && params.dayOfMonth! > 28 && today.getDate() === 28) {
        // }
        if (today.getMonth() !== params.dayOfMonth! - 1) {
          continue;
        }
      } else if (frequency === "weekly") {
        if (today.getDay() !== params.dayOfWeek) {
          continue;
        }
      }
      await sendReportNotificationEmail({
        automation,
        organizationId,
        projectDetails: projectDetails[0][0],
        full_name,
        organization_name,
      });
    }
  }
}

async function sendReportNotificationEmail(jobData: any) {
  const {
    automation,
    organizationId,
    projectDetails,
    full_name,
    organization_name,
  } = jobData;
  const [[{ exists }]] = (await sequelize.query(
    `SELECT EXISTS(SELECT 1 FROM automation_actions_data WHERE organization_id = :organizationId AND id = :actionId) AS exists;`,
    {
      replacements: { organizationId, actionId: parseInt(automation.id) },
    }
  )) as [{ exists: boolean }[], number];
  if (!exists) {
    console.log(
      `Automation action with ID ${automation.id} does not exist. Skipping job.`
    );
    return;
  }
  const automation_params = automation.automation_params || {};
  const attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[] = [];

  for (let reportType of automation_params.reportType) {
    // Use the new v2 reporting system
    const uploadedFile = await generateAndUploadReport(
      reportType,
      automation.user_id,
      parseInt(automation_params.projectId),
      projectDetails.framework_id,
      projectDetails.project_framework_id,
      organizationId,
      organization_name
    );

    // Add report file as email attachment
    if (uploadedFile) {
      attachments.push({
        filename: uploadedFile.filename,
        content: uploadedFile.content,
        contentType: uploadedFile.type,
      });
    }
  }

  // Build reporting replacements for email template
  const replacements = await buildReportingReplacements({
    reportType: automation_params.reportType,
    frequency: automation_params.frequency,
    organizationId,
    reportLevel: automation_params.reportLevel,
    projectDetails: { ...projectDetails, owner_name: full_name },
  });
  const params = automation.params!;
  // Replace variables in subject and body
  const processedParams = {
    ...params,
    subject: replaceTemplateVariables(params.subject || "", replacements),
    body: replaceTemplateVariables(params.body || "", replacements),
    attachments: attachments,
    automation_id: automation.automation_id,
  };

  // Enqueue with processed params
  await enqueueAutomationAction(automation.action_key, {
    ...processedParams,
    organizationId,
  });
}

export const createAutomationWorker = () => {
  const automationWorker = new Worker(
    "automation-actions",
    async (job: Job) => {
      const name = job.name;
      console.log(`Received job of type: ${name}`);

      let automationId: number | undefined;
      const startTime = Date.now();

      try {
        if (name === "send_vendor_notification") {
          await sendVendorReviewDateNotification();
        } else if (name === "send_policy_due_soon_notification") {
          await sendPolicyDueSoonEmailNotification();
        } else if (name === "send_report_notification") {
          await sendReportNotification();
        } else if (name === "send_report_notification_daily") {
          await sendReportNotificationEmail(job.data);
        } else if (name === "pmm_hourly_check") {
          await processPMMHourlyCheck();
        } else if (name === "shadow_ai_daily_rollup") {
          await runDailyRollup();
        } else if (name === "shadow_ai_monthly_rollup") {
          await runMonthlyRollup();
        } else if (name === "shadow_ai_risk_scoring") {
          await runNightlyRiskScoring();
        } else if (name === "shadow_ai_purge_events") {
          await purgeOldEvents();
        } else if (name === "agent_discovery_sync") {
          await runAgentDiscoverySync();
        } else if (name === "ai_detection_scheduled_scan_check") {
          await processScheduledAiDetectionScans();
        } else if (name === "ai_gateway_budget_reset") {
          await resetAllBudgets();
          await resetVirtualKeyBudgets();
        } else if (name === "ai_gateway_risk_detection") {
          await runRiskDetection();
        } else if (name === "ai_gateway_cache_cleanup") {
          const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://127.0.0.1:8100";
          try {
            const response = await fetch(
              `${AI_GATEWAY_URL}/internal/cache/purge-expired`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-key": process.env.AI_GATEWAY_INTERNAL_KEY || "",
                },
              }
            );
            const result = await response.json() as { deleted?: number };
            console.log(`AI Gateway cache cleanup: ${result.deleted ?? 0} expired entries purged`);
          } catch (err) {
            console.error(`AI Gateway cache cleanup failed: ${err}`);
          }
        } else if (name === "send_pmm_notification") {
          // PMM notification handling - send email using MJML templates
          const { type, data } = job.data;
          const handler = handlers["send_email"];
          if (handler) {
            let subject = "";
            let templateFile = "";
            let recipientEmail = "";

            if (type === "initial") {
              subject = `Post-market monitoring due: ${data.use_case_title}`;
              templateFile = "pmm-initial-notification.mjml";
              recipientEmail = data.stakeholder_email;
            } else if (type === "reminder") {
              subject = `Reminder: Post-market monitoring due soon - ${data.use_case_title}`;
              templateFile = "pmm-reminder.mjml";
              recipientEmail = data.stakeholder_email;
            } else if (type === "escalation") {
              subject = `Escalation: Post-market monitoring overdue - ${data.use_case_title}`;
              templateFile = "pmm-escalation.mjml";
              recipientEmail = data.escalation_contact_email;
            } else if (type === "completed") {
              subject = `Post-market monitoring completed: ${data.use_case_title}`;
              templateFile = "pmm-completed.mjml";
              recipientEmail = data.stakeholder_email;
            } else if (type === "flagged") {
              subject = `Concern flagged: ${data.use_case_title}`;
              templateFile = "pmm-flagged-concern.mjml";
              recipientEmail = data.escalation_contact_email;
            }

            if (templateFile && recipientEmail) {
              // Read and compile MJML template
              const templatePath = join(__dirname, "../../templates", templateFile);
              const mjmlTemplate = readFileSync(templatePath, "utf-8");

              // Convert data values to strings for template replacement
              const templateData: Record<string, string> = {};
              Object.entries(data).forEach(([key, value]) => {
                templateData[key] = String(value ?? "");
              });

              const htmlBody = compileMjmlToHtml(mjmlTemplate, templateData);

              await handler({
                to: [recipientEmail],
                subject,
                body: htmlBody,
              });
            }
          }
        } else {
          // For standard automation actions (like send_email triggered by entity changes)
          const handler = handlers[name as keyof typeof handlers];
          if (!handler) {
            throw new Error(`No handler found for action type: ${name}`);
          }

          // Extract automation context from job data if available
          automationId = job.data.automation_id;
          // triggerData = job.data.trigger_data || {};

          const result = await handler(job.data);

          // Log the execution if we have automation context
          if (automationId) {
            await logAutomationExecution(
              automationId,
              job.data,
              [
                {
                  action_type: name,
                  status: result.success ? "success" : "failure",
                  result_data: {
                    recipients: job.data.to,
                    subject: job.data.subject,
                  },
                  error_message: result.error,
                },
              ],
              job.data.organizationId,
              startTime
            );
          }
        }
      } catch (error) {
        // Log failed execution if we have automation context
        if (automationId) {
          await logAutomationExecution(
            automationId,
            job.data,
            [
              {
                action_type: name,
                status: "failure",
                error_message:
                  error instanceof Error ? error.message : "Unknown error",
              },
            ],
            job.data.organizationId,
            startTime
          );
        }
        throw error;
      }
    },
    { connection: { url: REDIS_URL }, concurrency: 10 }
  );
  automationWorker.on("completed", (job) => {
    console.log(`Job ${job.id} of type ${job.name} has been completed`);
  });
  automationWorker.on("failed", (job, err) => {
    console.error(
      `Job ${job?.id} of type ${job?.name} has failed with error: ${err.message}`
    );
  });
  return automationWorker;
};
