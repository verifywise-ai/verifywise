import { SubscriptionModel } from "../domain.layer/models/subscriptions/subscriptions.model";
import { sequelize } from "../database/db";
import { Transaction } from "sequelize";

export async function getSubscription(): Promise<SubscriptionModel[]> {
  const subscription = await sequelize.query(`SELECT * FROM subscriptions`, {
    mapToModel: true,
    model: SubscriptionModel,
  });
  return subscription;
}

export async function getSubscriptionById(id: number): Promise<SubscriptionModel> {
  const subscription = await sequelize.query(`SELECT * FROM subscriptions WHERE id = :id`, {
    replacements: { id },
    mapToModel: true,
    model: SubscriptionModel,
  });
  if (!subscription || subscription.length === 0) {
    throw new Error(`Subscription with id ${id} not found`);
  }
  return subscription[0];
}

export async function createSubscription(
  subscription: Omit<SubscriptionModel, "id">,
  transaction: Transaction,
): Promise<SubscriptionModel> {
  const { organization_id, tier_id, stripe_sub_id, status, start_date, end_date } = subscription;
  const created_at = new Date();
  const updated_at = new Date();

  try {
    const result = await sequelize.query(
      `INSERT INTO subscriptions (
                organization_id,
                tier_id,
                stripe_sub_id,
                status,
                start_date,
                end_date,
                created_at,
                updated_at
            ) VALUES (
                :organization_id,
                :tier_id,
                :stripe_sub_id,
                :status,
                :start_date,
                :end_date,
                :created_at,
                :updated_at
            ) RETURNING *`,
      {
        replacements: {
          organization_id,
          tier_id,
          stripe_sub_id,
          status,
          start_date,
          end_date,
          created_at,
          updated_at,
        },
        mapToModel: true,
        model: SubscriptionModel,
        transaction,
      },
    );
    return result[0];
  } catch (error) {
    console.error("Error creating subscription:", error);
    throw error;
  }
}

export async function updateSubscription(
  id: number,
  subscription: Partial<SubscriptionModel>,
  transaction: Transaction,
): Promise<SubscriptionModel> {
  const updatedSubscription: Partial<Record<keyof SubscriptionModel, any>> = {};
  const setClause = ["tier_id", "stripe_sub_id", "status", "start_date", "end_date", "updated_at"]
    .filter((f) => {
      if (
        subscription[f as keyof SubscriptionModel] !== undefined &&
        subscription[f as keyof SubscriptionModel]
      ) {
        updatedSubscription[f as keyof SubscriptionModel] =
          subscription[f as keyof SubscriptionModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE subscriptions SET ${setClause} WHERE id = :id RETURNING *`;
  updatedSubscription.id = id;

  const result = await sequelize.query(query, {
    replacements: updatedSubscription,
    mapToModel: true,
    model: SubscriptionModel,
    transaction,
  });

  return result[0];
}
