export interface Resource {
  id: number;
  name: string;
  description: string;
  visible: boolean;
  file_id?: number;
  filename?: string;
}

export interface Subprocessor {
  id: number;
  name: string;
  purpose: string;
  location: string;
  url: string;
}

export interface FormData {
  intro?: Record<string, unknown>;
  compliance_badges?: Record<string, unknown>;
  company_description?: Record<string, unknown>;
  terms_and_contact?: Record<string, unknown>;
  info?: {
    resources_visible?: boolean;
  };
}

export interface NewResourceFormValues {
  name: string;
  description: string;
  file: File | null;
}

export interface EditResourceFormValues {
  name: string;
  description: string;
}
