import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import {
  getRisksApproachingDeadlineQuery,
  getModelRisksApproachingTargetDateQuery,
  hasDeadlineNoticeQuery,
  getDeadlineAdminIdsQuery,
  DeadlineEscalationRow,
} from "../../../utils/deadline.utils";
import { notifyRiskDeadlineDueSoon, notifyModelRiskDueSoon } from "../../inAppNotification.service";
import { sendDeadlineDueSoonSlackNotification } from "../../slack/deadlineDueSoonNotification";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";
import logger from "../../../utils/logger/fileLogger";

/**
 * Deadline & SLA escalation — nightly sweep.
 *
 * Two thresholds, two channels: 7 days out the owner plus every org admin get
 * an in-app notification plus an email; 1 day out they get Slack. Range
 * queries (not exact-day equality) so a missed run catches up the next night.
 *
 * Dedup is per recipient per entity per threshold per deadline, checked
 * immediately before each write via the notifications table itself
 * (metadata.threshold_days + metadata.deadline) — so rescheduling a deadline
 * re-arms both notices for the new date.
 * A failed write leaves no record, so the next night retries exactly that
 * recipient. Every recipient's write sits in its own try/catch — one failure
 * never aborts the row, the org, or the run.
 */

export const DEADLINE_EMAIL_DAYS = 7;
export const DEADLINE_SLACK_DAYS = 1;

export interface DeadlineSweepSummary {
  scanned: number;
  /** 7-day leg notices (in-app + email each). */
  emailed: number;
  /** 1-day leg notices (Slack + in-app dedup record each). */
  slacked: number;
}

type EscalationKind = "risk" | "model_risk";

const typeFor = (kind: EscalationKind): NotificationType =>
  kind === "risk" ? NotificationType.RISK_DEADLINE_DUE_SOON : NotificationType.MODEL_RISK_DUE_SOON;

const entityTypeFor = (kind: EscalationKind): NotificationEntityType =>
  kind === "risk" ? NotificationEntityType.RISK : NotificationEntityType.MODEL;

const distanceText = (deadline: Date): string => {
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  if (daysLeft > 1) return `in ${daysLeft} days`;
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === 0) return "today";
  return `${-daysLeft} days overdue`;
};

const dateText = (deadline: Date): string =>
  deadline.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** Owner plus every admin, de-duplicated — an owner who is also an admin gets one notice. */
const recipientsFor = (row: DeadlineEscalationRow, adminIds: number[]): number[] => {
  const ids = [...adminIds];
  if (row.owner_id != null && !ids.includes(row.owner_id)) ids.push(row.owner_id);
  return ids;
};

/**
 * One recipient's outcome: `fresh` when they had no notice for this threshold
 * yet (so one was written now), `sent` the deliveries to count.
 */
interface LegResult {
  fresh: boolean;
  sent: number;
}

const ALREADY_NOTIFIED: LegResult = { fresh: false, sent: 0 };

const slackNoticeFor = (kind: EscalationKind, row: DeadlineEscalationRow) => ({
  entityKind: kind === "risk" ? ("Risk" as const) : ("Model risk" as const),
  entityName: row.entity_name,
  distanceText: distanceText(row.deadline),
  deadlineText: dateText(row.deadline),
});

/** 7-day leg: in-app + email. */
async function sendEmailLeg(
  organizationId: number,
  kind: EscalationKind,
  row: DeadlineEscalationRow,
  recipientId: number,
  baseUrl: string,
): Promise<LegResult> {
  const already = await hasDeadlineNoticeQuery(
    organizationId,
    recipientId,
    typeFor(kind),
    entityTypeFor(kind),
    row.entity_id,
    DEADLINE_EMAIL_DAYS,
    row.deadline,
  );
  if (already) return ALREADY_NOTIFIED;
  if (kind === "risk") {
    await notifyRiskDeadlineDueSoon(
      organizationId,
      recipientId,
      { id: row.entity_id, name: row.entity_name, deadline: row.deadline },
      DEADLINE_EMAIL_DAYS,
      baseUrl,
      true,
    );
  } else {
    await notifyModelRiskDueSoon(
      organizationId,
      recipientId,
      {
        id: row.entity_id,
        name: row.entity_name,
        deadline: row.deadline,
        model_id: row.model_id ?? null,
      },
      DEADLINE_EMAIL_DAYS,
      baseUrl,
      true,
    );
  }
  return { fresh: true, sent: 1 };
}

/**
 * 1-day leg: Slack, plus an in-app row (no email) as the dedup record — the
 * Slack send itself leaves no trace, and without the row the notice would
 * re-fire every night. The in-app row is the durable notice (Slack is
 * best-effort); `slacked` counts actual Slack deliveries only, so a silent
 * Slack outage is visible in the summary instead of hidden behind the record.
 */
async function sendSlackLeg(
  organizationId: number,
  kind: EscalationKind,
  row: DeadlineEscalationRow,
  recipientId: number,
  baseUrl: string,
): Promise<LegResult> {
  const already = await hasDeadlineNoticeQuery(
    organizationId,
    recipientId,
    typeFor(kind),
    entityTypeFor(kind),
    row.entity_id,
    DEADLINE_SLACK_DAYS,
    row.deadline,
  );
  if (already) return ALREADY_NOTIFIED;
  // The recipient's own Slack connections only; organization-wide ones get
  // one post per row from the sweep loop, not one per recipient.
  const slack = await sendDeadlineDueSoonSlackNotification(
    organizationId,
    recipientId,
    slackNoticeFor(kind, row),
  );
  if (kind === "risk") {
    await notifyRiskDeadlineDueSoon(
      organizationId,
      recipientId,
      { id: row.entity_id, name: row.entity_name, deadline: row.deadline },
      DEADLINE_SLACK_DAYS,
      baseUrl,
      false,
    );
  } else {
    await notifyModelRiskDueSoon(
      organizationId,
      recipientId,
      {
        id: row.entity_id,
        name: row.entity_name,
        deadline: row.deadline,
        model_id: row.model_id ?? null,
      },
      DEADLINE_SLACK_DAYS,
      baseUrl,
      false,
    );
  }
  // Honest count: the in-app record is always written above, but `slacked`
  // means a Slack message actually left the building.
  return { fresh: true, sent: slack?.delivered === true ? 1 : 0 };
}

/** Sweep one org. Each recipient's write is isolated: log and continue. */
export async function runDeadlineEscalationSweep(
  organizationId: number,
): Promise<DeadlineSweepSummary> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  let scanned = 0;
  let emailed = 0;
  let slacked = 0;

  const adminIds = await getDeadlineAdminIdsQuery(organizationId);

  const legs: {
    kind: EscalationKind;
    rows: DeadlineEscalationRow[];
    send: (
      organizationId: number,
      kind: EscalationKind,
      row: DeadlineEscalationRow,
      recipientId: number,
      baseUrl: string,
    ) => Promise<LegResult>;
    count: "emailed" | "slacked";
  }[] = [
    {
      kind: "risk",
      rows: await getRisksApproachingDeadlineQuery(organizationId, DEADLINE_EMAIL_DAYS),
      send: sendEmailLeg,
      count: "emailed",
    },
    {
      kind: "model_risk",
      rows: await getModelRisksApproachingTargetDateQuery(organizationId, DEADLINE_EMAIL_DAYS),
      send: sendEmailLeg,
      count: "emailed",
    },
    {
      kind: "risk",
      rows: await getRisksApproachingDeadlineQuery(organizationId, DEADLINE_SLACK_DAYS),
      send: sendSlackLeg,
      count: "slacked",
    },
    {
      kind: "model_risk",
      rows: await getModelRisksApproachingTargetDateQuery(organizationId, DEADLINE_SLACK_DAYS),
      send: sendSlackLeg,
      count: "slacked",
    },
  ];

  for (const leg of legs) {
    scanned += leg.rows.length;
    for (const row of leg.rows) {
      let anyFresh = false;
      let anyAlready = false;
      for (const recipientId of recipientsFor(row, adminIds)) {
        try {
          const { fresh, sent } = await leg.send(
            organizationId,
            leg.kind,
            row,
            recipientId,
            baseUrl,
          );
          anyFresh = anyFresh || fresh;
          anyAlready = anyAlready || !fresh;
          if (leg.count === "emailed") emailed += sent;
          else slacked += sent;
        } catch (error) {
          logger.error(
            `❌ Deadline escalation failed for org ${organizationId} recipient ${recipientId} entity ${row.entity_id}:`,
            error,
          );
        }
      }
      // Organization-wide Slack connections: one post per row and deadline, on
      // the first run that notifies anyone about it. A run where some recipient
      // already had their 1-day record (a new Admin, an owner change, a retry
      // after a failed write) is not the first, so the shared channel is not
      // posted to again. A recipient whose send threw counts as neither fresh
      // nor already notified.
      if (leg.count === "slacked" && anyFresh && !anyAlready) {
        try {
          const slack = await sendDeadlineDueSoonSlackNotification(
            organizationId,
            null,
            slackNoticeFor(leg.kind, row),
          );
          if (slack?.delivered === true) slacked += 1;
        } catch (error) {
          logger.error(
            `❌ Deadline escalation Slack post failed for org ${organizationId} entity ${row.entity_id}:`,
            error,
          );
        }
      }
    }
  }

  return { scanned, emailed, slacked };
}

/**
 * Sweep every org — the BullMQ daily job entry point. Isolated per org so one
 * org's failure cannot block the others.
 */
export async function runDeadlineEscalationSweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runDeadlineEscalationSweep(org.id);
      if (summary.emailed > 0 || summary.slacked > 0) {
        logger.info(
          `Deadline escalation sweep org ${org.id}: scanned=${summary.scanned} emailed=${summary.emailed} slacked=${summary.slacked}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Deadline escalation sweep failed for org ${org.id}:`, error);
    }
  }
}
