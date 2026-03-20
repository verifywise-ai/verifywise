import redisClient from "../database/redis";
import { getConnection } from "../controllers/notification.ctrl";

/**
 * Setup Redis subscriber for approval notifications
 * This runs once when the server starts and listens for notification messages
 */
export const setupNotificationSubscriber = async (): Promise<void> => {
  try {
    // Create a duplicate Redis client for subscribing
    // Note: duplicate() creates a new client with same config but not yet connected
    const subscriber = redisClient.duplicate();

    console.log("📡 Connecting notification subscriber to Redis...");

    // Wait for the subscriber to be ready
    subscriber.on("ready", () => {
      console.log("✅ Notification subscriber connected to Redis");
    });

    // Handle errors
    subscriber.on("error", (error) => {
      console.error("❌ Redis subscriber error:", error);
    });

    // Subscribe to notification channels
    // This will auto-connect if not already connected
    await subscriber.subscribe("approval-notifications", "in-app-notifications");

    // Listen for messages on the subscribed channels
    subscriber.on("message", (channel: string, message: string) => {
      // Only process messages from our channels
      if (channel !== "approval-notifications" && channel !== "in-app-notifications") {
        return;
      }

      console.log("📥 Received message from Redis channel");

      try {
        const payload = JSON.parse(message);
        const { organizationId, userId, notification } = payload;

        console.log(`📨 Processing notification for tenant=${organizationId}, user=${userId}, type=${notification?.type}`);

        // SECURITY: Validate message format
        if (!organizationId || !userId || !notification) {
          console.error("Security: Invalid notification message format", payload);
          return;
        }

        const connectionKey = `${organizationId}:${userId}`;
        const connectionData = getConnection(connectionKey);

        if (connectionData) {
          console.log(`✅ Found active connection for ${connectionKey}`);

          // SECURITY: Double-check tenant matches stored connection
          if (connectionData.organizationId !== organizationId) {
            console.error(
              `Security: Tenant mismatch! Stored: ${connectionData.organizationId}, Message: ${organizationId}`
            );
            return;
          }

          // SECURITY: Verify userId matches
          if (connectionData.userId !== userId) {
            console.error(
              `Security: User mismatch! Stored: ${connectionData.userId}, Message: ${userId}`
            );
            return;
          }

          // Safe to send notification
          try {
            connectionData.response.write(
              `data: ${JSON.stringify(notification)}\n\n`
            );
            console.log(
              `📬 Notification delivered to ${connectionKey}: ${notification.type}`
            );
          } catch (error) {
            console.error(`Error sending notification to ${connectionKey}:`, error);
          }
        } else {
          console.log(
            `⚠️ No active connection for ${connectionKey} - user may not be online`
          );
        }
      } catch (error) {
        console.error("Error processing notification message:", error);
      }
    });

    console.log("📬 Notification subscriber subscribed to approval-notifications and in-app-notifications channels");
  } catch (error) {
    console.error("❌ Failed to setup notification subscriber:", error);
    throw error;
  }
};
