import { PolicyManagerModel } from "../../domain.layer/models/policy/policy.model";
import { formatReviewDate } from "../../utils/policyReviewDate.utils";
import { getAllPoliciesDueSoonQuery } from "../../utils/policyManager.utils";
import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import { sendSlackNotification } from "./slackNotificationService";
import { SlackNotificationRoutingType } from "../../domain.layer/enums/slack.enum";
import logger from "../../utils/logger/fileLogger";

/**
 * Daily Slack reminder for policies due soon. Sends one notification per due
 * policy of every organization, for that organization. The author, when set,
 * is the event's user (their own connections plus the organization-wide ones);
 * a policy without an author goes to the organization-wide connections only.
 *
 * Each organization and each policy is isolated: a failure is logged and the
 * job moves on. Returns the number of policies whose notification was sent.
 */
export const sendPolicyDueSoonNotification = async (): Promise<number> => {
  const organizations = await getAllOrganizationsQuery();
  if (!organizations || organizations.length === 0) return 0;

  let totalPoliciesProcessed = 0;

  for (const organization of organizations) {
    const organizationId = organization.id;
    if (organizationId === undefined || organizationId === null) continue;

    let policies: PolicyManagerModel[];
    try {
      policies = await getAllPoliciesDueSoonQuery(organizationId);
    } catch (orgError) {
      logger.error(`Error processing organization ${organizationId}:`, orgError);
      continue;
    }

    for (const policy of policies) {
      try {
        const reviewDate = policy.next_review_date
          ? formatReviewDate(policy.next_review_date)
          : "Not set";

        await sendSlackNotification(
          {
            organizationId,
            userId: policy.author_id || null,
            routingType: SlackNotificationRoutingType.POLICY_REMINDERS_AND_STATUS,
          },
          {
            title: `Policy Review Reminder`,
            message: `Policy due soon· "${policy.title}" is due on ${reviewDate} and is still incomplete. Next steps: Review Evidence, Assign Editors, Update Status.`,
          },
        );
        totalPoliciesProcessed += 1;
      } catch (policyError) {
        logger.error(
          `Failed to send the due-soon notification for policy ${policy.id} in organization ${organizationId}:`,
          policyError,
        );
      }
    }
  }

  return totalPoliciesProcessed;
};
