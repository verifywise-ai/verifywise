/**
 * AI Trust Center Repository Interface
 *
 * Defines the contract for AI Trust Center data access operations.
 */

/**
 * AI Trust Center Overview
 */
export interface AITrustCenterOverview {
  id?: number;
  company_name?: string;
  description?: string;
  logo?: string;
  contact_email?: string;
  privacy_policy_url?: string;
  terms_of_service_url?: string;
}

/**
 * AI Trust Center Resource
 */
export interface AITrustCenterResource {
  id: number;
  name: string;
  description: string;
  file_id?: number;
  visible: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * AI Trust Center Subprocessor
 */
export interface AITrustCenterSubprocessor {
  id: number;
  name: string;
  purpose: string;
  location: string;
  url: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Logo data structure
 */
export interface LogoData {
  content: ArrayBuffer | number[];
  type?: string;
  mimeType?: string;
  contentType?: string;
  data?: number[];
}

/**
 * AI Trust Center Repository Interface
 */
export interface IAITrustCenterRepository {
  /**
   * Get the AI Trust Center overview
   */
  getOverview(): Promise<AITrustCenterOverview>;

  /**
   * Update the AI Trust Center overview
   */
  updateOverview(data: Partial<AITrustCenterOverview>): Promise<AITrustCenterOverview>;

  /**
   * Get the AI Trust Center logo for a tenant
   */
  getLogo(tenantId: string): Promise<{ data?: { logo?: LogoData } }>;

  /**
   * Upload a new logo
   */
  uploadLogo(logoFile: File): Promise<void>;

  /**
   * Delete the logo
   */
  deleteLogo(): Promise<void>;

  /**
   * Get all resources
   */
  getResources(): Promise<AITrustCenterResource[]>;

  /**
   * Create a new resource
   */
  createResource(
    file: File,
    name: string,
    description: string,
    visible?: boolean,
  ): Promise<AITrustCenterResource>;

  /**
   * Update a resource
   */
  updateResource(
    resourceId: number,
    name: string,
    description: string,
    visible: boolean,
    file?: File,
    oldFileId?: number,
  ): Promise<AITrustCenterResource>;

  /**
   * Delete a resource
   */
  deleteResource(resourceId: number): Promise<void>;

  /**
   * Get all subprocessors
   */
  getSubprocessors(): Promise<AITrustCenterSubprocessor[]>;

  /**
   * Create a new subprocessor
   */
  createSubprocessor(
    name: string,
    purpose: string,
    location: string,
    url: string,
  ): Promise<AITrustCenterSubprocessor>;

  /**
   * Update a subprocessor
   */
  updateSubprocessor(
    subprocessorId: number,
    name: string,
    purpose: string,
    location: string,
    url: string,
  ): Promise<AITrustCenterSubprocessor>;

  /**
   * Delete a subprocessor
   */
  deleteSubprocessor(subprocessorId: number): Promise<void>;
}
