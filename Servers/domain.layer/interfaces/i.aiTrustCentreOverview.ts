export interface IAITrustCentreOverview {
  info: {
    id?: number;
    title: string;
    logo?: number;
    header_color: string;
    visible: boolean;
    intro_visible: boolean;
    compliance_badges_visible: boolean;
    company_description_visible: boolean;
    terms_and_contact_visible: boolean;
    resources_visible: boolean;
    subprocessor_visible: boolean;
  };
  intro: {
    id?: number;
    purpose_visible: boolean;
    purpose_text: string;
    our_statement_visible: boolean;
    our_statement_text: string;
    our_mission_visible: boolean;
    our_mission_text: string;
  };
  compliance_badges: {
    id?: number;
    soc2_type_i: boolean;
    soc2_type_ii: boolean;
    iso_27001: boolean;
    iso_42001: boolean;
    ccpa: boolean;
    gdpr: boolean;
    hipaa: boolean;
    eu_ai_act: boolean;
  };
  company_description: {
    id?: number;
    background_visible: boolean;
    background_text: string;
    core_benefits_visible: boolean;
    core_benefits_text: string;
    compliance_doc_visible: boolean;
    compliance_doc_text: string;
  };
  terms_and_contact: {
    id?: number;
    terms_visible: boolean;
    terms_text: string;
    privacy_visible: boolean;
    privacy_text: string;
    email_visible: boolean;
    email_text: string;
  };
}
