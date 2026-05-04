import { Resend } from "resend";
import { EmailProvider, EmailOptions, EmailResult } from "../types";

export class ResendProvider implements EmailProvider {
  private resend: Resend;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.resend = new Resend(apiKey);
  }

  getProviderName(): string {
    return "Resend";
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Test the API key by attempting to get account info
      // Resend doesn't have a direct validation endpoint, so we'll just check if the key exists
      return !!this.apiKey && this.apiKey.length > 0;
    } catch (error) {
      console.error("Resend configuration validation failed:", error);
      return false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const mailOptions: any = {
        from: options.from || process.env.EMAIL_ID!,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      // Add attachments if provided
      if (options.attachments && options.attachments.length > 0) {
        mailOptions.attachments = options.attachments.map((att) => ({
          filename: att.filename,
          content: att.content,
        }));
      }

      const result = await this.resend.emails.send(mailOptions);

      if (result.error) {
        return {
          success: false,
          error: {
            name: result.error.name,
            message: result.error.message,
          },
        };
      }

      return {
        success: true,
        messageId: result.data?.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: error.name || "ResendError",
          message: error.message || "Unknown Resend error",
        },
      };
    }
  }
}
