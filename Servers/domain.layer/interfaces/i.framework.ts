export interface IFramework {
  id?: number;
  name: string;
  description: string;
  is_organizational: boolean;
  created_at: Date;
  /** NULL = bundled/system catalog row; set = org-scoped imported row (#5254). */
  organization_id?: number | null;
  /** 'bundled' (default) | 'imported'. */
  source?: string;
}
