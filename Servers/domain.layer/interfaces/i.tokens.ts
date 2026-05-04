export interface IToken {
  id?: number;
  token: string;
  name: string;
  created_at?: Date;
  expires_at: Date;
  created_by: number;
}
