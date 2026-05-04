import { ISubscription } from "../../interfaces/i.subscriptions";

export const subscription: ISubscription[] = [
  {
    id: 1,
    organization_id: 1,
    tier_id: 2,
    stripe_sub_id: "sub_1234567890",
    status: "active",
    start_date: new Date(),
    end_date: new Date(new Date().setDate(new Date().getDate() + 30)),
    created_at: new Date(),
    updated_at: new Date(),
  },
];
