import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

export const ThirdPartyRelationships: Partial<AnnexCategoryStructISO & AnnexCategoryISO>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "Management of third-party AI related risks",
    description: "Managing risks when using third-party AI systems, components, or data.",
    guidance:
      "Risks associated with third-party provision or use of AI systems, components, services, or data should be identified, assessed, and managed through appropriate agreements and monitoring.",
    is_applicable: true,
    implementation_description:
      "Third-party AI risks assessed and mitigated through contractual and monitoring processes.",
    auditor_feedback: "Third-party risk management practices are effective.",
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: "Supplier agreements for AI",
    description: "Including AI-specific requirements in supplier agreements.",
    guidance:
      "Agreements with third parties supplying AI systems, components, services, or data should include relevant AI-specific requirements (e.g., security, privacy, ethics, performance).",
    is_applicable: true,
    implementation_description:
      "Supplier contracts include AI-specific clauses on security, privacy, and performance.",
    auditor_feedback: "Agreements are well structured with relevant AI terms.",
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: "Monitoring of third-party AI services",
    description: "Monitoring third-party compliance and performance.",
    guidance:
      "The performance and compliance of third parties involved in the AI system lifecycle should be monitored according to agreements.",
    is_applicable: true,
    implementation_description:
      "Regular performance and compliance reviews of third-party AI service providers conducted.",
    auditor_feedback: "Monitoring activities are timely and documented.",
  },
];
