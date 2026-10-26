// Servers/services/intakeScoring/enqueue.ts
// Queueing for the intake assessment job. Kept apart from the job itself so
// the submit handlers can enqueue without loading the scoring code.
import { automationQueue } from "../automations/automationProducer";

export type AssessmentStage = "scoring" | "suggestions";

export interface IntakeAssessmentJobData {
  organizationId: number;
  submissionId: number;
  stages: AssessmentStage[];
  /** Send the new-submission email once both stages have settled. */
  notify: boolean;
  lang?: string;
  /**
   * With no form recipients, email the organization's admins instead of
   * nobody. Set by the legacy submit handler, which always did this.
   */
  adminFallback?: boolean;
}

/** How long the new-submission email waits for results before it goes anyway. */
export const NOTIFY_CAP_MS = 120_000;

export async function enqueueIntakeAssessment(data: IntakeAssessmentJobData): Promise<void> {
  const { organizationId, submissionId, stages, lang, adminFallback } = data;
  await automationQueue.add("intake_assessment", data, {
    // BullMQ rejects a custom id with ":" unless it has exactly 3 ":"-parts.
    jobId: `intake-assessment:${organizationId}:${submissionId}-${stages.join("+")}`,
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: true,
  });
  if (data.notify) {
    await automationQueue.add(
      "intake_notify_cap",
      { organizationId, submissionId, lang, adminFallback },
      {
        delay: NOTIFY_CAP_MS,
        jobId: `intake-notify-cap:${organizationId}:${submissionId}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
