import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { translations } from "../translations";

// The title and the description at the head of a page are plain English in the source, and the DOM
// translator looks each string up whole, so a string that is missing from a language is shown in
// English there. `npm run i18n:audit:strict` cannot be relied on for them: it reads a string up to
// the first apostrophe, so "Manage your organization's keys" is checked as "Manage your
// organization" (a key that no page ever shows), and it does not see a string that is not written
// in the attribute itself (a constant, one branch of a condition). This reads the pages as code.

const SRC = join(__dirname, "..", "..");
const HEADER_TAGS = new Set(["PageHeaderExtended", "PageHeader", "PageTitle", "GovernanceLayout"]);
const HEADER_PROPS = new Set(["title", "description", "subtitle"]);
const COMPARISONS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

const sourceFiles = (dir: string, found: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "__tests__", "i18n", "StyleGuide"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (name.endsWith(".tsx") && !/\.test\./.test(name)) found.push(path);
  }
  return found;
};

/** The text of the strings a header attribute is made of, wherever in the expression they stand. */
const stringsOf = (node: ts.Node, source: ts.SourceFile): string[] => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  // A name stands for the string it is declared as in the same file, if it is declared as one.
  if (ts.isIdentifier(node)) {
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === node.text &&
          declaration.initializer
        ) {
          return stringsOf(declaration.initializer, source);
        }
      }
    }
    return [];
  }
  // What is built at run time (a template with a hole, a name read from data) is not a key, an
  // element is a title made of more than text, and what a condition compares with is not shown.
  if (ts.isTemplateExpression(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    return [];
  }
  if (ts.isBinaryExpression(node) && COMPARISONS.has(node.operatorToken.kind)) return [];
  const found: string[] = [];
  // A block, not an arrow that returns the push: `forEachChild` stops at the first child the
  // callback answers with something truthy, and a push answers with the new length.
  node.forEachChild((child) => {
    found.push(...stringsOf(child, source));
  });
  return found;
};

const headerStrings = (): Array<{ file: string; text: string }> => {
  const found: Array<{ file: string; text: string }> = [];
  for (const path of sourceFiles(SRC)) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        HEADER_TAGS.has(node.tagName.getText(source))
      ) {
        for (const attribute of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attribute) &&
            HEADER_PROPS.has(attribute.name.getText(source)) &&
            attribute.initializer
          ) {
            // An empty string is what a fallback is made of, not text.
            for (const text of stringsOf(attribute.initializer, source)) {
              if (text.trim() !== "") found.push({ file: relative(SRC, path), text });
            }
          }
        }
      }
      node.forEachChild(visit);
    };
    visit(source);
  }
  return found;
};

describe("the title and the description at the head of a page", () => {
  const strings = headerStrings();

  // A guard against a reader that finds nothing, which would pass for every language.
  it("are found in the pages", () => {
    const texts = strings.map((entry) => entry.text);
    expect(strings.length).toBeGreaterThan(80);
    expect(texts).toContain("Model Inventory");
    // One written in a constant, one in a branch of a condition, and one with an apostrophe.
    expect(texts).toContain(
      "Showing all tasks in your organization. You can create and manage tasks here.",
    );
    expect(texts).toContain(
      "Manage your organization's LLM provider API keys and project configuration.",
    );
  });

  it.each(["de", "fr", "es"] as const)("are translated into %s", (lang) => {
    const missing = strings
      .filter((entry) => !translations[lang]?.[entry.text])
      .map((entry) => `${entry.file}: ${entry.text}`);
    expect([...new Set(missing)].sort()).toEqual([]);
  });
});
