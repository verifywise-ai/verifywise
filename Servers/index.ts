import { createApp } from "./app";
import { addAllJobs } from "./jobs/producer";
import {
  setupNotificationSubscriber,
  closeNotificationSubscriber,
} from "./services/notificationSubscriber.service";
import { sequelize } from "./database/db";
import redisClient from "./database/redis";
import { startTimeoutHandler } from "./advisor/approval/timeoutHandler";

const DEFAULT_PORT = "3000";
const DEFAULT_HOST = "localhost";

const portString = process.env.PORT || DEFAULT_PORT;
const host = process.env.HOST || DEFAULT_HOST;
const port = parseInt(portString, 10);

try {
  const app = createApp();

  // Adding background jobs in the Queue
  (async () => {
    await addAllJobs();
  })();

  // Setup notification subscriber for real-time notifications
  (async () => {
    try {
      await setupNotificationSubscriber();
    } catch (error) {
      console.error("Failed to setup notification subscriber:", error);
    }
  })();

  // Check and run tenant-to-shared-schema data migration
  (async () => {
    try {
      const {
        checkAndRunMigration,
        printValidationReport,
      } = require("./scripts/migrateToSharedSchema");
      console.log("🔄 Checking for pending data migrations...");
      const result = await checkAndRunMigration();

      if (result.status === "completed" || result.status === "already_completed") {
        console.log("✅ Data migration already completed");
      } else if (result.status === "just_completed") {
        console.log("✅ Data migration completed successfully!");
        console.log(`   Organizations migrated: ${result.organizationsMigrated}`);
        console.log(`   Total rows migrated: ${result.rowsMigrated}`);
        if (result.validationReport) {
          printValidationReport(result.validationReport);
        }
      } else if (result.status === "failed") {
        console.error("❌ Data migration failed:", result.error);
        console.log("⚠️  Server will start but old tenant data may not be accessible");
      } else if (result.status === "no_tenants") {
        console.log("ℹ️  No tenant schemas found, skipping migration");
      }
    } catch (error) {
      console.error("Data migration check failed:", error);
      // Server continues to start even if migration check fails
    }

    // Dev-only auto-bootstrap — runs AFTER migration check completes
    try {
      const { devAutoBootstrap } = require("./utils/devAutoBootstrap");
      await devAutoBootstrap();
    } catch (error) {
      console.error("❌ Dev auto-bootstrap failed:", error);
      // When DEV_AUTO_BOOTSTRAP is explicitly on, fail fast so devs notice
      if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_BOOTSTRAP === "true") {
        process.exit(1);
      }
    }
  })();

  // Start approval timeout handler (expires pending approvals past TTL)
  startTimeoutHandler();

  const server = app.listen(port, () => {
    console.log(`Server running on port http://${host}:${port}/`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received — shutting down gracefully`);

    server.close(async () => {
      console.log("HTTP server closed");

      try {
        await closeNotificationSubscriber();
        console.log("Notification subscriber closed");
      } catch (err: unknown) {
        console.error("Error closing notification subscriber:", err);
      }

      try {
        await redisClient.quit();
        console.log("Redis connection closed");
      } catch (err: unknown) {
        console.error("Error closing Redis connection:", err);
      }

      try {
        await sequelize.close();
        console.log("Database connection closed");
      } catch (err: unknown) {
        console.error("Error closing database connection:", err);
      }

      process.exit(0);
    });

    setTimeout(() => {
      console.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  console.error("Error setting up the server:", error);
}
