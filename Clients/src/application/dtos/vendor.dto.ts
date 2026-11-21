/**
 * Data Transfer Objects (DTOs) for Vendor entity
 *
 * DTOs represent the data structure as it comes from the API.
 * They are separate from domain models to maintain a clear boundary
 * between infrastructure (API) and domain layers.
 */

/**
 * Vendor data as received from API
 * Uses snake_case to match API response format
 */
export interface VendorResponseDTO {
  id?: number;
  order_no?: number;
  vendor_name: string;
  vendor_provides: string;
  assignee: number;
  website: string;
  vendor_contact_person: string;
  review_result: string;
  review_status: string; // ReviewStatus enum as string
  reviewer: number;
  review_date: string; // ISO date string from API
  is_demo?: boolean;
  created_at?: string; // ISO date string from API
  projects?: number[];

  // Vendor scorecard fields
  data_sensitivity?: string; // DataSensitivity enum as string
  business_criticality?: string; // BusinessCriticality enum as string
  past_issues?: string; // PastIssues enum as string
  regulatory_exposure?: string; // RegulatoryExposure enum as string
  risk_score?: number;

  /** Other names the vendor is known by, separated by commas. */
  other_names?: string | null;

  /** The identifiers of the vendor (spec Q1), each as the server stores it, or null. */
  country?: string | null;
  registration_number?: string | null;
  lei?: string | null;
  sec_cik?: string | null;
}

/**
 * Data for creating a new vendor
 * Matches API request format
 */
export interface CreateVendorDTO {
  vendor_name: string;
  vendor_provides: string;
  assignee: number;
  website: string;
  vendor_contact_person: string;
  review_result: string;
  review_status: string; // ReviewStatus enum as string
  reviewer: number;
  review_date: string; // ISO date string
  projects?: number[];
  data_sensitivity?: string;
  business_criticality?: string;
  past_issues?: string;
  regulatory_exposure?: string;
  other_names?: string;
  country?: string | null;
  registration_number?: string | null;
  lei?: string | null;
  sec_cik?: string | null;
}

/**
 * Data for updating an existing vendor
 * All fields optional for partial updates
 */
export interface UpdateVendorDTO {
  vendor_name?: string;
  vendor_provides?: string;
  assignee?: number;
  website?: string;
  vendor_contact_person?: string;
  review_result?: string;
  review_status?: string;
  reviewer?: number;
  review_date?: string;
  projects?: number[];
  data_sensitivity?: string;
  business_criticality?: string;
  past_issues?: string;
  regulatory_exposure?: string;
  /** An empty text or null clears the other names. */
  other_names?: string | null;
  /** Null clears an identifier. */
  country?: string | null;
  registration_number?: string | null;
  lei?: string | null;
  sec_cik?: string | null;
}
