import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

export const DataForAISystems: Partial<
  AnnexCategoryStructISO & AnnexCategoryISO
>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "Data quality for AI systems",
    description: "Processes to ensure data quality characteristics.",
    guidance:
      "Processes should be implemented to ensure that data used for developing and operating AI systems meets defined quality criteria relevant to its intended use (e.g., accuracy, completeness, timeliness, relevance, representativeness).",
    is_applicable: true,
    implementation_description:
      "Processes ensure data accuracy, completeness, and timeliness aligned with AI use cases.",
    auditor_feedback: "Data quality controls are well implemented.",
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: "Data acquisition",
    description: "Managing the acquisition of data for AI.",
    guidance:
      "Data acquisition processes should ensure data is obtained legally, ethically, and according to specified requirements.",
    is_applicable: true,
    implementation_description:
      "Data acquisition complies with legal and ethical standards with documented approval.",
    auditor_feedback:
      "Data acquisition processes meet regulatory requirements.",
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: "Data preparation",
    description: "Preparing data for use in AI systems.",
    guidance:
      "Data should be prepared (cleaned, transformed, annotated) suitable for its intended use in AI system development and operation.",
    is_applicable: true,
    implementation_description:
      "Data is cleaned, annotated, and transformed per model requirements.",
    auditor_feedback: "Preparation methods are appropriate and consistent.",
  },
  {
    sub_id: 4.1,
    order_no: 4,
    title: "Data provenance",
    description: "Documenting the origin and history of data.",
    guidance:
      "Information about the origin, history, and processing steps applied to data (provenance) should be documented and maintained.",
    is_applicable: true,
    implementation_description:
      "Automated lineage tracking tools document data origin and transformation steps.",
    auditor_feedback: "Provenance documentation is comprehensive.",
  },
  {
    sub_id: 5.1,
    order_no: 5,
    title: "Data privacy",
    description: "Protecting privacy in data used for AI.",
    guidance:
      "Privacy requirements should be addressed throughout the data lifecycle, including anonymization or pseudonymization where appropriate.",
    is_applicable: true,
    implementation_description:
      "Privacy controls include anonymization and pseudonymization compliant with GDPR.",
    auditor_feedback: "Privacy protection measures are effective.",
  },
  {
    sub_id: 6.1,
    order_no: 6,
    title: "Data handling",
    description: "Securely handling data throughout its lifecycle.",
    guidance:
      "Data should be handled securely, including storage, access control, transmission, and disposal, according to its classification and applicable requirements.",
    is_applicable: true,
    implementation_description:
      "Data is securely stored, accessed, transmitted, and disposed per classification.",
    auditor_feedback: "Secure data handling procedures are in place.",
  },
  {
    sub_id: 7.1,
    order_no: 7,
    title: "Data labeling and annotation",
    description:
      "Managing data labeling and annotation processes for AI systems.",
    guidance:
      "Data labeling and annotation processes should be defined, documented, and quality-controlled to ensure labels are accurate, consistent, and appropriate for the intended AI system purpose. Labeler qualifications and inter-annotator agreement should be monitored.",
    is_applicable: true,
    implementation_description:
      "Data labeling processes include defined guidelines, qualified annotators, and quality checks for consistency.",
    auditor_feedback:
      "Labeling processes are documented. Recommend measuring inter-annotator agreement formally.",
  },
  {
    sub_id: 8.1,
    order_no: 8,
    title: "Data bias assessment",
    description:
      "Assessing and mitigating bias in data used for AI systems.",
    guidance:
      "Data used for AI systems should be assessed for potential biases that could lead to unfair, discriminatory, or harmful outcomes. Identified biases should be documented and mitigated through appropriate techniques.",
    is_applicable: true,
    implementation_description:
      "Bias assessments are conducted on training and evaluation datasets. Identified biases are documented with mitigation strategies.",
    auditor_feedback:
      "Bias assessment processes exist. Ensure assessments are repeated when data sources change.",
  },
  {
    sub_id: 9.1,
    order_no: 9,
    title: "Data retention",
    description:
      "Defining and implementing data retention policies for AI-related data.",
    guidance:
      "Retention periods for data used in AI systems — including training data, validation data, model outputs, and logs — should be defined based on legal, regulatory, and operational requirements, and enforced through documented procedures.",
    is_applicable: true,
    implementation_description:
      "Data retention policies define periods for training data, model artifacts, and operational logs in compliance with regulatory requirements.",
    auditor_feedback:
      "Retention policies are documented. Verify automated enforcement of retention periods.",
  },
  {
    sub_id: 10.1,
    order_no: 10,
    title: "Data deletion and disposal",
    description:
      "Secure deletion and disposal of AI-related data.",
    guidance:
      "Data used in AI systems should be securely deleted or disposed of when no longer needed or when retention periods expire, ensuring that deletion is complete and verifiable, particularly for personal or sensitive data.",
    is_applicable: true,
    implementation_description:
      "Secure deletion procedures ensure complete removal of expired AI data with verification records.",
    auditor_feedback:
      "Deletion procedures exist. Recommend periodic verification that deletion is complete across all storage locations including backups.",
  },
  {
    sub_id: 11.1,
    order_no: 11,
    title: "Data transfer",
    description:
      "Managing the transfer of data used in AI systems.",
    guidance:
      "Transfer of data used in AI systems — whether internal or to third parties — should be governed by documented procedures addressing authorization, encryption, contractual safeguards, and compliance with data protection regulations including cross-border transfer restrictions.",
    is_applicable: true,
    implementation_description:
      "Data transfer procedures govern authorization, encryption, and contractual requirements for internal and external transfers.",
    auditor_feedback:
      "Transfer controls are in place. Ensure cross-border transfer assessments are documented for all AI data sharing arrangements.",
  },
];
