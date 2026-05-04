export class OrganizationModel {
  id?: number;
  name!: string;
  logo!: string;
  created_at?: Date;

  constructor(data: OrganizationModel) {
    this.id = data.id;
    this.name = data.name;
    this.logo = data.logo;
    this.created_at = data.created_at;
  }

  static createNewOrganization(data: OrganizationModel): OrganizationModel {
    return new OrganizationModel(data);
  }

  static fromApiData(apiData: any): OrganizationModel {
    return new OrganizationModel({
      id: apiData.id,
      name: apiData.name,
      logo: apiData.logo,
      created_at:
        typeof apiData.created_at === "string" ? new Date(apiData.created_at) : apiData.created_at,
    } as OrganizationModel);
  }

  // Business methods to replace existing Organization page logic
  validateName(): { accepted: boolean; message?: string } {
    if (!this.name || this.name.trim() === "") {
      return { accepted: false, message: "Organization name is required" };
    }
    if (this.name.trim().length < 2) {
      return { accepted: false, message: "Organization name must be at least 2 characters" };
    }
    if (this.name.trim().length > 50) {
      return { accepted: false, message: "Organization name must be less than 50 characters" };
    }
    return { accepted: true };
  }

  static validateLogoFile(file: File): { isValid: boolean; errorMessage?: string } {
    if (!file.type.startsWith("image/")) {
      return { isValid: false, errorMessage: "Please select a valid image file" };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { isValid: false, errorMessage: "File size must be less than 5MB" };
    }
    return { isValid: true };
  }
}
