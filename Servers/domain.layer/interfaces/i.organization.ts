export type IOrganization = {
  id?: number;
  name: string;
  logo?: string;
  created_at?: Date;
  onboarding_status?: string;
  risk_assessment_mode?: "qualitative" | "quantitative";
};
