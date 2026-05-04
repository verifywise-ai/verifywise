import path from "path";
import fs from "fs/promises";
import { sendEmail } from "./emailService";
import { TEMPLATES_DIR } from "../constants/emailTemplates";

interface QueuedEmail {
  recipientEmail: string;
  subject: string;
  templateFileName: string;
  templateData: Record<string, string>;
  resolve: (value: void | PromiseLike<void>) => void;
  reject: (reason?: any) => void;
}

// Rate limiting state file for persistence across restarts
const rateLimitStateFile = path.resolve(process.cwd(), ".rate-limit-state.json");

interface RateLimitState {
  lastSendTimestamp: number;
  tokens: number;
  lastTokenRefill: number;
  consecutiveFailures: number;
}

/**
 * Mask email address to prevent PII from being persisted in logs
 */
// function maskEmail(email: string): string {
//   if (!email || typeof email !== 'string' || email.trim() === '') {
//     return "redacted";
//   }

//   const trimmedEmail = email.trim();

//   if (trimmedEmail.length <= 2) {
//     return trimmedEmail.charAt(0) + "*";
//   }

//   if (trimmedEmail.length <= 6) {
//     return trimmedEmail.charAt(0) + "*".repeat(trimmedEmail.length - 2) + trimmedEmail.charAt(trimmedEmail.length - 1);
//   }

//   return trimmedEmail.charAt(0) + "*".repeat(trimmedEmail.length - 2) + trimmedEmail.charAt(trimmedEmail.length - 1);
// }

/**
 * Core notification service for sending emails with templates
 */
export class NotificationService {
  private static instance: NotificationService;
  private emailQueue: QueuedEmail[] = [];
  private isProcessing = false;
  private readonly initialization: Promise<void>;

  // Token bucket rate limiting (2 requests per second, burst of 3)
  private readonly MAX_TOKENS = 3;
  private readonly TOKEN_REFILL_RATE = 500; // Refill 1 token every 500ms (2/second)
  private readonly MIN_DELAY = 600; // Minimum 600ms between sends

  // Rate limiting state (persistent across restarts)
  private rateLimitState: RateLimitState = {
    lastSendTimestamp: 0,
    tokens: this.MAX_TOKENS,
    lastTokenRefill: Date.now(),
    consecutiveFailures: 0,
  };

  private constructor() {
    this.initialization = this.loadRateLimitState();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Load rate limiting state from persistent storage
   */
  private async loadRateLimitState(): Promise<void> {
    try {
      const data = await fs.readFile(rateLimitStateFile, "utf8");
      const loadedState = JSON.parse(data) as RateLimitState;

      // Validate and merge with defaults
      this.rateLimitState = {
        lastSendTimestamp: loadedState.lastSendTimestamp || 0,
        tokens: Math.min(Math.max(0, loadedState.tokens ?? this.MAX_TOKENS), this.MAX_TOKENS),
        lastTokenRefill: loadedState.lastTokenRefill || Date.now(),
        consecutiveFailures: loadedState.consecutiveFailures || 0,
      };

      // Refill tokens based on time elapsed since last refill
      this.refillTokens();
    } catch (error) {
      // File doesn't exist or is corrupted, use defaults
      this.rateLimitState = {
        lastSendTimestamp: 0,
        tokens: this.MAX_TOKENS,
        lastTokenRefill: Date.now(),
        consecutiveFailures: 0,
      };
    }
  }

  /**
   * Save rate limiting state to persistent storage
   */
  private async saveRateLimitState(): Promise<void> {
    try {
      await fs.writeFile(rateLimitStateFile, JSON.stringify(this.rateLimitState), "utf8");
    } catch (error) {
      // Log but don't throw - persistence failure shouldn't break email sending
      console.warn("Failed to save rate limit state:", error);
    }
  }

  /**
   * Refill tokens based on elapsed time (token bucket algorithm)
   */
  private refillTokens(): void {
    const now = Date.now();
    const timeSinceLastRefill = now - this.rateLimitState.lastTokenRefill;
    const tokensToAdd = Math.floor(timeSinceLastRefill / this.TOKEN_REFILL_RATE);

    if (tokensToAdd > 0) {
      this.rateLimitState.tokens = Math.min(
        this.rateLimitState.tokens + tokensToAdd,
        this.MAX_TOKENS,
      );
      this.rateLimitState.lastTokenRefill = now;
    }
  }

  /**
   * Calculate delay for exponential backoff on failures
   */
  private getBackoffDelay(): number {
    if (this.rateLimitState.consecutiveFailures === 0) {
      return this.MIN_DELAY;
    }

    // Exponential backoff: 600ms, 1200ms, 2400ms, max 10 seconds
    const backoffMs =
      this.MIN_DELAY * Math.pow(2, Math.min(this.rateLimitState.consecutiveFailures, 4));
    return Math.min(backoffMs, 10000);
  }

  /**
   * Wait for rate limit compliance using token bucket + timestamp approach
   */
  private async waitForRateLimit(): Promise<void> {
    this.refillTokens();

    // If no tokens available, wait for next token
    if (this.rateLimitState.tokens < 1) {
      const timeUntilNextToken =
        this.TOKEN_REFILL_RATE - (Date.now() - this.rateLimitState.lastTokenRefill);
      if (timeUntilNextToken > 0) {
        await new Promise((resolve) => setTimeout(resolve, timeUntilNextToken));
        this.refillTokens();
      }
    }

    // Ensure minimum delay since last send
    const now = Date.now();
    const elapsed = now - this.rateLimitState.lastSendTimestamp;
    const requiredDelay = this.getBackoffDelay();

    if (elapsed < requiredDelay) {
      const remainingTime = requiredDelay - elapsed;
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }
  }

  private async processQueue(): Promise<void> {
    await this.initialization;
    if (this.isProcessing || this.emailQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.emailQueue.length > 0) {
      const emailData = this.emailQueue.shift()!;

      try {
        // Wait for rate limit compliance (token bucket + timestamp + backoff)
        await this.waitForRateLimit();

        // Consume a token
        this.rateLimitState.tokens = Math.max(0, this.rateLimitState.tokens - 1);

        // Attempt to send email
        await this.sendEmailDirectly(
          emailData.recipientEmail,
          emailData.subject,
          emailData.templateFileName,
          emailData.templateData,
        );

        // Success: update state and reset failure count
        this.rateLimitState.lastSendTimestamp = Date.now();
        this.rateLimitState.consecutiveFailures = 0;
        await this.saveRateLimitState();

        emailData.resolve();
      } catch (error) {
        // Failure: increment failure count and update timestamp to prevent rapid retries
        this.rateLimitState.consecutiveFailures++;
        this.rateLimitState.lastSendTimestamp = Date.now();
        await this.saveRateLimitState();

        emailData.reject(error);
      }
    }

    // Release the lock, but if new items arrived while winding down, resume.
    const hasPending = this.emailQueue.length > 0;
    this.isProcessing = false;
    if (hasPending) {
      setImmediate(() => {
        void this.processQueue();
      });
    }
  }

  /**
   * Send email using template file (queued with rate limiting)
   */
  async sendEmailWithTemplate(
    recipientEmail: string,
    subject: string,
    templateFileName: string,
    templateData: Record<string, string>,
  ): Promise<void> {
    await this.initialization;
    return new Promise((resolve, reject) => {
      this.emailQueue.push({
        recipientEmail,
        subject,
        templateFileName,
        templateData,
        resolve,
        reject,
      });

      // Start processing the queue if not already processing
      this.processQueue().catch(reject);
    });
  }

  /**
   * Direct email sending (internal method)
   */
  private async sendEmailDirectly(
    recipientEmail: string,
    subject: string,
    templateFileName: string,
    templateData: Record<string, string>,
  ): Promise<void> {
    // logProcessing({
    //   description: `Sending email with template: ${templateFileName}`,
    //   functionName: "sendEmailWithTemplate",
    //   fileName: "NotificationService.ts",
    // });

    try {
      // Read the template file
      const templatePath = path.join(TEMPLATES_DIR, path.basename(templateFileName));
      const template = await fs.readFile(templatePath, "utf8");

      // Send the email
      const result = await sendEmail(recipientEmail, subject, template, templateData);

      if (result.error) {
        throw new Error(`${result.error.name}: ${result.error.message}`);
      }

      // await logSuccess({
      //   eventType: "Create",
      //   description: `Email sent successfully to ${maskEmail(recipientEmail)}`,
      //   functionName: "sendEmailWithTemplate",
      //   fileName: "NotificationService.ts",
      // });
    } catch (error) {
      // Sanitize the error to remove any email addresses
      const sanitized = new Error(
        String((error as any)?.message ?? error).replace(
          /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
          "[redacted]",
        ),
      );

      // await logFailure({
      //   eventType: "Create",
      //   description: `Failed to send email to ${maskEmail(recipientEmail)}`,
      //   functionName: "sendEmailWithTemplate",
      //   fileName: "NotificationService.ts",
      //   error: sanitized,
      // });
      (sanitized as any).cause = error;
      throw sanitized;
    }
  }
}

// Export both the class and the instance for flexibility
export const notificationService = NotificationService.getInstance();
