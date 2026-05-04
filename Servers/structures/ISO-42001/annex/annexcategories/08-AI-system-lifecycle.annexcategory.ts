import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

export const AISystemLifecycle: Partial<AnnexCategoryStructISO & AnnexCategoryISO>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "AI system lifecycle — overall approach",
    description:
      "Organizational overview of how the AI system lifecycle is governed end to end. Not a distinct ISO 42001 Annex A.5 control (the standard starts at A.5.2); retained as an umbrella item to record overall lifecycle posture.",
    guidance:
      "Describe, at a high level, how the organization structures the AI lifecycle end to end (requirements, design, data, build, V&V, deployment, operation, maintenance, retirement). The detailed ISO A.5.2–A.5.10 sub-controls are covered by the items that follow.",
    is_applicable: true,
    implementation_description:
      "Summarize the organization's approach to lifecycle management — ownership, stage gates, documentation standards — rather than re-describing each stage (those are in the items below).",
    auditor_feedback:
      "This item is an organizational overview; the detailed stage-by-stage posture is covered by the following sub-controls.",
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: "AI system requirements analysis",
    description: "Analyzing and specifying AI system requirements.",
    guidance:
      "Requirements for AI systems, including functional, non-functional, data, ethical, legal, and societal aspects, should be analyzed and specified.",
    is_applicable: true,
    implementation_description:
      "Requirements cover functional, ethical, and legal aspects per organizational standards.",
    auditor_feedback: "Requirement analysis is thorough.",
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: "AI system design",
    description: "Designing AI systems based on requirements.",
    guidance:
      "AI systems should be designed based on specified requirements, considering architecture, models, data handling, and interaction mechanisms.",
    is_applicable: true,
    implementation_description:
      "System design documents include architecture, data flow, and interaction mechanisms.",
    auditor_feedback: "Design documentation is comprehensive.",
  },
  {
    sub_id: 4.1,
    order_no: 4,
    title: "Data acquisition and preparation",
    description: "Acquiring and preparing data for AI systems.",
    guidance:
      "Data for AI systems should be acquired, pre-processed, and prepared according to requirements and quality criteria.",
    is_applicable: true,
    implementation_description:
      "Data acquisition processes ensure quality and ethical sourcing with proper pre-processing.",
    auditor_feedback: "Strong data acquisition and preparation controls.",
  },
  {
    sub_id: 5.1,
    order_no: 5,
    title: "Model building and evaluation",
    description: "Building, training, and evaluating AI models.",
    guidance:
      "AI models should be built, trained, tuned, and evaluated using appropriate techniques and metrics.",
    is_applicable: true,
    implementation_description:
      "Models undergo rigorous training, tuning, and evaluation against defined metrics.",
    auditor_feedback: "Model evaluation is robust and repeatable.",
  },
  {
    sub_id: 6.1,
    order_no: 6,
    title: "AI system verification and validation",
    description: "Verifying and validating AI systems.",
    guidance: "AI systems should be verified and validated against requirements before deployment.",
    is_applicable: true,
    implementation_description:
      "Verification and validation activities are formalized before deployment.",
    auditor_feedback: "Verification processes meet compliance requirements.",
  },
  {
    sub_id: 7.1,
    order_no: 7,
    title: "AI system deployment",
    description: "Deploying AI systems into the operational environment.",
    guidance:
      "AI systems should be deployed into the operational environment according to planned procedures.",
    is_applicable: true,
    implementation_description:
      "Deployment procedures ensure controlled rollout and rollback capabilities.",
    auditor_feedback: "Deployment is managed with minimal issues.",
  },
  {
    sub_id: 8.1,
    order_no: 8,
    title: "AI system operation and monitoring",
    description: "Operating and monitoring AI systems.",
    guidance:
      "Deployed AI systems should be operated and monitored for performance, behaviour, and compliance with requirements.",
    is_applicable: true,
    implementation_description:
      "Monitoring includes performance, anomaly detection, and compliance checks.",
    auditor_feedback: "Operational monitoring is effective.",
  },
  {
    sub_id: 9.1,
    order_no: 9,
    title: "AI system maintenance and retirement",
    description: "Maintaining and retiring AI systems.",
    guidance:
      "AI systems should be maintained throughout their operational life and retired securely when no longer needed.",
    is_applicable: true,
    implementation_description: "Maintenance schedules and secure retirement plans are in place.",
    auditor_feedback: "Maintenance and retirement controls are satisfactory.",
  },
];
