import { replaceTemplateVariables } from "../automation.utils";

describe("replaceTemplateVariables", () => {
  it("fills every occurrence of each variable", () => {
    expect(replaceTemplateVariables("{{a}} and {{a}}", { a: "x" })).toBe("x and x");
  });

  it("inserts $ patterns in values literally", () => {
    expect(replaceTemplateVariables("[{{name}}]", { name: "Cash$'App $& $$" })).toBe(
      "[Cash$'App $& $$]",
    );
  });

  it("renders null and undefined as empty", () => {
    expect(replaceTemplateVariables("[{{a}}{{b}}]", { a: null, b: undefined })).toBe("[]");
  });
});
