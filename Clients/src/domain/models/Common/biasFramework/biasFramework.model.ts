export class FairnessModel {
  id: number | string; // Use number or string based on your backend response
  model: string;
  dataset: string;
  status: string;
  report?: string;
  action?: string;

  constructor(data?: Partial<FairnessModel>) {
    this.id = data?.id ?? "";
    this.model = data?.model ?? "";
    this.dataset = data?.dataset ?? "";
    this.status = data?.status ?? "Completed";
  }

  // ✅ Static factory (similar to IncidentManagementModel.createIncidentManagement)
  static createFairnessModel(data: FairnessModel): FairnessModel {
    return new FairnessModel(data);
  }
}
