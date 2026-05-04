/**
 * Seed automation execution logs with demo data
 * Run with: npx ts-node scripts/seed-automation-logs.ts
 */

import { sequelize } from "../database/db";
import { AutomationModel } from "../domain.layer/models/automation/automation.model";
import { AutomationExecutionLogModel } from "../domain.layer/models/automationExecutionLog/automationExecutionLog.model";

// Generate random execution time
function randomExecutionTime() {
  return Math.floor(Math.random() * 3000) + 500; // 500ms to 3500ms
}

// Generate random date in the past (last 30 days)
function randomDateInPast(daysBack = 30) {
  const now = new Date();
  const past = new Date(now.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return past;
}

async function seedLogs() {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Connected successfully\n");

    // Get existing automations
    const automations = await AutomationModel.findAll({ limit: 10 });

    if (automations.length === 0) {
      console.log("⚠️  No automations found. Creating demo automations...");

      // Create demo automations
      const demoAutomations = await AutomationModel.bulkCreate([
        {
          name: "Daily Compliance Report",
          description: "Send daily compliance status report to stakeholders",
          is_active: true,
        },
        {
          name: "High Risk Alert",
          description: "Notify team when high or critical risks are detected",
          is_active: true,
        },
        {
          name: "Vendor Review Reminder",
          description: "Send reminders for upcoming vendor reviews",
          is_active: true,
        },
      ] as any);

      automations.push(...demoAutomations);
      console.log(`✅ Created ${demoAutomations.length} demo automations\n`);
    }

    console.log(`📋 Found ${automations.length} automation(s)\n`);

    // Clear existing logs
    await AutomationExecutionLogModel.destroy({ where: {} });
    console.log("🧹 Cleared existing execution logs\n");

    let totalLogs = 0;

    // Create logs for each automation
    for (const automation of automations) {
      console.log(`📝 Creating logs for: "${automation.name}" (ID: ${automation.id})`);

      const numLogs = Math.floor(Math.random() * 15) + 10; // 10-25 logs
      const logs: any[] = [];

      for (let i = 0; i < numLogs; i++) {
        const date = randomDateInPast(30);
        const rand = Math.random();

        let status: "success" | "partial_success" | "failure";
        let actionResults: any[];
        let errorMessage: string | null = null;

        if (rand < 0.6) {
          // 60% success
          status = "success";
          if (Math.random() < 0.5) {
            // Simple email action
            actionResults = [
              {
                action_type: "send_email",
                status: "success",
                result_data: {
                  recipients: ["admin@verifywise.ai", "team@verifywise.ai"],
                  subject: "Daily Compliance Report",
                  sent_at: date.toISOString(),
                },
                executed_at: new Date(date.getTime() + 500),
              },
            ];
          } else {
            // Multiple actions
            actionResults = [
              {
                action_type: "send_email",
                status: "success",
                result_data: {
                  recipients: ["security@verifywise.ai"],
                  subject: "High Risk Alert Detected",
                },
                executed_at: new Date(date.getTime() + 300),
              },
              {
                action_type: "create_task",
                status: "success",
                result_data: {
                  task_id: Math.floor(Math.random() * 1000) + 1,
                  title: "Review High Risk Item",
                  priority: "high",
                },
                executed_at: new Date(date.getTime() + 800),
              },
              {
                action_type: "send_slack_notification",
                status: "success",
                result_data: {
                  channel: "#security-alerts",
                  message: "High risk detected",
                },
                executed_at: new Date(date.getTime() + 1200),
              },
            ];
          }
        } else if (rand < 0.85) {
          // 25% partial success
          status = "partial_success";
          errorMessage = "Some actions failed to execute";
          actionResults = [
            {
              action_type: "send_email",
              status: "success",
              result_data: {
                recipients: ["compliance@verifywise.ai"],
                subject: "Vendor Review Due",
              },
              executed_at: new Date(date.getTime() + 400),
            },
            {
              action_type: "update_vendor_status",
              status: "failure",
              error_message: "Database connection timeout",
              executed_at: new Date(date.getTime() + 900),
            },
            {
              action_type: "send_slack_notification",
              status: "success",
              result_data: {
                channel: "#vendor-management",
                message: "Vendor review is due",
              },
              executed_at: new Date(date.getTime() + 1300),
            },
          ];
        } else {
          // 15% failure
          status = "failure";
          errorMessage = "Failed to send notification email";
          actionResults = [
            {
              action_type: "send_email",
              status: "failure",
              error_message: "SMTP server unavailable",
              executed_at: new Date(date.getTime() + 200),
            },
          ];
        }

        logs.push({
          automation_id: automation.id,
          triggered_at: date,
          trigger_data: {
            trigger_type: status === "success" ? "scheduled" : "manual",
            triggered_by: "system",
          },
          action_results: actionResults,
          status,
          error_message: errorMessage,
          execution_time_ms: randomExecutionTime(),
          created_at: date,
        });
      }

      // Sort by date
      logs.sort((a, b) => a.triggered_at.getTime() - b.triggered_at.getTime());

      // Insert logs
      await AutomationExecutionLogModel.bulkCreate(logs);
      totalLogs += logs.length;

      console.log(`   ✓ Created ${logs.length} execution logs`);
    }

    console.log(`\n✨ Successfully created ${totalLogs} execution logs!`);

    // Show stats
    const stats = await sequelize.query(
      `
      SELECT status, COUNT(*) as count
      FROM automation_execution_logs
      GROUP BY status
      ORDER BY status
    `,
      { type: "SELECT" },
    );

    console.log("\n📊 Summary by status:");
    (stats as any[]).forEach((stat: any) => {
      const emoji =
        stat.status === "success" ? "✅" : stat.status === "partial_success" ? "⚠️" : "❌";
      console.log(`   ${emoji} ${stat.status}: ${stat.count}`);
    });

    console.log("\n🎉 Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

seedLogs();
