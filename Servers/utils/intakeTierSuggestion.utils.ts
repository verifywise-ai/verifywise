import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

/** What the applicant said about the risk tier suggested before they submitted (#5190). */
export interface TierSuggestionResponse {
  /** The level the server scored from the submitted answers. */
  suggestedLevel: string;
  questionnaireVersion: number;
  accepted: boolean;
  /** Context the applicant added; null when they accepted without any. */
  context: string | null;
  respondedAt: string;
}

/** Stores the applicant's response on a new submission (same transaction as the submission). */
export const setTierSuggestionResponseQuery = async (
  submissionId: number,
  organizationId: number,
  response: TierSuggestionResponse,
  transaction: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
        SET tier_suggestion_response = CAST(:response AS jsonb)
      WHERE id = :submissionId AND organization_id = :organizationId`,
    {
      replacements: { response: JSON.stringify(response), submissionId, organizationId },
      transaction,
    },
  );
};

/**
 * The applicant's response for a submission in this organization: undefined
 * when the submission does not exist here, null when there is no response.
 */
export const getTierSuggestionResponseQuery = async (
  submissionId: number,
  organizationId: number,
): Promise<TierSuggestionResponse | null | undefined> => {
  const rows = (await sequelize.query(
    `SELECT tier_suggestion_response
       FROM intake_submissions
      WHERE id = :submissionId AND organization_id = :organizationId`,
    { replacements: { submissionId, organizationId }, type: QueryTypes.SELECT },
  )) as { tier_suggestion_response: TierSuggestionResponse | null }[];
  if (rows.length === 0) return undefined;
  return rows[0].tier_suggestion_response;
};
