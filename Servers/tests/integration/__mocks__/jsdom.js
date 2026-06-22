class JSDOM {
  constructor(html) {
    this.window = { document: {}, navigator: {}, Node: {} };
    this.serialize = () => html || "";
  }
}
module.exports = { JSDOM };
