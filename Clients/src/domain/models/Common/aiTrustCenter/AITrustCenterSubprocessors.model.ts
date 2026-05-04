export class AITrustCenterSubprocessorsModel {
  id?: number;
  name!: string;
  purpose!: string;
  location!: string;
  url!: string;

  constructor(data: AITrustCenterSubprocessorsModel) {
    this.id = data.id;
    this.name = data.name;
    this.purpose = data.purpose;
    this.location = data.location;
    this.url = data.url;
  }

  static createNewAITrustCenterSubprocessors(
    data: AITrustCenterSubprocessorsModel,
  ): AITrustCenterSubprocessorsModel {
    return new AITrustCenterSubprocessorsModel(data);
  }
}
