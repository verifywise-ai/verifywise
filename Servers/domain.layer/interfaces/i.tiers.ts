export interface TierFeatures {
  seats: number;
  projects: number;
  frameworks: number;
}

export interface ITiers {
  id?: number;
  name: string;
  price: number;
  features: TierFeatures;
  created_at?: Date;
  updated_at?: Date;
}
