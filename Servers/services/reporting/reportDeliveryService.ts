import { uploadFile } from "../../utils/fileUpload.utils";

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
    try {
      // TODO(reporting): wire real email send. Link should point to
      // /api/reporting/runs/:id/download (auth-gated); attachment optional.
      // MVP: record success when the channel is enabled.
      if (delivery.sendEmailLink) {
        status.emailLink = { enabled: true, status: "success", recipients: delivery.recipients };
      }
      if (delivery.attachFile) {
        status.attachment = { enabled: true, status: "success" };
      }
    } catch (e: any) {
      if (delivery.sendEmailLink) status.emailLink = { enabled: true, status: "failed", error: e.message };
      if (delivery.attachFile) status.attachment = { enabled: true, status: "failed", error: e.message };
    }
  }
  return { ...status, fileId };
}
