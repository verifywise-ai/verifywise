/**
 * Quick test to verify email service works with provider abstraction
 * Run with: cd Servers && ts-node scripts/quickEmailTest.ts
 */

import dotenv from "dotenv";
import { sendEmail } from "../services/emailService";

// Load environment variables
dotenv.config();

const testTemplate = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>
          <h1>VerifyWise Email Service Test</h1>
          <p>Hello {{user_name}},</p>
          <p>This email was sent using the new provider abstraction system.</p>
          <p>Current provider: {{provider_type}}</p>
          <p>Test performed at: {{timestamp}}</p>
          <p>✅ If you see this, the email service is working correctly!</p>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

async function main() {
  console.log("🧪 Testing VerifyWise Email Service");
  console.log("==================================");

  const testEmail = process.argv[2];
  if (!testEmail) {
    console.log("❌ Please provide a test email address:");
    console.log("   ts-node scripts/quickEmailTest.ts test@example.com");
    process.exit(1);
  }

  const providerType = process.env.EMAIL_PROVIDER || "resend";
  console.log(`📧 Using provider: ${providerType.toUpperCase()}`);
  console.log(`📧 Sending test email to: ${testEmail}`);

  try {
    const templateData = {
      user_name: "Test User",
      provider_type: providerType.toUpperCase(),
      timestamp: new Date().toISOString(),
    };

    const result = await sendEmail(
      testEmail,
      "VerifyWise Email Service Test",
      testTemplate,
      templateData,
    );

    if (result.success) {
      console.log("✅ Email sent successfully!");
      console.log(`📧 Message ID: ${result.messageId || "N/A"}`);
    } else {
      console.log("❌ Email failed to send:");
      console.log(`   Error: ${result.error?.name} - ${result.error?.message}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.log("💥 Test failed with error:");
    console.log(`   ${error.message}`);
    process.exit(1);
  }

  console.log("🎉 Email service test completed successfully!");
}

main().catch((error) => {
  console.error("💥 Script crashed:", error);
  process.exit(1);
});
