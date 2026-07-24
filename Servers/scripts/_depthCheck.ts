/**
 * Design success criteria 3-6, against the development database.
 *
 * Runs one real AI-enhanced report through the same three calls the scheduled
 * runner makes — createRunQuery, generateReport, persistAnalyses — and writes
 * both output formats to /tmp so criterion 6 can be read.
 *
 * deliverReport and uploadFile are deliberately NOT called: delivery would
 * exercise the email and file-storage channels, which have nothing to do with
 * analyzer depth and one of which sends mail.
 *
 * The run is attached to scheduled report 3, which already has a prior run, so
 * the §10 prior-facts lookup runs for real. On the FIRST invocation there is no
 * stored snapshot to find (the existing rows predate §10) and the facts block
 * carries no delta lines; a SECOND invocation finds this run's snapshot and
 * does. Both are correct.
 */
import { writeFileSync } from "fs";
import { generateReport } from "../services/reporting";
import { persistAnalyses } from "../services/reporting/analyzers/persistAnalyses";
import { createRunQuery, updateRunStatusQuery } from "../utils/reportRun.utils";
import { sequelize } from "../database/db";

const ORG_ID = 1;
const USER_ID = 1;
// Attaching to an existing schedule is what makes §10 reachable. Nothing about
// this schedule's own config is used: the request below is built by hand so the
// risk and vendor sections are present (criterion 5).
const SCHEDULE_ID = 3;

const request: any = {
  projectId: 1,
  frameworkId: 1,
  projectFrameworkId: 1,
  // Every section that carries data on this database. riskAnalysis reads
  // projectRisks/vendorRisks/modelRisks and vendorRisk reads vendors/vendorRisks
  // (registry.ts:63-64) — omit these and both abstain by design, which is what
  // happened on all three stored runs.
  reportType: [
    "projectRisks",
    "vendorRisks",
    "modelRisks",
    "vendors",
    "models",
    "compliance",
    "policyManager",
    "trainingRegistry",
  ],
  format: "pdf",
  aiEnhanced: true,
  scheduledReportId: SCHEDULE_ID,
  aiBlocks: {
    sectionSummaries: true,
    executiveSummary: true,
    keyFindings: true,
    recommendedActions: true,
    riskAnalysis: true,
    complianceGap: true,
    vendorRisk: true,
  },
};

(async () => {
  const run = await createRunQuery({
    organization_id: ORG_ID,
    scheduled_report_id: SCHEDULE_ID,
    triggered_by: "manual",
    triggered_by_user_id: USER_ID,
    config_snapshot: { ai_blocks_config: request.aiBlocks },
  });
  console.log("RUN_ID:", run.id);

  const pdf = await generateReport(request, USER_ID, ORG_ID);
  if (!pdf.success) throw new Error(`pdf generation failed: ${pdf.error}`);
  writeFileSync("/tmp/depth-check.pdf", pdf.content);

  await persistAnalyses(run.id, ORG_ID, USER_ID, pdf.analyses, (pdf as any).factsSnapshot);
  await updateRunStatusQuery(run.id, ORG_ID, {
    status: "success",
    output_filename: "depth-check.pdf",
    output_mime_type: "application/pdf",
  });

  const docx = await generateReport({ ...request, format: "docx" }, USER_ID, ORG_ID);
  if (!docx.success) throw new Error(`docx generation failed: ${docx.error}`);
  writeFileSync("/tmp/depth-check.docx", docx.content);

  console.log("\n=== ANALYZERS (pdf run, persisted to run", run.id, ") ===");
  for (const [key, value] of Object.entries<any>(pdf.analyses ?? {})) {
    console.log(
      key.padEnd(20),
      value.abstained ? `ABSTAIN -> ${value.abstain_reason}` : "OK",
      "attempts:",
      value.attempts,
      "restatementRetried:",
      value.restatementRetried,
    );
  }
  console.log("\nPDF  /tmp/depth-check.pdf");
  console.log("DOCX /tmp/depth-check.docx");
})()
  .then(async () => {
    await sequelize.close();
    // The pdf renderer's browser and the redis client keep handles open; the
    // work is done, so exit rather than hang.
    process.exit(0);
  })
  .catch(async (e: any) => {
    console.error("DEPTH CHECK FAILED:", e?.stack || e?.message || e);
    await sequelize.close();
    process.exit(1);
  });
