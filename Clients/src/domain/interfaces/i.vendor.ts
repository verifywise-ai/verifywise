import { VendorModel } from "../models/Common/vendor/vendor.model";

export interface ExistingRisk {
  id?: number;
  risk_description: string;
  impact_description: string;
  project_name?: string;
  impact: string;
  action_owner: string;
  risk_severity: string;
  likelihood: string;
  risk_level: string;
  action_plan: string;
  vendor_id: string;
  frameworks?: number[];
}
export interface IVendorRisk {
  id: number;
  risk_description: string;
  impact_description: string;
  risk_severity: string;
  likelihood: string;
  risk_level: string;
  action_owner: number;
  action_plan: string;
  vendor_id: number;
}

export interface IVendorRisksDialogProps {
  open: boolean;
  onClose: () => void;
  vendorId: number;
  vendorName?: string;
}

export interface AddNewVendorProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  value?: string;
  onSuccess: () => void;
  existingVendor?: VendorModel | null;
  onChange?: () => void;
}

export interface VendorFormErrors {
  vendorName?: string;
  vendorProvides?: string;
  website?: string;
  projectIds?: string;
  vendorContactPerson?: string;
  reviewStatus?: string;
  assignee?: string;
  reviewer?: string;
  reviewResult?: string;
  dataSensitivity?: string;
  businessCriticality?: string;
  pastIssues?: string;
  regulatoryExposure?: string;
}
