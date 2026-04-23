import { OrganizationalPoliciesAndGovernance } from "./annexcategories/05-organizational-policies-and-governance.annexcategory";
import { InternalOrganization } from "./annexcategories/06-internal-organization.annexcategory";
import { ResourcesForAISystems } from "./annexcategories/07-resource-for-AI-systems.annexcategory";
import { AISystemLifecycle } from "./annexcategories/08-AI-system-lifecycle.annexcategory";
import { DataForAISystems } from "./annexcategories/09-data-for-AI-systems.annexcategory";
import { ICT } from "./annexcategories/10-ict.annexcategory";
import { ThirdPartyRelationships } from "./annexcategories/11-third-party-relationships.annexcategory";
import { InterestedParties } from "./annexcategories/12-interested-parties.annexcategory";
import { UseOfAISystems } from "./annexcategories/13-use-of-AI-systems.annexcategory";
import { AnnexStructISO } from "../../../domain.layer/frameworks/ISO-42001/annexStructISO.model";

export const Annex: AnnexStructISO[] = [
  {
    title: "A.5 Organizational policies and governance",
    annex_no: 5,
    annexcategories: OrganizationalPoliciesAndGovernance,
  },
  {
    title: "A.6 Internal organization",
    annex_no: 6,
    annexcategories: InternalOrganization,
  },
  {
    title: "A.7 Resources for AI systems",
    annex_no: 7,
    annexcategories: ResourcesForAISystems,
  },
  {
    title: "A.8 AI system lifecycle",
    annex_no: 8,
    annexcategories: AISystemLifecycle,
  },
  {
    title: "A.9 Data for AI systems",
    annex_no: 9,
    annexcategories: DataForAISystems,
  },
  {
    title: "A.10 Information and communication technology (ICT)",
    annex_no: 10,
    annexcategories: ICT,
  },
  {
    title: "A.11 Third party relationships",
    annex_no: 11,
    annexcategories: ThirdPartyRelationships,
  },
  {
    title: "A.12 Interested parties",
    annex_no: 12,
    annexcategories: InterestedParties,
  },
  {
    title: "A.13 Use of AI systems",
    annex_no: 13,
    annexcategories: UseOfAISystems,
  },
];
