import { policyEditorStyles } from "../editorStyles";

describe("policyEditorStyles", () => {
  it("defines ProseMirror surface styles for the policy editor", () => {
    const styles = policyEditorStyles as Record<string, any>;
    expect(styles).toHaveProperty(".policy-tiptap-editor .ProseMirror");
  });

  it("configures table, code, and search-highlight styling", () => {
    const styles = policyEditorStyles as Record<string, any>;
    const proseMirror = styles[".policy-tiptap-editor .ProseMirror"];
    expect(proseMirror).toHaveProperty("& table");
    expect(proseMirror).toHaveProperty("& pre");
    expect(proseMirror).toHaveProperty("& .search-highlight");
    expect(proseMirror.minHeight).toBe(300);
  });
});
