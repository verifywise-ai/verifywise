import { EmailClient, EmailMessage } from "@azure/communication-email";
import { EmailProvider, EmailOptions, EmailResult } from "../types";

/**
 * Azure Communication Services Email Provider
 *
 * Uses Azure Communication Services Email SDK with connection string authentication.
 * Simple setup - just needs the connection string from Azure Portal.
 */
export class AzureCommunicationServicesProvider implements EmailProvider {
  private client: EmailClient;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    this.client = new EmailClient(connectionString);
  }

  getProviderName(): string {
    return "Azure Communication Services";
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Connection string format validation
      if (!this.connectionString || !this.connectionString.includes("endpoint=")) {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Azure Communication Services configuration validation failed:", error);
      return false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const message: EmailMessage = {
        senderAddress: options.from || process.env.EMAIL_ID || "",
        content: {
          subject: options.subject,
          html: options.html,
        },
        recipients: {
          to: [{ address: options.to }],
        },
      };

      // Add attachments if provided
      if (options.attachments && options.attachments.length > 0) {
        message.attachments = options.attachments.map((att) => ({
          name: att.filename,
          contentType: att.contentType || "application/octet-stream",
          contentInBase64:
            typeof att.content === "string"
              ? Buffer.from(att.content).toString("base64")
              : att.content.toString("base64"),
        }));
      }

      // Start the email send operation
      const poller = await this.client.beginSend(message);

      // Wait for the operation to complete
      const result = await poller.pollUntilDone();

      if (result.status === "Succeeded") {
        return {
          success: true,
          messageId: result.id,
        };
      } else {
        return {
          success: false,
          error: {
            name: "AzureEmailError",
            message: result.error?.message || `Email send failed with status: ${result.status}`,
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: error.name || "AzureCommunicationServicesError",
          message: error.message || "Unknown Azure Communication Services error",
        },
      };
    }
  }
}
