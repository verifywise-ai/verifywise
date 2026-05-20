export type PolicyTag = (typeof POLICY_TAGS)[number];

export const POLICY_TAGS = [
  "AI ethics",
  "Fairness",
  "Transparency",
  "Explainability",
  "Bias mitigation",
  "Privacy",
  "Data governance",
  "Model risk",
  "Accountability",
  "Security",
  "LLM",
  "Human oversight",
  "EU AI Act",
  "ISO 42001",
  "NIST RMF",
  "Red teaming",
  "Audit",
  "Monitoring",
  "Vendor management",
] as const;

export class PolicyManagerModel {
  id!: number;
  title!: string;
  content_html!: string;
  status!: string;
  tags?: PolicyTag[];
  next_review_date?: Date;
  author_id!: number;
  policy_owner_id?: number | null;
  assigned_reviewer_ids?: number[];
  last_updated_by!: number;
  last_updated_at!: Date;
  created_at!: Date;

  constructor(data: PolicyManagerModel) {
    this.id = data.id;
    this.title = data.title;
    this.content_html = data.content_html;
    this.status = data.status;
    this.tags = data.tags;
    this.next_review_date = data.next_review_date;
    this.author_id = data.author_id;
    this.policy_owner_id = data.policy_owner_id;
    this.assigned_reviewer_ids = data.assigned_reviewer_ids;
    this.last_updated_by = data.last_updated_by;
    this.last_updated_at = data.last_updated_at;
    this.created_at = data.created_at;
  }

  static createNewPolicyManager(data: PolicyManagerModel): PolicyManagerModel {
    return new PolicyManagerModel(data);
  }
}
