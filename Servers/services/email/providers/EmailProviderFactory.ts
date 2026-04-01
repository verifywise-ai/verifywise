import {
  EmailProvider,
  EmailProviderType,
  SMTPConfig,
  ExchangeOnlineConfig,
  OnPremisesExchangeConfig,
  AmazonSESConfig
} from '../types';
import { ResendProvider } from './ResendProvider';
import { SMTPProvider } from './SMTPProvider';
import { ExchangeOnlineProvider } from './ExchangeOnlineProvider';
import { OnPremisesExchangeProvider } from './OnPremisesExchangeProvider';
import { AmazonSESProvider } from './AmazonSESProvider';
import { AzureCommunicationServicesProvider } from './AzureCommunicationServicesProvider';

export class EmailProviderFactory {
  static createProvider(providerType: EmailProviderType): EmailProvider {
    switch (providerType) {
      case 'resend':
        return EmailProviderFactory.createResendProvider();
      case 'smtp':
        return EmailProviderFactory.createSMTPProvider();
      case 'exchange-online':
        return EmailProviderFactory.createExchangeOnlineProvider();
      case 'exchange-onprem':
        return EmailProviderFactory.createOnPremisesExchangeProvider();
      case 'amazon-ses':
        return EmailProviderFactory.createAmazonSESProvider();
      case 'azure-communication-services':
        return EmailProviderFactory.createAzureCommunicationServicesProvider();
      default:
        throw new Error(`Unsupported email provider: ${providerType}`);
    }
  }

  private static createResendProvider(): EmailProvider {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required for Resend provider');
    }
    return new ResendProvider(apiKey);
  }

  private static createSMTPProvider(): EmailProvider {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true';

    if (!host || !port || !user || !pass) {
      throw new Error('SMTP configuration incomplete. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
    }

    const config: SMTPConfig = {
      host,
      port: parseInt(port, 10),
      secure,
      auth: {
        user,
        pass,
      },
    };

    return new SMTPProvider(config);
  }

  private static createExchangeOnlineProvider(): EmailProvider {
    const user = process.env.EXCHANGE_ONLINE_USER;
    const pass = process.env.EXCHANGE_ONLINE_PASS;
    const organizationId = process.env.EXCHANGE_ONLINE_TENANT_ID;

    if (!user || !pass) {
      throw new Error('Exchange Online configuration incomplete. Required: EXCHANGE_ONLINE_USER, EXCHANGE_ONLINE_PASS');
    }

    const config: ExchangeOnlineConfig = {
      user,
      pass,
      organizationId,
    };

    return new ExchangeOnlineProvider(config);
  }

  private static createOnPremisesExchangeProvider(): EmailProvider {
    const host = process.env.EXCHANGE_ONPREM_HOST;
    const port = process.env.EXCHANGE_ONPREM_PORT;
    const user = process.env.EXCHANGE_ONPREM_USER;
    const pass = process.env.EXCHANGE_ONPREM_PASS;
    const domain = process.env.EXCHANGE_ONPREM_DOMAIN;
    const secure = process.env.EXCHANGE_ONPREM_SECURE === 'true';

    if (!host || !port || !user || !pass) {
      throw new Error('On-Premises Exchange configuration incomplete. Required: EXCHANGE_ONPREM_HOST, EXCHANGE_ONPREM_PORT, EXCHANGE_ONPREM_USER, EXCHANGE_ONPREM_PASS');
    }

    const config: OnPremisesExchangeConfig = {
      host,
      port: parseInt(port, 10),
      secure,
      domain,
      auth: {
        user,
        pass,
      },
    };

    return new OnPremisesExchangeProvider(config);
  }

  private static createAmazonSESProvider(): EmailProvider {
    const region = process.env.AWS_SES_REGION;
    const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
    const apiVersion = process.env.AWS_SES_API_VERSION;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('Amazon SES configuration incomplete. Required: AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY');
    }

    const config: AmazonSESConfig = {
      region,
      accessKeyId,
      secretAccessKey,
      apiVersion,
    };

    return new AmazonSESProvider(config);
  }

  private static createAzureCommunicationServicesProvider(): EmailProvider {
    const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;

    if (!connectionString) {
      throw new Error('Azure Communication Services configuration incomplete. Required: AZURE_COMMUNICATION_CONNECTION_STRING');
    }

    return new AzureCommunicationServicesProvider(connectionString);
  }

  static getProviderType(): EmailProviderType {
    const providerType = process.env.EMAIL_PROVIDER as EmailProviderType;
    const validProviders = ['resend', 'smtp', 'exchange-online', 'exchange-onprem', 'amazon-ses', 'azure-communication-services'];

    if (!providerType || !validProviders.includes(providerType)) {
      console.warn('EMAIL_PROVIDER not set or invalid, defaulting to "resend"');
      return 'resend';
    }
    return providerType;
  }
}