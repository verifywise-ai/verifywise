export class ControlCategoryModel {
  id?: number;
  project_id!: number;
  title!: string;
  order_no?: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data: ControlCategoryModel) {
    this.id = data.id;
    this.project_id = data.project_id;
    this.title = data.title;
    this.order_no = data.order_no;
    this.is_demo = data.is_demo;
    this.created_at = data.created_at;
  }

  static createNewControlCategory(data: ControlCategoryModel): ControlCategoryModel {
    return new ControlCategoryModel(data);
  }
}
