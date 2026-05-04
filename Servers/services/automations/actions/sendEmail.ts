import { sendAutomationEmail } from "../../emailService";

const sendEmail = async (data: Object): Promise<{ success: boolean; error?: string }> => {
  try {
    // Convert plain text line breaks to HTML <br> tags for proper email formatting
    const htmlBody = (data as any).body.replace(/\n/g, "<br>");

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
