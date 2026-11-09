import { sendAutomationEmail } from "../../emailService";
import { escapeHtml } from "../../../utils/sanitization.utils";

const sendEmail = async (data: object): Promise<{ success: boolean; error?: string }> => {
  try {
    // The body is plain text from the automation's textarea, with entity
    // values (vendor, risk, task names) filled in. Escape it so those values
    // cannot inject markup, then turn line breaks into <br> tags.
    const htmlBody = escapeHtml((data as any).body).replace(/\n/g, "<br>");

    await sendAutomationEmail(
      (data as any).to as string[],
      (data as any).subject,
      htmlBody,
      (data as any).attachments,
    );

    return { success: true };
  } catch (error) {
    console.error("Failed to send email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export default sendEmail;
