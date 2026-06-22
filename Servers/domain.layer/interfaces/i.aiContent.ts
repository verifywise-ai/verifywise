export type BadgeType = "generated" | "assisted" | "reviewed" | "suggested";

export type ReviewAction = "approved" | "modified" | "rejected";

export interface IAIContentMetadata {
  id?: number;
  entity_type: string;
  entity_id: number;
  field_name: string | null;
  badge_type: BadgeType;
  model_used: string | null;
  model_provider: string | null;
  tool_name: string | null;
  confidence_score: number | null;
  prompt_summary: string | null;
  human_reviewed: boolean;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  review_action: ReviewAction | null;
  created_by: number | null;
  created_at: Date;
  organization_id: number;
}
