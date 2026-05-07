import { compileMjmlToHtml } from "../tools/mjmlCompiler";
import { EmailProviderFactory } from "./email/providers/EmailProviderFactory";
import { EmailProvider, validateEmailOptions, RefreshableCredentials } from "./email/types";

// Initialize email provider based on configuration
let emailProvider: EmailProvider;

const initializeEmailProvider = () => {
  if (!emailProvider) {
    const providerType = EmailProviderFactory.getProviderType();
    emailProvider = EmailProviderFactory.createProvider(providerType);
    console.log(`Email service initialized with ${emailProvider.getProviderName()} provider`);
  }
  return emailProvider;
};

/**
 * Check if the current provider supports credential rotation and refresh if needed
 */
const refreshCredentialsIfNeeded = async (provider: EmailProvider): Promise<void> => {
  if ("refreshCredentials" in provider && "needsCredentialRefresh" in provider) {
    const refreshableProvider = provider as EmailProvider & RefreshableCredentials;

    if (refreshableProvider.needsCredentialRefresh()) {
      console.log(`Refreshing credentials for provider: ${provider.getProviderName()}`);
      await refreshableProvider.refreshCredentials();
    }
  }
};

// Function to send an email
export const sendEmail = async (
  to: string,
  subject: string,
  template: string,
  data: Record<string, string>,
) => {
  // Initialize provider if not already done
  const provider = initializeEmailProvider();

  // Refresh credentials if needed before sending email
  await refreshCredentialsIfNeeded(provider);

  // Compile MJML template to HTML
  const html = await compileMjmlToHtml(template, data);

  if (!process.env.EMAIL_ID) {
    throw new Error("Email ID is not set in environment variables");
  }

  const emailOptions = {
    to,
    subject,
    html,
    from: process.env.EMAIL_ID,
  };

  // Validate email options to prevent security issues
  validateEmailOptions(emailOptions);

  // Send email using the configured provider
  return await provider.sendEmail(emailOptions);
};

export const sendAutomationEmail = async (
  to: string[],
  subject: string,
  body: string,
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
    path?: string;
  }[],
) => {
  // Initialize provider if not already done
  const provider = initializeEmailProvider();

  // Refresh credentials if needed before sending email
  await refreshCredentialsIfNeeded(provider);

  if (!process.env.EMAIL_ID) {
    throw new Error("Email ID is not set in environment variables");
  }

  for (let recipient of to) {
    const emailOptions = {
      to: recipient,
      subject,
      html: body,
      from: process.env.EMAIL_ID,
      attachments: attachments || [],
    };

    // Validate email options to prevent security issues
    validateEmailOptions(emailOptions);

    // Send email using the configured provider
    await provider.sendEmail(emailOptions);
  }
};

/**
 * Force refresh credentials for the current email provider
 * Useful for manual credential rotation or when authentication errors occur
 */
export const refreshEmailProviderCredentials = async (): Promise<boolean> => {
  try {
    const provider = initializeEmailProvider();

    if ("refreshCredentials" in provider) {
      const refreshableProvider = provider as EmailProvider & RefreshableCredentials;
      await refreshableProvider.refreshCredentials();
      console.log(`Credentials refreshed successfully for ${provider.getProviderName()}`);
      return true;
    } else {
      console.log(`Provider ${provider.getProviderName()} does not support credential rotation`);
      return false;
    }
  } catch (error) {
    console.error("Failed to refresh email provider credentials:", error);
    throw error;
  }
};

/**
 * Get credential refresh status for the current provider
 */
export const getCredentialRefreshStatus = (): {
  supportsRefresh: boolean;
  needsRefresh: boolean;
  timeSinceLastRefresh?: number;
  providerName: string;
} => {
  const provider = initializeEmailProvider();

  if ("needsCredentialRefresh" in provider && "getTimeSinceLastRefresh" in provider) {
    const refreshableProvider = provider as EmailProvider & RefreshableCredentials;
    return {
      supportsRefresh: true,
      needsRefresh: refreshableProvider.needsCredentialRefresh(),
      timeSinceLastRefresh: refreshableProvider.getTimeSinceLastRefresh(),
      providerName: provider.getProviderName(),
    };
  }

  return {
    supportsRefresh: false,
    needsRefresh: false,
    providerName: provider.getProviderName(),
  };
};
