export type User = {
  id: number; //automatically created by database
  name: string; //will be filled by user
  surname: string; //will be filled by user
  email: string; //will be filled by user
  password_hash?: string; //created by the database
  role_id?: number; //will be filled by user (backend field name)
  roleId?: number; //will be filled by user (frontend compatibility)
  created_at?: Date; //automatically filled by database
  last_login?: Date; //automatically filled by database
  is_demo?: boolean; //flag for demo users
  organization_id?: number; //organization association
  pwd_set?: boolean; //password set flag (compatibility)
  data?: any; //compatibility property for API responses
};

export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}
