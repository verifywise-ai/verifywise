import { Theme } from "@mui/material";
import { SxProps } from "@mui/material";

export enum FrameworkTypeEnum {
  ProjectBased = "project-based",
  OrganizationWide = "organization-wide",
}

export interface User {
  _id: string;
  name: string;
  surname: string;
  email: string;
}

export interface FormValues {
  project_title: string;
  owner: number;
  members: User[];
  start_date: string;
  ai_risk_classification: number | null;
  status: number;
  type_of_high_risk_role: number | null;
  goal: string;
  enable_ai_data_insertion: boolean;
  monitored_regulations_and_standards: { _id: number; name: string }[];
  framework_type: FrameworkTypeEnum | null;
  geography: number;
  target_industry: string;
  description: string;
  approval_workflow_id: number;

  // Regulation-agnostic use-case classification (stored as item _id, mapped to string on submit)
  use_case_category: number | null;
  use_case_purpose: number | null;
  use_case_audience: number | null;
  deployment_context: number | null;
}

export interface FormErrors {
  projectTitle?: string;
  members?: string;
  frameworks?: string;
  owner?: string;
  startDate?: string;
  riskClassification?: string;
  status?: string;
  typeOfHighRiskRole?: string;
  goal?: string;
  frameworkType?: string;
  geography?: string;
  targetIndustry?: string;
  description?: string;
  approvalWorkflow?: string;
  useCaseCategory?: string;
  useCasePurpose?: string;
  useCaseAudience?: string;
  deploymentContext?: string;
}

export const initialState: FormValues = {
  project_title: "",
  members: [],
  owner: 0,
  start_date: new Date().toISOString(),
  ai_risk_classification: null,
  status: 1,
  type_of_high_risk_role: null,
  goal: "",
  enable_ai_data_insertion: false,
  monitored_regulations_and_standards: [],
  framework_type: null,
  geography: 1,
  target_industry: "",
  description: "",
  approval_workflow_id: 0,
  use_case_category: null,
  use_case_purpose: null,
  use_case_audience: null,
  deployment_context: null,
};

export interface ProjectFormProps {
  onClose: () => void;
  sx?: SxProps<Theme> | undefined;
  defaultFrameworkType?: FrameworkTypeEnum;
  projectToEdit?: any; // Add optional prop for editing
  useStandardModal?: boolean; // When true, renders without internal header/footer for use inside StandardModal
  onSubmitRef?: React.MutableRefObject<(() => void) | undefined>; // Ref to expose handleSubmit when useStandardModal is true
}

export interface FrameworkOption {
  value: FrameworkTypeEnum;
  title: string;
  description: string;
}

export const frameworkOptions: FrameworkOption[] = [
  {
    value: FrameworkTypeEnum.ProjectBased,
    title: "Project-based frameworks",
    description: "Use-case level regulations (optional)",
  },
  {
    value: FrameworkTypeEnum.OrganizationWide,
    title: "Organization-wide framework",
    description: "ISO 42001, ISO 27001, and NIST AI RMF (company-wide project)",
  },
];
