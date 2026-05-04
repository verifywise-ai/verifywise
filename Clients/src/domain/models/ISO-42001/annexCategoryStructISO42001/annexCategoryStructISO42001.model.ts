export class AnnexCategoryStructISO42001Model {
  id!: number;
  title!: string;
  description!: string;
  guidance!: string;
  sub_id!: number;
  order_no?: number;
  annex_id?: number;

  constructor(data: AnnexCategoryStructISO42001Model) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.guidance = data.guidance;
    this.sub_id = data.sub_id;
    this.order_no = data.order_no;
    this.annex_id = data.annex_id;
  }

  static createNewAnnexCategoryStructISO42001(
    data: AnnexCategoryStructISO42001Model,
  ): AnnexCategoryStructISO42001Model {
    return new AnnexCategoryStructISO42001Model(data);
  }
}
