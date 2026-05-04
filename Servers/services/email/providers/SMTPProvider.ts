import nodemailer from "nodemailer";
import { EmailProvider, EmailOptions, EmailResult, SMTPConfig } from "../types";

export class SMTPProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
      // Add timeout and security configurations
      connectionTimeout: 30000, // 30 seconds to establish connection
      greetingTimeout: 10000, // 10 seconds for server greeting
      socketTimeout: 60000, // 60 seconds for socket inactivity
      // Enhanced TLS settings
      tls: {
        minVersion: "TLSv1.2", // Enforce modern TLS
        ciphers: "HIGH:!aNULL:!MD5:!3DES", // Strong ciphers only
        rejectUnauthorized: process.env.NODE_ENV !== "development",
      },
      // Connection pooling for better performance
      pool: true,
      maxConnections: 5, // Max concurrent connections
      maxMessages: 100, // Messages per connection
      rateDelta: 1000, // Time window for rate limiting (1 second)
      rateLimit: 5, // Max messages per rateDelta
    });
  }

  getProviderName(): string {
    return "SMTP";
  }

  async validateConfig(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("SMTP configuration validation failed:", error);
      return false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const mailOptions: any = {
        from: options.from || this.config.auth.user,
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
          name: error.name || "SMTPError",
          message: error.message || "Unknown SMTP error",
        },
      };
    }
  }
}
