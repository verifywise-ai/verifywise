import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

export const ICT: Partial<AnnexCategoryStructISO & AnnexCategoryISO>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "Information security for AI systems",
    description: "Application of information security controls to AI systems.",
    guidance:
      "Information security requirements and controls (potentially leveraging standards like ISO/IEC 27001) should be applied throughout the AI system lifecycle to protect confidentiality, integrity, and availability.",
    is_applicable: true,
    implementation_description:
      "Information security policies based on ISO/IEC 27001 protect AI systems throughout lifecycle.",
    auditor_feedback:
      "Security controls are comprehensive and well documented.",
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: "Security of AI models",
    description: "Protecting AI models from threats.",
    guidance:
      "AI models should be protected against threats such as unauthorized access, modification, theft, or poisoning.",
    is_applicable: true,
    implementation_description:
      "AI models are protected with access controls, encryption, and integrity checks.",
    auditor_feedback: "Model security controls are adequate.",
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: "Security of AI data",
    description: "Protecting data used by AI systems.",
    guidance:
      "Data used in AI systems should be protected according to information security policies and data classification.",
    is_applicable: true,
    implementation_description:
      "Data security policies ensure protection according to classification and organizational standards.",
    auditor_feedback:
      "Data security measures are consistent with best practices.",
  },
  {
    sub_id: 4.1,
    order_no: 4,
    title: "Resilience of AI systems",
    description: "Ensuring AI systems are resilient to failures and attacks.",
    guidance:
      "AI systems should be designed and operated to be resilient against failures, errors, and attacks.",
    is_applicable: true,
    implementation_description: "",
    auditor_feedback: "",
  },
];
