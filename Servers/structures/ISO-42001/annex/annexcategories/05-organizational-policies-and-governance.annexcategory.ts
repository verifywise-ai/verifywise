import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

export const OrganizationalPoliciesAndGovernance: Partial<
  AnnexCategoryStructISO & AnnexCategoryISO
>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "Policies for AI",
    description: "Management direction and support for AI via policies.",
    guidance:
      "Management should define and endorse a set of policies to provide clear direction and support for AI development and use within the organization, aligned with business objectives and relevant regulations/ethics.",
    is_applicable: true,
    implementation_description:
      "Management has formalized AI policies aligned with industry regulations and ethical guidelines.",
    auditor_feedback:
      "Policies are adequate but require periodic updates reflecting regulatory changes.",
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: "AI governance framework",
    description: "Establishment of a governance structure for AI oversight.",
    guidance:
      "An AI governance framework, including roles, responsibilities, processes, and oversight mechanisms, should be established and maintained to direct and control the organization’s AI-related activities.",
    is_applicable: true,
    implementation_description:
      "A governance structure with defined roles and oversight committees has been established.",
    auditor_feedback: "Framework is robust; recommend more frequent audits.",
  },
  // NOTE: items previously at order_no 3-8 were de-duplicated / moved to A.6:
  //   - 3.1 "AI roles and responsibilities" and 3.2 "Segregation of duties"
  //     were duplicates of A.6.1.1 / A.6.1.2 and are removed.
  //   - 4.1 "Accountability for AI systems", 5.1 "Contact with authorities",
  //     5.2 "Contact with special interest groups", 6.1 "AI in project
  //     management" belong under ISO A.3 (Internal organization = VW A.6) and
  //     were reparented in migration 20260420105046-iso42001-dedupe-a5-move-to-a6.js
];
