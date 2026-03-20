/**
 * Email service provider types and interfaces
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  path?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: EmailAttachment[];
}

/**
 * Validates email options to prevent header injection and other security issues
 */
export function validateEmailOptions(options: EmailOptions): void {
  // Validate email addresses
  if (!options.to || !isValidEmail(options.to)) {
    throw new Error('Invalid recipient email address');
  }

  if (options.from && !isValidEmail(options.from)) {
    throw new Error('Invalid sender email address');
  }

  // Validate subject
  if (!options.subject || options.subject.length === 0) {
    throw new Error('Subject is required');
  }

  if (options.subject.length > 998) {
    throw new Error('Subject too long (max 998 characters)');
  }

  // Prevent header injection attacks
  if (containsNewlines(options.to) || containsNewlines(options.from || '') || containsNewlines(options.subject)) {
    throw new Error('Email header injection detected: newline characters not allowed');
  }

  // Validate HTML content
  if (!options.html || options.html.length === 0) {
    throw new Error('Email content is required');
  }

  if (options.html.length > 1000000) { // 1MB limit
    throw new Error('Email content too large (max 1MB)');
  }
}

/**
 * Validates email address format with enhanced security checks
 * Prevents bypass attempts and dangerous characters
 */
function isValidEmail(email: string): boolean {
  // Basic length and format checks
  if (!email || typeof email !== 'string' || email.length > 320) {
    return false; // RFC 5321 limit
  }

  // RFC 5322 compliant regex (simplified but secure)
  // Allows standard alphanumeric and safe special characters
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(email)) {
    return false;
  }

  // Split and validate components
  const [localPart, domain] = email.split('@');

  // Local part validation
  if (!localPart || localPart.length === 0 || localPart.length > 64) {
    return false; // RFC 5321 local part limit
  }

  // Prevent consecutive dots in local part
  if (localPart.includes('..')) {
    return false;
  }

  // Prevent leading/trailing dots in local part
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return false;
  }

  // Domain validation
  if (!domain || domain.length === 0 || domain.length > 255) {
    return false; // RFC 5321 domain limit
  }

  // Prevent consecutive dots in domain
  if (domain.includes('..')) {
    return false;
  }

  // Prevent leading/trailing dots in domain
  if (domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  // Prevent leading/trailing hyphens in domain labels
  const domainLabels = domain.split('.');
  for (const label of domainLabels) {
    if (label.startsWith('-') || label.endsWith('-') || label.length === 0) {
      return false;
    }
  }

  // Validate TLD (must be at least 2 characters and alphabetic)
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) {
    return false;
  }

  // Prevent dangerous HTML/Script characters that could cause injection
  const dangerousChars = /[<>'"()\\[\]{}]/;
  if (dangerousChars.test(email)) {
    return false;
  }

  // Prevent Unicode characters that could cause homograph attacks
  // Only allow ASCII characters
  if (!/^[\x00-\x7F]*$/.test(email)) {
    return false;
  }

  // Additional security: prevent known malicious patterns
  const suspiciousPatterns = [
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
    /%[0-9a-f]{2}/i, // URL encoding
    /&#/i,           // HTML entities
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(email)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks for newline characters that could be used for header injection
 */
function containsNewlines(text: string): boolean {
  return /[\r\n]/.test(text);
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: {
    name: string;
    message: string;
  };
}

export interface EmailProvider {
  /**
   * Send an email using the provider
   */
  sendEmail(options: EmailOptions): Promise<EmailResult>;

  /**
   * Validate provider configuration
   */
  validateConfig(): Promise<boolean>;

  /**
   * Get provider name for logging
   */
  getProviderName(): string;
}

/**
 * Interface for providers that support credential rotation
 */
export interface RefreshableCredentials {
  /**
   * Refresh provider credentials
   */
  refreshCredentials(): Promise<void>;

  /**
   * Check if credentials need refresh
   */
  needsCredentialRefresh(): boolean;

  /**
   * Get time since last credential refresh in milliseconds
   */
  getTimeSinceLastRefresh(): number;
}

export type EmailProviderType = 'resend' | 'smtp' | 'exchange-online' | 'exchange-onprem' | 'amazon-ses' | 'azure-communication-services';

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface ExchangeOnlineConfig {
  user: string;
  pass: string;
  organizationId?: string; // Optional for enhanced security
}

export interface OnPremisesExchangeConfig {
  host: string;
  port: number;
  secure: boolean;
  domain?: string; // Optional domain for authentication
  auth: {
    user: string;
    pass: string;
  };
}

export interface AmazonSESConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  apiVersion?: string;
}