import { AIliteracy } from "./01-ai-literacy.subcontrol";
import { TransparencyProvision } from "./02-transparency-provision";
import { HumanOversight } from "./03-human-oversight .subcontrol";
import { CorrectiveActionsDutyOfInfo } from "./04-corrective-actions.subcontrol";
import { ResponsibilitiesAlongAI } from "./05-responsibilities.subcontrol";
import { ObligationsOfDeployersAIsystems } from "./06-obligations-of-deployers.subcontrol";
import { FundamentalRightsImpactAssessments } from "./07-fundamental-rights.subcontrol";
import { TransparencyObligationsForProviders } from "./08-transparency-obligations-for-providers.subcontrol";
import { Registration } from "./09-registration.subcontrol";
import { EUdatabaseForHighRiskAI } from "./10-eu-database-for-high-risk.subcontrol";
import { PostMarketMonitoringByProviders } from "./11-post-market-monitor-by-providers.subcontrol";
import { ReportingSeriousIncidents } from "./12-report-serious-incidents.subcontrol";
import { GeneralPurposeAImodels } from "./13-general-purpose-ai.subcontrol";

export const ControlGroups = [
  { id: 1, controlGroupTitle: "AI literacy", control: AIliteracy },
  {
    id: 2,
    controlGroupTitle: "Transparency and provision of information to deployers",
    control: TransparencyProvision,
  },
  { id: 3, controlGroupTitle: "Human oversight", control: HumanOversight },
  {
    id: 4,
    controlGroupTitle: "Corrective actions and duty of information",
    control: CorrectiveActionsDutyOfInfo,
  },
  {
    id: 5,
    controlGroupTitle: "Responsibilities along the AI value chain",
    control: ResponsibilitiesAlongAI,
  },
  {
    id: 6,
    controlGroupTitle: "Obligations of deployers of high-risk AI systems",
    control: ObligationsOfDeployersAIsystems,
  },
  {
    id: 7,
    controlGroupTitle: "Fundamental rights impact assessments for high-risk AI systems",
    control: FundamentalRightsImpactAssessments,
  },
  {
    id: 8,
    controlGroupTitle: "Transparency obligations for providers and users of certain AI systems",
    control: TransparencyObligationsForProviders,
  },
  { id: 9, controlGroupTitle: "Registration", control: Registration },
  {
    id: 10,
    controlGroupTitle: "EU database for high-risk AI systems listed in Annex III",
    control: EUdatabaseForHighRiskAI,
  },
  {
    id: 11,
    controlGroupTitle:
      "Post-market monitoring by providers and post-market monitoring plan for high-risk AI systems",
    control: PostMarketMonitoringByProviders,
  },
  {
    id: 12,
    controlGroupTitle: "Reporting of serious incidents",
    control: ReportingSeriousIncidents,
  },
  {
    id: 13,
    controlGroupTitle: "General-purpose AI models",
    control: GeneralPurposeAImodels,
  },
];
