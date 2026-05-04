# Enterprise Email Providers Guide

VerifyWise supports multiple enterprise-grade email providers to meet the diverse needs of organizations. This guide covers the setup and configuration of each supported provider.

## Supported Providers

- **Resend** - Modern developer-focused email API
- **Generic SMTP** - Universal SMTP support for any provider
- **Exchange Online (Office 365)** - Microsoft's cloud email service
- **On-Premises Exchange** - Self-hosted Exchange servers
- **Amazon SES** - AWS Simple Email Service

## Provider Selection

Set the `EMAIL_PROVIDER` environment variable to choose your provider:

```bash
EMAIL_PROVIDER=exchange-online  # Most common for enterprises
```

## 1. Exchange Online (Office 365)

**Best for:** Organizations using Microsoft 365/Office 365

Exchange Online is the most common choice for enterprises already using Microsoft's ecosystem.

### Configuration

```bash
EMAIL_PROVIDER=exchange-online
EMAIL_ID=noreply@company.com
EXCHANGE_ONLINE_USER=noreply@company.onmicrosoft.com
EXCHANGE_ONLINE_PASS="your-app-password"
EXCHANGE_ONLINE_TENANT_ID=your-tenant-id-optional
```

### Setup Steps

1. **Create App Password** (recommended):
   - Go to Microsoft 365 admin center
   - Navigate to Users > Active users
   - Select the service account user
   - Go to "Security" tab > "App passwords"
   - Generate a new app password

2. **Enable SMTP Authentication**:
   - In Exchange admin center
   - Go to Recipients > Mailboxes
   - Select the mailbox and enable "Authenticated SMTP"

3. **Configure DNS** (if using custom domain):
   - Ensure your domain is verified in Microsoft 365
   - Add necessary MX and SPF records

### Features

- ✅ High deliverability rates
- ✅ Integrated with Microsoft ecosystem
- ✅ Enterprise security features
- ✅ Compliance and archiving capabilities

---

## 2. On-Premises Exchange Server

**Best for:** Large enterprises and government organizations requiring full control

Organizations with existing Exchange infrastructure or strict data residency requirements.

### Configuration

```bash
EMAIL_PROVIDER=exchange-onprem
EMAIL_ID=noreply@company.com
EXCHANGE_ONPREM_HOST=mail.company.com
EXCHANGE_ONPREM_PORT=587
EXCHANGE_ONPREM_USER=serviceaccount
EXCHANGE_ONPREM_PASS="service-account-password"
EXCHANGE_ONPREM_DOMAIN=COMPANY
EXCHANGE_ONPREM_SECURE=false
```

### Setup Requirements

1. **Network Configuration**:
   - Ensure the application server can reach the Exchange server
   - Port 587 (STARTTLS) or 465 (SSL) must be open
   - Firewall rules configured for SMTP relay

2. **Exchange Server Setup**:
   - Create a dedicated service account for email sending
   - Configure SMTP relay connector
   - Set appropriate authentication permissions

3. **Security Considerations**:
   - Use service accounts with minimal privileges
   - Consider certificate validation in production
   - Implement IP restrictions if possible

### Features

- ✅ Full organizational control
- ✅ Custom security policies
- ✅ Integration with Active Directory
- ✅ Compliance with internal policies

---

## 3. Amazon SES

**Best for:** SaaS applications and AWS-native architectures

Highly scalable and cost-effective solution, especially for applications already running on AWS.

### Configuration

```bash
EMAIL_PROVIDER=amazon-ses
EMAIL_ID=noreply@company.com
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=AKIAEXAMPLE123456789
AWS_SES_SECRET_ACCESS_KEY=your-secret-access-key
AWS_SES_API_VERSION=2010-12-01
SES_CONFIGURATION_SET=your-configuration-set-optional
```

### Setup Steps

1. **AWS Account Setup**:
   - Create AWS account if you don't have one
   - Request production access (starts in sandbox mode)
   - Verify your sending domain and/or email addresses

2. **IAM Configuration**:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["ses:SendEmail", "ses:SendRawEmail", "ses:GetSendQuota"],
         "Resource": "*"
       }
     ]
   }
   ```

3. **Domain Verification**:
   - Add TXT records for domain verification
   - Configure SPF, DKIM, and DMARC records
   - Set up dedicated IP if needed

### Features

- ✅ Excellent deliverability
- ✅ Detailed analytics and bounce handling
- ✅ Cost-effective at scale
- ✅ Seamless AWS integration
- ✅ Configuration sets for advanced tracking

---

## 4. Generic SMTP

**Best for:** Custom SMTP servers, legacy systems, or other email providers

Universal SMTP support for any email provider not explicitly supported.

### Configuration

```bash
EMAIL_PROVIDER=smtp
EMAIL_ID=noreply@company.com
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS="your-password"
SMTP_SECURE=false
```

### Common Providers

**SendGrid:**

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS="your-sendgrid-api-key"
```

**Mailgun:**

```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS="your-mailgun-smtp-password"
```

**Postmark:**

```bash
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=your-server-token
SMTP_PASS="your-server-token"
```

---

## 5. Resend

**Best for:** Modern applications and developer-friendly setup

Developer-focused email API with excellent deliverability and modern features.

### Configuration

```bash
EMAIL_PROVIDER=resend
EMAIL_ID=noreply@company.com
RESEND_API_KEY=re_your_api_key_here
```

### Setup Steps

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain
3. Generate an API key
4. Configure DNS records (SPF, DKIM, DMARC)

---

## Testing Email Providers

Use the built-in test script to verify your configuration:

```bash
cd Servers
ts-node scripts/quickEmailTest.ts test@example.com
```

## Switching Providers

To switch between providers:

1. Update the `EMAIL_PROVIDER` environment variable
2. Configure the required environment variables for the new provider
3. Restart the application
4. Test the new configuration

## Production Recommendations

### Security Best Practices

1. **Use dedicated service accounts** for email sending
2. **Implement app passwords** instead of user passwords where possible
3. **Restrict IP access** when supported by the provider
4. **Rotate credentials regularly**
5. **Monitor email usage** and set up alerts for unusual activity

### Reliability

1. **Configure backup providers** if critical
2. **Implement retry logic** in your application
3. **Monitor delivery rates** and bounces
4. **Set up health checks** for email functionality

### Compliance

1. **Configure proper SPF/DKIM/DMARC** records
2. **Implement unsubscribe handling** for marketing emails
3. **Log email activities** for audit purposes
4. **Follow data retention policies**

## Troubleshooting

### Common Issues

1. **Authentication failures**: Check credentials and app password setup
2. **Connection timeouts**: Verify network connectivity and firewall rules
3. **Rejected emails**: Ensure proper DNS configuration and domain verification
4. **Rate limiting**: Check provider limits and implement appropriate delays

### Debug Mode

Enable debug logging by setting:

```bash
NODE_ENV=development
```

This will provide detailed SMTP transaction logs to help diagnose issues.
