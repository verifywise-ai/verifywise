export class ISO27001AnnexStructModel {
  id?: number;
  arrangement!: number;
  title!: string;
  order_no!: number;
  framework_id!: number;

  constructor(data: ISO27001AnnexStructModel) {
    this.id = data.id;
    this.arrangement = data.arrangement;
    this.title = data.title;
    this.order_no = data.order_no;
    this.framework_id = data.framework_id;
  }

  static createNewISO27001AnnexStruct(data: ISO27001AnnexStructModel): ISO27001AnnexStructModel {
    return new ISO27001AnnexStructModel(data);
  }
}
