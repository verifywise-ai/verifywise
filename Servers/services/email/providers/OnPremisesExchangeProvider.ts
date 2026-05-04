import nodemailer from "nodemailer";
import { EmailProvider, EmailOptions, EmailResult, OnPremisesExchangeConfig } from "../types";
import * as fs from "fs";
import * as path from "path";

/**
 * On-Premises Exchange Server Email Provider
 *
 * Supports organizations with self-hosted Exchange servers.
 * Commonly used by large enterprises and government organizations
 * that require full control over their email infrastructure.
 */
export class OnPremisesExchangeProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private config: OnPremisesExchangeConfig;

  constructor(config: OnPremisesExchangeConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.domain ? `${config.domain}\\${config.auth.user}` : config.auth.user,
        pass: config.auth.pass,
      },
      // Enhanced TLS settings for corporate environments
      tls: {
        minVersion: "TLSv1.2", // Enforce modern TLS
        ciphers: "HIGH:!aNULL:!MD5:!3DES", // Strong ciphers only
        // Only allow self-signed certificates in development or when explicitly configured
        rejectUnauthorized:
          process.env.NODE_ENV === "production" && !process.env.EXCHANGE_ALLOW_SELF_SIGNED,
        // Support for custom CA certificates in corporate environments
        ...(process.env.EXCHANGE_CUSTOM_CA_PATH && {
          ca: this.loadCustomCA(process.env.EXCHANGE_CUSTOM_CA_PATH),
        }),
      },
      // Increase timeouts for potentially slower corporate networks
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    });
  }

  /**
   * Securely loads custom CA certificate with path validation
   * Prevents path traversal attacks and file system exposure
   */
  private loadCustomCA(caPath: string): Buffer {
    try {
      // Define allowed directory for CA certificates
      const allowedDir = process.env.EXCHANGE_CA_ALLOWED_DIR || "/etc/ssl/certs";

      // Resolve paths to prevent traversal attacks
      const resolvedCaPath = path.resolve(caPath);
      const resolvedAllowedDir = path.resolve(allowedDir);

      // Validate path is within allowed directory
      if (!resolvedCaPath.startsWith(resolvedAllowedDir)) {
        throw new Error("CA certificate path outside allowed directory");
      }

      // Validate file extension
      const allowedExtensions = [".pem", ".crt", ".cer"];
      const fileExtension = path.extname(resolvedCaPath).toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        throw new Error("Invalid CA certificate file extension");
      }

      // Check if file exists and is readable
      if (!fs.existsSync(resolvedCaPath)) {
        throw new Error("CA certificate file does not exist");
      }

      const stats = fs.statSync(resolvedCaPath);
      if (!stats.isFile()) {
        throw new Error("CA certificate path is not a file");
      }

      // Read certificate file synchronously (only during initialization)
      const caContent = fs.readFileSync(resolvedCaPath);

      // Basic validation - check if it looks like a certificate
      const contentStr = caContent.toString();
      if (
        !contentStr.includes("-----BEGIN CERTIFICATE-----") ||
        !contentStr.includes("-----END CERTIFICATE-----")
      ) {
        throw new Error("Invalid CA certificate format");
      }

      console.log(`Loaded custom CA certificate from: ${resolvedCaPath}`);
      return caContent;
    } catch (error: any) {
      console.error("Failed to load custom CA certificate:", error.message);
      throw new Error(`CA certificate load failed: ${error.message}`);
    }
  }

  getProviderName(): string {
    return `On-Premises Exchange (${this.config.host})`;
  }

  async validateConfig(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("On-Premises Exchange configuration validation failed:", error);
      return false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const fromAddress = options.from || this.config.auth.user;

      const mailOptions: any = {
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        // Add headers commonly expected by Exchange servers
        headers: {
          "X-Mailer": "VerifyWise Enterprise Email Service",
          "X-Priority": "3", // Normal priority
        },
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
          name: error.name || "OnPremisesExchangeError",
          message: error.message || "Unknown On-Premises Exchange error",
        },
      };
    }
  }
}
