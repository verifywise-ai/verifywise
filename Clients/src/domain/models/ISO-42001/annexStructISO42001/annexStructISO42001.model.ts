export class AnnexStructISO42001Model {
  id!: number;
  title!: string;
  annex_no?: number;
  framework_id?: number;

  constructor(data: AnnexStructISO42001Model) {
    this.id = data.id;
    this.title = data.title;
    this.annex_no = data.annex_no;
    this.framework_id = data.framework_id;
  }

  static createNewAnnexStructISO42001(data: AnnexStructISO42001Model): AnnexStructISO42001Model {
    return new AnnexStructISO42001Model(data);
  }
}
