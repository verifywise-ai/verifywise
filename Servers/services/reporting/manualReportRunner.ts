import { generateReport } from "./index";
import { updateRunStatusQuery } from "../../utils/reportRun.utils";
import { uploadFile } from "../../utils/fileUpload.utils";
import { mapReportTypeToFileSource } from "../../controllers/reporting.ctrl";
import type { ReportGenerationRequest } from "../../domain.layer/interfaces/i.reportGeneration";
import logger from "../../utils/logger/fileLogger";

// Worker-side executor for a manual (non-scheduled) report run. The run row was
// already created (status 'running') by the controller so it could return an id;
// here we generate, upload, and set the final status. Never throws — a failure
// is recorded on the run, because the caller is a BullMQ job with no user to 500.
export async function executeManualRun(
  runId: number,
  request: ReportGenerationRequest,
  userId: number,
  organizationId: number,
): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await generateReport(request, userId, organizationId);
    if (!result.success) {
      await updateRunStatusQuery(runId, {
        status: "failed",
        error_message: result.error ?? "generation failed",
        duration_ms: Date.now() - startedAt,
      });
      return;
    }

    const uploaded = await uploadFile(
      { originalname: result.filename, buffer: result.content, fieldname: "file", mimetype: result.mimeType },
      userId,
      request.projectId,
      mapReportTypeToFileSource(request.reportType),
      organizationId,
    );

    // No file id means the download path has nothing to serve — record a
    // failure, not a success the frontend would render with a broken link.
    if (!uploaded?.id) {
      await updateRunStatusQuery(runId, {
        status: "failed",
        error_message: "file upload returned no id",
        duration_ms: Date.now() - startedAt,
      });
      return;
    }

    await updateRunStatusQuery(runId, {
      status: "success",
      file_id: uploaded?.id ?? null,
      output_filename: uploaded?.filename ?? result.filename,
      output_mime_type: result.mimeType,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    logger.error("executeManualRun failed", e);
    await updateRunStatusQuery(runId, {
      status: "failed",
      error_message: e?.message ?? "unknown error",
      duration_ms: Date.now() - startedAt,
    });
  }
}
