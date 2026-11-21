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

/** What the vendor risk form hands over to be saved: the details of one risk, as the register spells them. */
export interface VendorRiskFormDetails {
  vendor_id: string | number;
  risk_description: string;
  impact_description: string;
  /** The id of a user of the organization, as the owner list writes it. */
  action_owner?: string;
  action_plan: string;
  risk_severity: string;
  /** The level the form works out from the likelihood and the severity, for example "High risk". */
  risk_level: string;
  /** The register's spelling: its top level is "Almost certain", with a small c. */
  likelihood: string;
  frameworks: number[];
}

/**
 * A risk that was drafted somewhere else (a finding of the research agent) and is opened in the
 * vendor risk form to be looked over. The form starts from `values`, with the vendor fixed, and
 * saving hands what is on screen to `onSave` instead of creating a risk itself.
 */
export interface VendorRiskPreview {
  /**
   * Identifies the draft. The form starts again from `values` when it changes, and only then, so
   * that an edit in progress survives the page rendering again.
   */
  key: number | string;
  title: string;
  description: string;
  values: {
    vendor_id: number;
    risk_description: string;
    impact_description: string;
    action_plan: string;
    /** The register's spelling, for example "Almost certain". */
    likelihood: string;
    risk_severity: string;
    /** The user the owner list starts on; null leaves it empty for the person to choose. */
    action_owner: number | null;
  };
  /**
   * Saves what is on screen and resolves with the id of the new risk, when there is one. A
   * rejection leaves the form open with the values as they are; the caller reports the failure.
   */
  onSave: (details: VendorRiskFormDetails) => Promise<number | undefined>;
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
  country?: string;
  registrationNumber?: string;
  lei?: string;
  secCik?: string;
}
