export class AITrustCenterResourcesModel {
  id?: number;
  name!: string;
  description!: string;
  file_id!: number;
  visible!: boolean;

  constructor(data: AITrustCenterResourcesModel) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.file_id = data.file_id;
    this.visible = data.visible;
  }

  static createNewAITrustCenterResources(
    data: AITrustCenterResourcesModel,
  ): AITrustCenterResourcesModel {
    return new AITrustCenterResourcesModel(data);
  }
}
