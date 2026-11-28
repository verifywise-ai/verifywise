/**
 * Guards the user guide against links that lead nowhere and icons that
 * silently fall back to `Info`: content cross-links, the config's article
 * counts, the page-to-guide route map and every guide path in app source.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { articleContentMap } from "@user-guide-content/content";
import {
  collections,
  fastFinds,
  getArticle,
  getCollection,
} from "@user-guide-content/userGuideConfig";
import type { ArticleContent, ContentBlock } from "@user-guide-content/contentTypes";
import { isContentIconName } from "../contentIcons";
import { DASHBOARD_GUIDE_TARGET, GUIDE_ROUTE_RULES } from "../guideRouteMap";

const INLINE_LINK = /\[\[([^\]]+)\]\]\(([^)]+)\)/g;

const headingIds = (content: ArticleContent): Set<string> =>
  new Set(
    content.blocks
      .filter((b): b is Extract<ContentBlock, { type: "heading" }> => b.type === "heading")
      .map((b) => b.id),
  );

/**
 * Checks a guide path as the sidebar reads it: "collection",
 * "collection/article" or "collection/article#heading-id".
 * Returns why it does not resolve, or null when it does.
 */
const resolveGuidePath = (guidePath: string): string | null => {
  const [pathPart, anchor, ...rest] = guidePath.split("#");
  if (rest.length) return "more than one #";
  const parts = pathPart.split("/");
  if (parts.length > 2 || !parts[0]) return "not collection or collection/article";
  const [collectionId, articleId] = parts;
  if (!getCollection(collectionId)) return `no collection "${collectionId}"`;
  if (articleId === undefined) return anchor === undefined ? null : "anchor needs an article";
  if (!getArticle(collectionId, articleId)) return `no article "${articleId}" in userGuideConfig`;
  const content = articleContentMap[`${collectionId}/${articleId}`];
  if (!content) return "article has no entry in articleContentMap";
  if (anchor !== undefined && !headingIds(content).has(anchor)) return `no heading id "${anchor}"`;
  return null;
};

const broken = (paths: { where: string; target: string }[]): string[] =>
  paths.flatMap(({ where, target }) => {
    const why = resolveGuidePath(target);
    return why ? [`${where} -> ${target}: ${why}`] : [];
  });

/** Every string anywhere inside a block, so new block types are covered too. */
const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
};

const articles = Object.entries(articleContentMap);

describe("user guide content integrity", () => {
  it("config and content map list the same articles", () => {
    const configKeys = collections.flatMap((c) => c.articles.map((a) => `${c.id}/${a.id}`));
    const contentKeys = Object.keys(articleContentMap);
    expect(
      configKeys.filter((k) => !contentKeys.includes(k)),
      "in config, no content",
    ).toEqual([]);
    expect(
      contentKeys.filter((k) => !configKeys.includes(k)),
      "content, not in config",
    ).toEqual([]);
  });

  it("every articleCount matches the collection's articles", () => {
    const mismatched = collections
      .filter((c) => c.articleCount !== c.articles.length)
      .map((c) => `${c.id}: articleCount ${c.articleCount}, articles ${c.articles.length}`);
    expect(mismatched).toEqual([]);
  });

  it("every article-links target exists", () => {
    const targets = articles.flatMap(([key, content]) =>
      content.blocks.flatMap((block) =>
        block.type === "article-links"
          ? block.items.map((item) => ({
              where: key,
              target: `${item.collectionId}/${item.articleId}`,
            }))
          : [],
      ),
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(broken(targets)).toEqual([]);
  });

  it("every inline [[text]](collection/article) link resolves", () => {
    const targets = articles.flatMap(([key, content]) =>
      stringsIn(content.blocks).flatMap((text) =>
        [...text.matchAll(INLINE_LINK)].map((m) => ({ where: key, target: m[2] })),
      ),
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(broken(targets)).toEqual([]);
  });

  it("every icon named in content has a real icon in the app", () => {
    const missing = new Set<string>();
    for (const [key, content] of articles) {
      for (const block of content.blocks) {
        const names =
          block.type === "icon-cards" ||
          block.type === "grid-cards" ||
          block.type === "requirements"
            ? block.items.map((item) => item.icon)
            : block.type === "info-box"
              ? [block.icon]
              : [];
        for (const name of names) {
          if (name !== undefined && !isContentIconName(name)) missing.add(`${key}: ${name}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("every fast find opens an article", () => {
    expect(
      broken(fastFinds.map((f) => ({ where: f.id, target: `${f.collectionId}/${f.articleId}` }))),
    ).toEqual([]);
  });

  it("every page-to-guide mapping resolves", () => {
    const targets = GUIDE_ROUTE_RULES.flatMap((r) => [
      r.target,
      ...Object.values(r.byHash ?? {}),
      DASHBOARD_GUIDE_TARGET,
    ]).map((target) => ({ where: "guideRouteMap", target }));
    expect(broken(targets)).toEqual([]);
  });
});

// Lower than today's count so removing a few help icons is fine, but an
// empty or broken scan fails.
const MIN_GUIDE_PATHS = 60;

describe("guide paths in app source", () => {
  const SRC = path.resolve(__dirname, "../../../..");

  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });

  const QUOTED = /(["'`])([^"'`$]+)\1/g;

  /** Text between the brace at `open` and its matching closing brace. */
  const braceBody = (text: string, open: number): string => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
    }
    return "";
  };

  /**
   * Guide paths in the places that take one, and nowhere else, so an
   * unrelated "x/y" string can't fail the test:
   * - helpArticlePath / articlePath / guidePath given a literal, or an
   *   expression whose literals are all paths (a ternary per tab),
   * - openGuide / openUserGuide / userGuideSidebar.open called with a literal,
   * - SOMETHING_GUIDE_PATH / SOMETHING_GUIDE_TARGET constants,
   * - <HelperIcon articlePath="x" sectionId="y" />, read as "x#y" whatever the
   *   attribute order or line breaks.
   */
  const guidePathsIn = (text: string): string[] => {
    const paths: string[] = [];
    const PROP = /\b(?:helpArticlePath|articlePath|guidePath)\s*[=:]\s*(?:(["'`])([^"'`$]+)\1|\{)/g;
    for (const m of text.matchAll(PROP)) {
      if (m[2]) paths.push(m[2]);
      else
        for (const lit of braceBody(text, m.index + m[0].length - 1).matchAll(QUOTED))
          paths.push(lit[2]);
    }
    const CALL = /\b(?:openGuide|openUserGuide|userGuideSidebar\.open)\(\s*(["'`])([^"'`$]+)\1/g;
    for (const m of text.matchAll(CALL)) paths.push(m[2]);
    const CONST =
      /\b[A-Z][A-Z0-9_]*_GUIDE_(?:PATH|TARGET)\s*(?::\s*string\s*)?=\s*(["'`])([^"'`$]+)\1/g;
    for (const m of text.matchAll(CONST)) paths.push(m[2]);
    for (const tag of text.matchAll(/<HelperIcon\b([^>]*?)\/?>/g)) {
      const article = /\barticlePath="([^"]+)"/.exec(tag[1]);
      const section = /\bsectionId="([^"]+)"/.exec(tag[1]);
      if (article && section) paths.push(`${article[1]}#${section[1]}`);
    }
    return paths;
  };

  it("finds guide paths whatever the HelperIcon attribute order", () => {
    const tag = `<HelperIcon\n  sectionId="b"\n  size="small"\n  articlePath="getting-started/dashboard"\n/>`;
    expect(guidePathsIn(tag)).toContain("getting-started/dashboard#b");
    expect(guidePathsIn(`helpArticlePath={x ? "a/b" : "c/d"}`)).toEqual(["a/b", "c/d"]);
    expect(guidePathsIn(`const label = "training/stats";`)).toEqual([]);
  });

  it("every guide path in source resolves to a collection, article and heading", () => {
    const found: { where: string; target: string }[] = [];
    for (const file of sourceFiles(SRC)) {
      const where = path.relative(SRC, file);
      for (const target of guidePathsIn(fs.readFileSync(file, "utf8")))
        found.push({ where, target });
    }
    // An empty scan would pass vacuously; it finds 75 today.
    expect(found.length).toBeGreaterThanOrEqual(MIN_GUIDE_PATHS);
    expect([...new Set(broken(found))]).toEqual([]);
  });
});
