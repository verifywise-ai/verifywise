import { PolicyManagerModel } from "../../domain.layer/models/policy/policy.model";
import { getAllPoliciesDueSoonQuery } from "../../utils/policyManager.utils";
import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import { sendSlackNotification } from "./slackNotificationService";
import { SlackNotificationRoutingType } from "../../domain.layer/enums/slack.enum";
import logger from "../../utils/logger/fileLogger";
import { getAllUsersQuery } from "../../utils/user.utils";

export const sendPolicyDueSoonNotification = async (): Promise<number> => {
  // const functionName = "sendPolicyDueSoonNotification";
  // const fileName = "policyDueSoonNotification.ts";
  // logProcessing({
  //   description: `Sending Slack Notification for Policies due soon across all organizations.`,
  //   functionName,
  //   fileName,
  // });

  try {
    // Get all organizations
    const organizations = await getAllOrganizationsQuery();

    if (!organizations || organizations.length === 0) {
      // await logSuccess({
      //   eventType: "Read",
      //   description: `No organizations found to check for policies due soon.`,
      //   functionName,
      //   fileName,
      // });
      return 0;
    }

    let totalPoliciesProcessed = 0;

    // Iterate through each organization
    for (const organization of organizations) {
      const organizationId = organization.id!;
      const users = await getAllUsersQuery(organizationId);
      const admins = users.filter((user) => user.role_id === 1);

      try {
        // Get all policies due soon for this organization
        const policies: PolicyManagerModel[] =
          await getAllPoliciesDueSoonQuery(organizationId);

        if (policies.length > 0) {
          // Send notification for each policy
          for (const policy of policies) {
            try {
              let userToNotify: number = 0;
              // Add author
              if (policy.author_id) {
                userToNotify = policy.author_id;
              }

              // Format the notification message
              const reviewDate = policy.next_review_date
                ? new Date(policy.next_review_date).toLocaleDateString(
                  "en-US",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  },
                )
                : "Not set";

              const message = {
                title: `Policy Review Reminder`,
                message: `Policy due soon· "${policy.title}" is due on ${reviewDate} and is still incomplete. Next steps: Review Evidence, Assign Editors, Update Status.`,
              };

              // Send notification to each user
              if (userToNotify > 0) {
                try {
                  await sendSlackNotification(
                    {
                      userId: userToNotify,
                      routingType:
                        SlackNotificationRoutingType.POLICY_REMINDERS_AND_STATUS,
                    },
                    message,
                  );
                  totalPoliciesProcessed += 1;
                  return userToNotify;
                } catch (notificationError) {
                  // Log but don't stop processing other notifications
                  logger.error(
                    `Failed to send notification to user ${userToNotify} for policy ${policy.id}:`,
                    notificationError,
                  );
                }
              }
              return userToNotify;
            } catch (policyError) {
              logger.error(
                `Error processing policy ${policy.id} in organization ${organizationId}:`,
                policyError,
              );
            }
          }
        }
        return admins[0].id || 0;
      } catch (orgError) {
        logger.error(
          `Error processing organization ${organizationId}:`,
          orgError,
        );
      }
    }

    // await logSuccess({
    //   eventType: "Read",
    //   description: `Processed ${totalPoliciesProcessed} policies across ${organizations.length} organizations.`,
    //   functionName,
    //   fileName,
    // });
  } catch (error) {
    // await logFailure({
    //   eventType: "Read",
    //   description: `Failed to send Slack Notifications for Policies due soon.`,
    //   functionName,
    //   fileName,
    //   error: error as Error,
    // });
    throw error;
  }
  return 0;
};
