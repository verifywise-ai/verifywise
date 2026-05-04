import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

/**
 * VW A.12 / ISO 42001 A.9 — Interested parties.
 * Aligns with ISO 42001 Annex A.9: notification, communication, and addressing
 * of concerns from interested parties affected by the organization's AI
 * systems.
 */
export const InterestedParties: Partial<AnnexCategoryStructISO & AnnexCategoryISO>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "Notification to interested parties",
    description:
      "Notifying affected individuals and relevant parties about AI system use and its potential impacts.",
    guidance:
      "The organization should establish processes for notifying interested parties about AI system deployment, its purpose, and potential impacts on them, in accordance with applicable legal, regulatory, and contractual requirements.",
    is_applicable: true,
    implementation_description:
      "Notification processes are in place to inform affected parties about AI system deployment and impacts.",
    auditor_feedback:
      "Notification mechanisms exist. Verify coverage across all deployed AI systems.",
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: "Communication with interested parties",
    description:
      "Establishing effective communication channels with interested parties regarding AI systems.",
    guidance:
      "The organization should establish and maintain communication channels that allow interested parties to raise questions, provide feedback, and receive information about the organization's AI systems and their governance.",
    is_applicable: true,
    implementation_description:
      "Communication channels (helpdesk, public disclosure, feedback forms) enable interested party engagement on AI topics.",
    auditor_feedback:
      "Communication channels are defined. Ensure responsiveness is measured and reported.",
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: "Addressing interested parties' concerns",
    description:
      "Processes for receiving, evaluating, and responding to concerns raised by interested parties about AI systems.",
    guidance:
      "The organization should establish processes for receiving, recording, evaluating, and responding to concerns raised by interested parties regarding the development, deployment, or operation of AI systems, including mechanisms for escalation and resolution.",
    is_applicable: true,
    implementation_description:
      "A formal process for receiving, tracking, and resolving concerns about AI systems from interested parties is operational.",
    auditor_feedback:
      "Concern resolution process exists. Recommend tracking resolution times and satisfaction outcomes.",
  },
];
