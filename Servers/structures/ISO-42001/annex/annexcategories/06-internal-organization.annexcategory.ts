import { AnnexCategoryISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryStructISO } from "../../../../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";

export const InternalOrganization: Partial<AnnexCategoryStructISO & AnnexCategoryISO>[] = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: "AI roles and responsibilities",
    description: "Defining and allocating AI responsibilities.",
    guidance:
      "All responsibilities related to the development, deployment, operation, and governance of AI systems should be clearly defined and allocated.",
    is_applicable: true,
    implementation_description:
      "Internal roles for AI development, deployment, and governance are clearly defined.",
    auditor_feedback: "Clear role delineation enhances accountability.",
  },
  {
    sub_id: 1.2,
    order_no: 2,
    title: "Segregation of duties",
    description: "Separating conflicting duties related to AI.",
    guidance:
      "Conflicting duties and areas of responsibility should be segregated to reduce opportunities for unauthorized or unintentional modification or misuse of AI systems or related assets.",
    is_applicable: true,
    implementation_description:
      "Segregation implemented to reduce risks of unauthorized AI system modifications.",
    auditor_feedback: "Controls for segregation are effective.",
  },
  {
    sub_id: 2.1,
    order_no: 3,
    title: "Accountability for AI systems",
    description: "Assigning accountability for AI systems.",
    guidance:
      "Accountability should be assigned for the establishment, implementation, maintenance, monitoring, evaluation and improvement of the AIMS and for AI systems throughout their lifecycle.",
    is_applicable: true,
    implementation_description:
      "Accountability assigned to AI project managers and system owners across lifecycle.",
    auditor_feedback: "Good accountability tracking observed.",
  },
  {
    sub_id: 3.1,
    order_no: 4,
    title: "Contact with authorities",
    description: "Maintaining contact with relevant authorities.",
    guidance: "Appropriate contacts with relevant authorities should be maintained.",
    is_applicable: true,
    implementation_description:
      "Regular communications maintained with regulatory bodies regarding AI compliance.",
    auditor_feedback: "Effective liaison with authorities.",
  },
  {
    sub_id: 3.2,
    order_no: 5,
    title: "Contact with special interest groups",
    description: "Maintaining contact with special interest groups.",
    guidance:
      "Appropriate contacts with special interest groups and other specialist forums and professional associations should be maintained.",
    is_applicable: true,
    implementation_description: "",
    auditor_feedback: "Engage with relevant specialist forums to stay current with AI practices.",
  },
  {
    sub_id: 4.1,
    order_no: 6,
    title: "AI in project management",
    description: "Integrating AI aspects into project management.",
    guidance: "AI should be integrated into the organization's project management.",
    is_applicable: true,
    implementation_description:
      "AI considerations integrated into project planning and risk management frameworks.",
    auditor_feedback: "AI aspects are well embedded in projects.",
  },
];
