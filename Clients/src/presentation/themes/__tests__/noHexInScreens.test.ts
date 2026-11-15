/**
 * Screens use tokens, not hex. Scans every .ts and .tsx file under
 * `presentation/pages`, `presentation/components` and `presentation/utils` (not `__tests__`, test or
 * `.d.ts` files) for `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa` in code:
 * string literals, template text and JSX text. Comments are ignored.
 *
 * Out of scope: `rgb()`, `rgba()` and `hsl()` values. They are not caught
 * here and are reviewed by hand.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { HEX_ALLOW_LIST } from "../hexAllowList";

const PRESENTATION = path.resolve(__dirname, "../..");
const ROOTS = ["pages", "components", "utils"];
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") collect(full, out);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

const allowEntry = (rel: string) =>
  HEX_ALLOW_LIST.find((e) => (e.file.endsWith("/") ? rel.startsWith(e.file) : rel === e.file));

/** Hex in code (string, template and JSX text), never in comments. */
function hexHits(file: string, literal?: string): string[] {
  const source = readFileSync(file, "utf8");
  if (!HEX.test(source)) return [];
  HEX.lastIndex = 0;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    let text: string | undefined;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      text = node.text;
    } else if (ts.isJsxText(node)) {
      text = node.getText(sf);
    }
    if (text && literal) text = text.split(literal).join("");
    if (text) {
      for (const match of text.matchAll(HEX)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push(`${match[0]} (line ${line + 1})`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("no hard-coded hex in screens", () => {
  it("uses tokens in pages and components, except the allow-list", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of collect(path.join(PRESENTATION, root))) {
        const rel = path.relative(PRESENTATION, file).split(path.sep).join("/");
        const entry = allowEntry(rel);
        if (entry && !entry.literal) continue;
        const hits = hexHits(file, entry?.literal);
        if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("allow-list entries point at files that exist and say why", () => {
    for (const entry of HEX_ALLOW_LIST) {
      expect(entry.reason.length).toBeGreaterThan(10);
      const target = path.join(PRESENTATION, entry.file);
      expect(() =>
        readdirSync(entry.file.endsWith("/") ? target : path.dirname(target)),
      ).not.toThrow();
      if (!entry.file.endsWith("/")) expect(() => readFileSync(target)).not.toThrow();
    }
  });
});
