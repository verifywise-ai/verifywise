/**
 * English copy for the "Sections that could not be completed" block of a
 * report. One module, read by both renderers (report-pdf.ejs gets it through
 * the render data, docxGenerator imports it), so the two cannot drift.
 */
export const NOTICE_TEXT = {
  failedTitle: "Sections that could not be completed",
  failedIntro:
    "Part of these sections could not be read when the report was generated. " +
    "Everything else in the report is complete.",
  failedSuffix: "could not be read.",
  failedGuidance:
    "What to do: generate the report again. If the same part is still missing, " +
    "ask your VerifyWise administrator to check the server logs for this report run.",
} as const;

/** The run-level message for a report that was produced with unreadable parts. */
export const gapsMessage = (details: string[]): string =>
  `Report generated with gaps: ${details.join("; ")} ${NOTICE_TEXT.failedSuffix.replace(/\.$/, "")}.`;

/**
 * The line under a report's incident table when archived incidents were left
 * out (they are by default). Shared by report-pdf.ejs (through the render
 * data) and docxGenerator.
 */
export const archivedIncidentsNote = (count: number): string =>
  `${count} archived ${count === 1 ? "incident is" : "incidents are"} not included.`;
