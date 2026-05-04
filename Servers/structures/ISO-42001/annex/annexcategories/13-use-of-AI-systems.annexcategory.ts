import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

/**
 * VW A.13 / ISO 42001 A.10 — Use of AI systems.
 * Responsible use, intended-use documentation, and transparency for users of
 * AI systems operated by the organization.
 */
export const UseOfAISystems: Partial<AnnexCategoryStructISO & AnnexCategoryISO>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "Responsible use of AI",
    description:
      "Ensuring AI systems are used responsibly and in accordance with organizational policies and ethical principles.",
    guidance:
      "The organization should establish policies and procedures to ensure AI systems are used responsibly, including appropriate human oversight, monitoring of outcomes, and adherence to ethical principles and organizational AI policy throughout operation.",
    is_applicable: true,
    implementation_description:
      "Responsible use policies define human oversight requirements, monitoring obligations, and ethical boundaries for AI system operation.",
    auditor_feedback:
      "Responsible use policies are documented. Verify operational adherence through periodic spot checks.",
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: "Intended use documentation",
    description:
      "Documenting the intended purpose, conditions of use, and known limitations of AI systems.",
    guidance:
      "The intended purpose, operational conditions, known limitations, and boundaries of each AI system should be clearly documented and communicated to users and operators to prevent misuse and ensure appropriate application.",
    is_applicable: true,
    implementation_description:
      "Each AI system has documented intended use specifications including purpose, operational boundaries, known limitations, and prohibited uses.",
    auditor_feedback:
      "Intended use documentation exists for major systems. Ensure coverage extends to all deployed AI systems including embedded components.",
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: "Transparency for users of AI systems",
    description:
      "Providing users with clear information about AI system behavior, capabilities, and limitations.",
    guidance:
      "Users of AI systems should be provided with clear, accessible information about how the AI system works, what it can and cannot do, the basis for its outputs, and how to interpret results, appropriate to the user's role and context.",
    is_applicable: true,
    implementation_description:
      "User-facing documentation and in-system disclosures explain AI behavior, output interpretation, confidence levels, and limitations.",
    auditor_feedback:
      "Transparency measures are in place. Recommend testing user comprehension to validate effectiveness.",
  },
];
