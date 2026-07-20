import fs from "fs/promises";
import path from "path";
import { uploadFile } from "../../utils/fileUpload.utils";
import { sendAutomationEmail } from "../emailService";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";

export interface DeliveryArtifact { content: Buffer; filename: string; mimeType: string; }
export interface DeliveryCtx { organizationId: number; userId: number; runId?: number; }

// Delivers a generated report across the enabled channels. Each channel is
// try/caught independently so one failure neither throws nor blocks the others.
export async function deliverReport(delivery: any, artifact: DeliveryArtifact, ctx: DeliveryCtx) {
  const status: any = {
    storage: { enabled: !!delivery.saveToStorage, status: "skipped" },
    emailLink: { enabled: !!delivery.sendEmailLink, status: "skipped" },
    attachment: { enabled: !!delivery.attachFile, status: "skipped" },
  };
  let fileId: number | undefined;

  if (delivery.saveToStorage) {
    try {
      // Reuse the existing org-scoped uploadFile. Reports are org-level (no
      // project), stored under the "All reports" file source.
      const file: any = await uploadFile(
        {
          fieldname: "report",
          originalname: artifact.filename,
          mimetype: artifact.mimeType,
          buffer: artifact.content,
          size: artifact.content.length,
        },
        ctx.userId,
        null,
        "All reports",
        ctx.organizationId,
      );
      fileId = file?.id;
      status.storage = { enabled: true, status: "success", fileId };
    } catch (e: any) {
      status.storage = { enabled: true, status: "failed", error: e.message };
    }
  }

  if (delivery.sendEmailLink || delivery.attachFile) {
    const recipients: string[] = Array.isArray(delivery.recipients) ? delivery.recipients : [];
    if (!recipients.length) {
      // Never report success for a send with nobody to send to. This was the
      // old behaviour and it is how a misconfigured schedule looked healthy
      // for weeks.
      const error = "no recipients configured";
      if (delivery.sendEmailLink) status.emailLink = { enabled: true, status: "failed", error };
      if (delivery.attachFile) status.attachment = { enabled: true, status: "failed", error };
      return { ...status, fileId };
    }

    try {
      // One email carries both channels: a link when sendEmailLink is on, the
      // file itself when attachFile is on. Two enabled channels must not mean
      // two emails to the same people.
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const downloadUrl =
        delivery.sendEmailLink && ctx.runId
          ? `${baseUrl}/api/reporting/runs/${ctx.runId}/download`
          : "";
      const template = await fs.readFile(
        path.join(__dirname, "../../templates/report-ready.mjml"),
        "utf8",
      );
      const html = await compileMjmlToHtml(template, {
        reportName: artifact.filename,
        generatedAt: new Date().toISOString().slice(0, 10),
        downloadNote: delivery.attachFile
          ? "The report is attached to this email."
          : "Use the link below to download it. You will need to be signed in.",
        // Rendered as a slot rather than a bare href so an attachment-only
        // email does not ship a button pointing at nothing.
        downloadButtonHtml: downloadUrl
          ? `<p style="margin: 28px 0 0 0;"><a href="${downloadUrl}" class="btn btn-primary">Download report</a></p>`
          : "",
      });

      await sendAutomationEmail(
        recipients,
        `Your report is ready: ${artifact.filename}`,
        html,
        delivery.attachFile
          ? [
              {
                filename: artifact.filename,
                content: artifact.content,
                contentType: artifact.mimeType,
              },
            ]
          : undefined,
      );

      if (delivery.sendEmailLink) {
        status.emailLink = { enabled: true, status: "success", recipients };
      }
      if (delivery.attachFile) {
        status.attachment = { enabled: true, status: "success", recipients };
      }
    } catch (e: any) {
      // Record the real error. A failed email does not lose the report —
      // storage already succeeded and the run stays downloadable.
      const error = e?.message ?? String(e);
      if (delivery.sendEmailLink) status.emailLink = { enabled: true, status: "failed", error };
      if (delivery.attachFile) status.attachment = { enabled: true, status: "failed", error };
    }
  }
  return { ...status, fileId };
}
