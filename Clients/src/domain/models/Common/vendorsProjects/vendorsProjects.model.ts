export class VendorsProjectsModel {
  vendor_id!: number;
  project_id!: number;
  is_demo?: boolean;

  constructor(data: VendorsProjectsModel) {
    this.vendor_id = data.vendor_id;
    this.project_id = data.project_id;
    this.is_demo = data.is_demo;
  }
  static createNewVendorProject(data: VendorsProjectsModel): VendorsProjectsModel {
    return new VendorsProjectsModel(data);
  }
}
