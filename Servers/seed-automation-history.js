/**
 * Seed script for automation execution logs
 *
 * This script creates demo execution history for existing automations
 * Run with: node seed-automation-history.js
 */

const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

// Database configuration from .env
const sequelize = new Sequelize(
  process.env.DB_NAME || "verifywise",
  process.env.DB_USER || "postgres",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    dialect: "postgres",
    logging: false,
  },
);

// Define the AutomationExecutionLog model
const AutomationExecutionLog = sequelize.define(
  "automation_execution_logs",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    automation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    triggered_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    trigger_data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    action_results: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "success",
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    execution_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false,
    tableName: "automation_execution_logs",
  },
);

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

// Demo execution log templates
const demoExecutions = {
  // Successful execution with email action
  success_email: (automationId, date) => ({
    automation_id: automationId,
    triggered_at: date,
    trigger_data: {
      trigger_type: "scheduled",
      schedule: "daily",
      triggered_by: "system",
    },
    action_results: [
      {
        action_type: "send_email",
        status: "success",
        result_data: {
          recipients: ["admin@verifywise.ai", "team@verifywise.ai"],
          subject: "Daily Compliance Report",
          message_id: `msg-${Date.now()}`,
          sent_at: date.toISOString(),
        },
        executed_at: new Date(date.getTime() + 500),
      },
    ],
    status: "success",
    error_message: null,
    execution_time_ms: randomExecutionTime(),
    created_at: date,
  }),

  // Successful execution with multiple actions
  success_multi: (automationId, date) => ({
    automation_id: automationId,
    triggered_at: date,
    trigger_data: {
      trigger_type: "risk_detected",
      risk_id: Math.floor(Math.random() * 100) + 1,
      risk_level: "high",
      triggered_by: "system",
    },
    action_results: [
      {
        action_type: "send_email",
        status: "success",
        result_data: {
          recipients: ["security@verifywise.ai"],
          subject: "High Risk Alert Detected",
          message_id: `msg-${Date.now()}`,
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
          message: "High risk detected in compliance framework",
        },
        executed_at: new Date(date.getTime() + 1200),
      },
    ],
    status: "success",
    error_message: null,
    execution_time_ms: randomExecutionTime() + 1000,
    created_at: date,
  }),

  // Partial success - some actions failed
  partial_success: (automationId, date) => ({
    automation_id: automationId,
    triggered_at: date,
    trigger_data: {
      trigger_type: "vendor_review_due",
      vendor_id: Math.floor(Math.random() * 50) + 1,
      vendor_name: "Demo Vendor Inc.",
      triggered_by: "system",
    },
    action_results: [
      {
        action_type: "send_email",
        status: "success",
        result_data: {
          recipients: ["compliance@verifywise.ai"],
          subject: "Vendor Review Due",
          message_id: `msg-${Date.now()}`,
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
    ],
    status: "partial_success",
    error_message: "Some actions failed to execute",
    execution_time_ms: randomExecutionTime() + 500,
    created_at: date,
  }),

  // Complete failure
  failure: (automationId, date) => ({
    automation_id: automationId,
    triggered_at: date,
    trigger_data: {
      trigger_type: "policy_approval",
      policy_id: Math.floor(Math.random() * 30) + 1,
      triggered_by: "user",
    },
    action_results: [
      {
        action_type: "send_email",
        status: "failure",
        error_message: "SMTP server unavailable",
        executed_at: new Date(date.getTime() + 200),
      },
    ],
    status: "failure",
    error_message: "Failed to send notification email",
    execution_time_ms: randomExecutionTime() - 200,
    created_at: date,
  }),
};

async function seedAutomationHistory() {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection established");

    // Check if automations table exists, if not create demo automations
    let automations = [];
    try {
      const [result] = await sequelize.query(
        "SELECT id, name FROM automations ORDER BY id LIMIT 10",
      );
      automations = result;
    } catch (error) {
      console.log("⚠️  Automations table not found or empty. Creating demo automations...");

      // Create automations table if it doesn't exist (basic version for demo)
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS automations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          tenant_id VARCHAR(255),
          is_active BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Insert demo automations
      await sequelize.query(`
        INSERT INTO automations (name, description, is_active)
        VALUES
          ('Daily Compliance Report', 'Send daily compliance status report to stakeholders', true),
          ('High Risk Alert', 'Notify team when high or critical risks are detected', true),
          ('Vendor Review Reminder', 'Send reminders for upcoming vendor reviews', true)
        RETURNING id, name
      `);

      const [newAutomations] = await sequelize.query(
        "SELECT id, name FROM automations ORDER BY id",
      );
      automations = newAutomations;
      console.log(`✅ Created ${automations.length} demo automations`);
    }

    if (automations.length === 0) {
      console.log("❌ No automations found. Please create at least one automation first.");
      process.exit(1);
    }

    console.log(`📋 Found ${automations.length} automation(s)`);

    // Clear existing execution logs (optional)
    console.log("🧹 Clearing existing execution logs...");
    try {
      await AutomationExecutionLog.destroy({ where: {}, truncate: true });
    } catch (error) {
      console.log("   ℹ️  Table is empty or doesn't exist yet, skipping truncate");
    }

    let totalLogsCreated = 0;

    // For each automation, create a variety of execution logs
    for (const automation of automations) {
      console.log(
        `\n📝 Creating execution history for: "${automation.name}" (ID: ${automation.id})`,
      );

      const logsToCreate = [];
      const numLogs = Math.floor(Math.random() * 15) + 10; // 10-25 logs per automation

      for (let i = 0; i < numLogs; i++) {
        const date = randomDateInPast(30);

        // Mix of different execution types
        const rand = Math.random();
        let logTemplate;

        if (rand < 0.6) {
          // 60% success
          logTemplate =
            Math.random() < 0.5 ? demoExecutions.success_email : demoExecutions.success_multi;
        } else if (rand < 0.85) {
          // 25% partial success
          logTemplate = demoExecutions.partial_success;
        } else {
          // 15% failure
          logTemplate = demoExecutions.failure;
        }

        logsToCreate.push(logTemplate(automation.id, date));
      }

      // Sort by date (oldest first)
      logsToCreate.sort((a, b) => a.triggered_at - b.triggered_at);

      // Insert logs
      await AutomationExecutionLog.bulkCreate(logsToCreate);
      totalLogsCreated += logsToCreate.length;

      console.log(`   ✓ Created ${logsToCreate.length} execution logs`);
    }

    console.log(`\n✨ Successfully created ${totalLogsCreated} execution logs!`);
    console.log("\n📊 Summary by status:");

    const [stats] = await sequelize.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM automation_execution_logs
      GROUP BY status
      ORDER BY status
    `);

    stats.forEach((stat) => {
      const emoji =
        stat.status === "success" ? "✅" : stat.status === "partial_success" ? "⚠️" : "❌";
      console.log(`   ${emoji} ${stat.status}: ${stat.count}`);
    });

    console.log("\n🎉 Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding automation history:", error);
    process.exit(1);
  }
}

// Run the seeder
seedAutomationHistory();
