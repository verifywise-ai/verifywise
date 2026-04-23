import type { Role, RiskTier } from "../../../domain.layer/frameworks/EU-AI-Act/euActTypes";
import { ProhibitedPractices } from "./controls/00-prohibited-practices.controls";
import { AIliteracy } from "./controls/01-ai-literacy.controls";
import { TransparencyProvision } from "./controls/02-transparency-provision.controls";
import { HumanOversight } from "./controls/03-human-oversight.controls";
import { CorrectiveActionsDutyOfInfo } from "./controls/04-corrective-actions.controls";
import { ResponsibilitiesAlongAI } from "./controls/05-responsibilities.control";
import { ObligationsOfDeployersAIsystems } from "./controls/06-obligations-of-deployers.control";
import { FundamentalRightsImpactAssessments } from "./controls/07-fundamental-rights.control";
import { TransparencyObligationsForProviders } from "./controls/08-transparency-obligations-for-providers.control";
import { Registration } from "./controls/09-registration.control";
import { EUdatabaseForHighRiskAI } from "./controls/10-eu-database-for-high-risk.control";
import { PostMarketMonitoringByProviders } from "./controls/11-post-market-monitor-by-providers.control";
import { ReportingSeriousIncidents } from "./controls/12-report-serious-incidents.control";
import { GeneralPurposeAImodels } from "./controls/13-general-purpose-ai.control";
import { RiskClassification } from "./controls/14-risk-classification.controls";
import { QualityManagementSystem } from "./controls/15-quality-management-system.controls";
import { ProviderDocumentation } from "./controls/16-provider-documentation.controls";
import { ConformityAndMarketAccess } from "./controls/17-conformity-and-market-access.controls";
import { DeployerDataRights } from "./controls/18-deployer-data-rights.controls";

/**
 * Registration of EU AI Act control categories.
 *
 * Each entry carries `article` (safe — derived from the category's obligation Article)
 * but leaves `roles` and `riskTiers` UNPOPULATED for now. Those per-category
 * assignments need review against the actual Article text before they go live
 * (see plan: "Per-category roles / riskTiers assignments are unverified").
 * Once a verified Article × role × tier table is approved, populate those fields
 * in this file and run the reseed migration.
 */
type RegistrationSubControl = {
  order_no: number;
  title: string;
  description: string;
  implementation_details?: string;
  evidence_description?: string;
  feedback_description?: string;
  article?: string;
  roles?: Role[];
  riskTiers?: RiskTier[];
};

type RegistrationControl = {
  order_no: number;
  title: string;
  description: string;
  implementation_details?: string;
  article?: string;
  roles?: Role[];
  riskTiers?: RiskTier[];
  subControls: RegistrationSubControl[];
};

type ControlCategoryRegistration = {
  order_no: number;
  title: string;
  article?: string;
  roles?: Role[];
  riskTiers?: RiskTier[];
  controls: RegistrationControl[];
};

export const ControlCategories: ControlCategoryRegistration[] = [
  {
    order_no: 0,
    title: "Prohibited AI practices",
    article: "Art. 5",
    controls: ProhibitedPractices,
  },
  {
    order_no: 1,
    title: "AI literacy",
    article: "Art. 4",
    controls: AIliteracy,
  },
  {
    order_no: 2,
    title: "Transparency and provision of information to deployers",
    article: "Art. 13",
    controls: TransparencyProvision,
  },
  {
    order_no: 3,
    title: "Human oversight",
    article: "Art. 14",
    controls: HumanOversight,
  },
  {
    order_no: 4,
    title: "Corrective actions and duty of information",
    article: "Art. 20",
    controls: CorrectiveActionsDutyOfInfo,
  },
  {
    order_no: 5,
    title: "Responsibilities along the AI value chain",
    article: "Art. 25",
    controls: ResponsibilitiesAlongAI,
  },
  {
    order_no: 6,
    title: "Obligations of deployers of high-risk AI systems",
    article: "Art. 26",
    controls: ObligationsOfDeployersAIsystems,
  },
  {
    order_no: 7,
    title: "Fundamental rights impact assessments for high-risk AI systems",
    article: "Art. 27",
    controls: FundamentalRightsImpactAssessments,
  },
  {
    order_no: 8,
    title:
      "Transparency obligations for providers and users of certain AI systems",
    article: "Art. 50",
    controls: TransparencyObligationsForProviders,
  },
  {
    order_no: 9,
    title: "Registration",
    article: "Art. 49",
    controls: Registration,
  },
  {
    order_no: 10,
    title: "EU database for high-risk AI systems listed in Annex III",
    article: "Art. 71",
    controls: EUdatabaseForHighRiskAI,
  },
  {
    order_no: 11,
    title:
      "Post-market monitoring by providers and post-market monitoring plan for high-risk AI systems",
    article: "Art. 72",
    controls: PostMarketMonitoringByProviders,
  },
  {
    order_no: 12,
    title: "Reporting of serious incidents",
    article: "Art. 73",
    controls: ReportingSeriousIncidents,
  },
  {
    order_no: 13,
    title: "General-purpose AI models",
    article: "Art. 51-55",
    controls: GeneralPurposeAImodels,
  },
  {
    order_no: 14,
    title: "High-risk AI system classification",
    article: "Art. 6-7",
    controls: RiskClassification,
  },
  {
    order_no: 15,
    title: "Quality management system",
    article: "Art. 17",
    controls: QualityManagementSystem,
  },
  {
    order_no: 16,
    title: "Provider technical requirements",
    article: "Art. 9-12, 15, 18-19",
    controls: ProviderDocumentation,
  },
  {
    order_no: 17,
    title: "Conformity assessment and market access",
    article: "Art. 22, 43-48",
    controls: ConformityAndMarketAccess,
  },
  {
    order_no: 18,
    title: "Deployer data protection and explanation obligations",
    article: "Art. 26(5)-(6), Art. 85",
    controls: DeployerDataRights,
  },
];
