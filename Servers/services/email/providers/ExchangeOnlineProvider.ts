import nodemailer from "nodemailer";
import { EmailProvider, EmailOptions, EmailResult, ExchangeOnlineConfig } from "../types";

/**
 * Exchange Online (Office 365/Microsoft 365) Email Provider
 *
 * Supports Microsoft's cloud-based Exchange service used by most enterprises.
 * Uses SMTP with Office 365 authentication.
 */
export class ExchangeOnlineProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private config: ExchangeOnlineConfig;

  constructor(config: ExchangeOnlineConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        minVersion: "TLSv1.2", // Enforce modern TLS
        ciphers: "HIGH:!aNULL:!MD5:!3DES", // Strong ciphers only
        rejectUnauthorized: process.env.NODE_ENV !== "development", // Only allow self-signed in dev
      },
      // Add timeout configurations
      connectionTimeout: 30000, // 30 seconds to establish connection
      greetingTimeout: 10000, // 10 seconds for server greeting
      socketTimeout: 60000, // 60 seconds for socket inactivity
    });
  }

  getProviderName(): string {
    return "Exchange Online (Office 365)";
  }

  async validateConfig(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("Exchange Online configuration validation failed:", error);
      return false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const mailOptions: any = {
        from: options.from || this.config.user,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      // Add attachments if provided
      if (options.attachments && options.attachments.length > 0) {
        mailOptions.attachments = options.attachments.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
          path: att.path,
        }));
      }

      const result = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: error.name || "ExchangeOnlineError",
          message: error.message || "Unknown Exchange Online error",
        },
      };
    }
  }
}
