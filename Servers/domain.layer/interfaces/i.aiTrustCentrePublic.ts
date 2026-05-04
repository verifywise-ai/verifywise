interface IAITrustCentreResources {
  id: number;
  name: string;
  description: string;
  file_id: number;
  visible: boolean;
}

interface IAITrustCentreSubprocessors {
  id: number;
  name: string;
  purpose: string;
  location: string;
  url: string;
}

export interface IAITrustCentrePublic {
  info: {
    title: string;
    header_color: string;
    logo: number;
  };
  intro: {
    purpose: string;
    statement: string;
    mission: string;
  };
  compliance_badges: {
    SOC2_Type_I: boolean;
    SOC2_Type_II: boolean;
    ISO_27001: boolean;
    ISO_42001: boolean;
    CCPA: boolean;
    GDPR: boolean;
    HIPAA: boolean;
    EU_AI_Act: boolean;
  };
  company_description: {
    background: string;
    core_benefits: string;
    compliance_doc: string;
  };
  terms_and_contact: {
    terms: string;
    privacy: string;
    email: string;
  };
  resources: IAITrustCentreResources[];
  subprocessors: IAITrustCentreSubprocessors[];
}
