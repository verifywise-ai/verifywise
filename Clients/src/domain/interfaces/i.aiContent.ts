export type BadgeType = "generated" | "assisted" | "reviewed" | "suggested";

export type ReviewAction = "approved" | "modified" | "rejected";

export interface AIContentMetadata {
  id: number;
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
  reviewed_at: string | null;
  review_action: ReviewAction | null;
  created_by: number | null;
  created_at: string;
}
