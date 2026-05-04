export interface IShareLink {
  id?: number;
  share_token: string;
  resource_type: string; // 'model', 'policy', 'risk', etc.
  resource_id: number;
  created_by: number;
  settings?: {
    shareAllFields: boolean;
    allowDataExport: boolean;
    allowViewersToOpenRecords: boolean;
    displayToolbar: boolean;
  };
  is_enabled: boolean;
  expires_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface IShareLinkCreate {
  resource_type: string;
  resource_id: number;
  settings?: IShareLink["settings"];
  expires_at?: Date;
}

export interface IShareLinkUpdate {
  settings?: IShareLink["settings"];
  is_enabled?: boolean;
  expires_at?: Date;
}
