export interface ISubscription {
  id?: number;
  organization_id: number;
  tier_id: number;
  stripe_sub_id: string;
  status: "active" | "inactive" | "canceled";
  start_date: Date;
  end_date?: Date;
  created_at: Date;
  updated_at: Date;
}
