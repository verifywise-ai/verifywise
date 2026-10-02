export interface IRoleAttributes {
  id?: number;
  name: string;
  description: string;
  created_at?: Date;
  /** NULL = global built-in role; set = custom organization role (issue #4588). */
  organization_id?: number | null;
}
