export class ApiTokenModel {
  id!: number;
  name!: string;
  token?: string;
  expires_at!: string;
  created_at!: string;
  created_by!: number;
  is_demo?: boolean;

  constructor(data: ApiTokenModel) {
    this.id = data.id;
    this.name = data.name;
    this.token = data.token;
    this.expires_at = data.expires_at;
    this.created_at = data.created_at;
    this.created_by = data.created_by;
    this.is_demo = data.is_demo;
  }

  static createNewApiToken(data: ApiTokenModel): ApiTokenModel {
    return new ApiTokenModel(data);
  }

  static createApiTokenForCreation(name: string): Partial<ApiTokenModel> {
    return {
      name,
      created_at: new Date().toISOString(),
    };
  }

  isExpired(): boolean {
    return new Date() > new Date(this.expires_at);
  }

  getFormattedCreatedDate(): string {
    return new Date(this.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  getFormattedExpiryDate(): string {
    return new Date(this.expires_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  getStatus(): "Active" | "Expired" {
    return this.isExpired() ? "Expired" : "Active";
  }

  getStatusColor(): string {
    return this.isExpired() ? "#ffebee" : "#c8e6c9";
  }

  getStatusTextColor(): string {
    return this.isExpired() ? "#d32f2f" : "#388e3c";
  }
}
