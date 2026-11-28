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
import { GUIDE_ROUTE_RULES } from "../guideRouteMap";

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
    ]).map((target) => ({ where: "guideRouteMap", target }));
    expect(broken(targets)).toEqual([]);
  });
});

describe("guide paths in app source", () => {
  const SRC = path.resolve(__dirname, "../../../..");

  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });

  const collectionIds = collections.map((c) => c.id).join("|");
  const PATTERNS = [
    // Props and fields that take a guide path: helpArticlePath="x", articlePath="x", guidePath: "x"
    /\b(?:helpArticlePath|articlePath|guidePath)\s*[=:]\s*\{?\s*(["'`])([^"'`$]+)\1/g,
    // Calls that open the guide sidebar on a path
    /\b(?:openGuide|openUserGuide|userGuideSidebar\.open)\(\s*(["'`])([^"'`$]+)\1/g,
    // Any "collection/article" literal (catches ternaries and config objects)
    new RegExp(`(["'\`])((?:${collectionIds})/[a-z0-9-]+(?:#[a-z0-9-]+)?)\\1`, "g"),
  ];
  // <HelperIcon articlePath="x" sectionId="y" /> opens "x#y"
  const WITH_SECTION = /articlePath="([^"]+)"\s+sectionId="([^"]+)"/g;

  it("every guide path literal resolves to a collection, article and heading", () => {
    const found: { where: string; target: string }[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, "utf8");
      const where = path.relative(SRC, file);
      for (const pattern of PATTERNS) {
        for (const m of text.matchAll(pattern)) found.push({ where, target: m[2] });
      }
      for (const m of text.matchAll(WITH_SECTION)) found.push({ where, target: `${m[1]}#${m[2]}` });
    }
    // The scan finding nothing would pass vacuously; there are 60+ call sites.
    expect(found.length).toBeGreaterThan(50);
    // One literal can match more than one pattern; report each once.
    expect([...new Set(broken(found))]).toEqual([]);
  });
});
