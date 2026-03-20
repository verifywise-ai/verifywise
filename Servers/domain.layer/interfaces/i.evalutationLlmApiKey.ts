export interface IEvaluationLlmApiKey {
  id?: number;
  provider: string;
  api_key_encrypted?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface IMaskedKey {
  provider: string;
  maskedKey: string;
  createdAt?: Date;
  updatedAt?: Date;
}
