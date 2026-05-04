import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  EmailProvider,
  EmailOptions,
  EmailResult,
  AmazonSESConfig,
  RefreshableCredentials,
} from "../types";

/**
 * Amazon Simple Email Service (SES) Provider
 *
 * Highly scalable and cost-effective email service used by many enterprises.
 * Provides excellent deliverability, detailed analytics, and seamless AWS integration.
 * Popular choice for SaaS applications and enterprise systems.
 */
export class AmazonSESProvider implements EmailProvider, RefreshableCredentials {
  private sesClient!: SESClient;
  private config: AmazonSESConfig;
  private lastCredentialRefresh: Date;
  private credentialRefreshInterval: number;

  constructor(config: AmazonSESConfig) {
    this.config = config;
    this.lastCredentialRefresh = new Date();
    this.credentialRefreshInterval = parseInt(
      process.env.AWS_CREDENTIAL_REFRESH_INTERVAL_MS || "3600000",
    ); // 1 hour default

    this.initializeSESClient();
  }

  private initializeSESClient(): void {
    this.sesClient = new SESClient({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      apiVersion: this.config.apiVersion || "2010-12-01",
      maxAttempts: 3, // Retry failed requests up to 3 times
      // Add timeout and retry configurations for reliability
      requestHandler: new NodeHttpHandler({
        requestTimeout: 30000, // 30 seconds for API calls
        connectionTimeout: 5000, // 5 seconds to establish connection
        socketTimeout: 30000, // 30 seconds for socket inactivity
      }),
    });
  }

  async refreshCredentials(): Promise<void> {
    try {
      // Load fresh credentials from environment or secrets manager
      const freshConfig = this.loadConfigFromEnvironment();

      // Update config
      this.config = { ...this.config, ...freshConfig };

      // Reinitialize SES client with new credentials
      this.initializeSESClient();

      // Update refresh timestamp
      this.lastCredentialRefresh = new Date();

      console.log(`AWS SES credentials refreshed at ${this.lastCredentialRefresh.toISOString()}`);
    } catch (error) {
      console.error("Failed to refresh AWS SES credentials:", error);
      throw new Error("Credential refresh failed");
    }
  }

  needsCredentialRefresh(): boolean {
    return this.getTimeSinceLastRefresh() > this.credentialRefreshInterval;
  }

  getTimeSinceLastRefresh(): number {
    return Date.now() - this.lastCredentialRefresh.getTime();
  }

  private loadConfigFromEnvironment(): AmazonSESConfig {
    const requiredVars = ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY", "AWS_SES_REGION"];
    const missing = requiredVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    return {
      region: process.env.AWS_SES_REGION!,
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY!,
      apiVersion: process.env.AWS_SES_API_VERSION || "2010-12-01",
    };
  }

  getProviderName(): string {
    return `Amazon SES (${this.config.region})`;
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Test configuration by checking send quota
      const { GetSendQuotaCommand } = await import("@aws-sdk/client-ses");
      await this.sesClient.send(new GetSendQuotaCommand({}));
      return true;
    } catch (error) {
      console.error("Amazon SES configuration validation failed:", error);
      return false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      // Check if credentials need refresh before sending
      if (this.needsCredentialRefresh()) {
        console.log("AWS SES credentials expired, refreshing...");
        await this.refreshCredentials();
      }

      // Note: Attachments with SES require using SendRawEmailCommand
      // For simplicity, we'll log a warning if attachments are provided
      // In production, consider using nodemailer with SES transport for attachment support
      if (options.attachments && options.attachments.length > 0) {
        console.warn(
          "Amazon SES provider currently does not support attachments with SendEmailCommand. " +
            "Consider using nodemailer with SES transport or implement SendRawEmailCommand.",
        );
      }

      const command = new SendEmailCommand({
        Source: options.from || process.env.EMAIL_ID!,
        Destination: {
          ToAddresses: [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: options.html,
              Charset: "UTF-8",
            },
          },
        },
        // Add configuration set if specified (for tracking)
        ...(process.env.SES_CONFIGURATION_SET && {
          ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
        }),
      });

      const result = await this.sesClient.send(command);

      return {
        success: true,
        messageId: result.MessageId,
      };
    } catch (error: any) {
      // If authentication error, try credential refresh once
      if (error.name === "InvalidClientTokenId" || error.name === "SignatureDoesNotMatch") {
        console.log("AWS SES authentication error, attempting credential refresh...");
        try {
          await this.refreshCredentials();
          // Retry the operation once
          const result = await this.sesClient.send(
            new SendEmailCommand({
              Source: options.from || process.env.EMAIL_ID!,
              Destination: { ToAddresses: [options.to] },
              Message: {
                Subject: { Data: options.subject, Charset: "UTF-8" },
                Body: { Html: { Data: options.html, Charset: "UTF-8" } },
              },
              ...(process.env.SES_CONFIGURATION_SET && {
                ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
              }),
            }),
          );

          return {
            success: true,
            messageId: result.MessageId,
          };
        } catch (retryError: any) {
          return {
            success: false,
            error: {
              name: retryError.name || "AmazonSESError",
              message: "Email delivery failed after credential refresh",
            },
          };
        }
      }

      return {
        success: false,
        error: {
          name: error.name || "AmazonSESError",
          message: error.message || "Unknown Amazon SES error",
        },
      };
    }
  }
}
