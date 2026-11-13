/**
 * Tests for the i18n code scanner (scripts/lib/i18nCodeScanner.mjs).
 *
 * Run with `npm run test:i18n-scripts` (node:test, no build step; kept out of
 * jest, whose patterns match neither this folder nor the .node-test name). Each test
 * writes a small fixture tree to a temporary directory and scans it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanServerMessages } from "../lib/i18nCodeScanner.mjs";

const I18N_UTILS = `
export type Translator = (key: string, vars?: Record<string, string | number>) => string;
export const translate = (lang: string | undefined, key: string, vars?: Record<string, string | number>) => key;
export const translateRequest = (req: { t?: Translator }, key: string) => key;
export const getTranslator = (lang: string): Translator => (key) => key;
`;

function scanFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-scan-"));
  try {
    for (const [rel, text] of Object.entries({ "utils/i18n.utils.ts": I18N_UTILS, ...files })) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return scanServerMessages({ root });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("only real translators are sinks", () => {
  const scan = scanFixture({
    "controllers/a.ctrl.ts": `
      import { translate, translateRequest } from "../utils/i18n.utils";
      const t = (s: string) => s.trim();
      const obj = { t: (s: string) => s };
      export function handler(req: any, _req: any) {
        t("not a key: local t");
        obj.t("not a key: obj.t");
        _req.t("not a key: _req.t");
        req.t("Real key from req.t");
        translate("de", "Real key from translate");
        translateRequest(req, "Real key from translateRequest");
      }
    `,
    "controllers/b.ctrl.ts": `
      const translate = (a: string, b: string) => b;
      export const run = () => translate("x", "not a key: local translate");
    `,
  });
  const keys = [...scan.keys.keys()].sort();
  assert.deepEqual(keys, [
    "Real key from req.t",
    "Real key from translate",
    "Real key from translateRequest",
  ]);
});

test("a t that receives req.t through a caller is a translator", () => {
  const scan = scanFixture({
    "services/org.service.ts": `
      const identity = (m: string) => m;
      export function createOrg(input: { t?: (m: string) => string }) {
        const t = input.t ?? identity;
        return t("Real key through input.t");
      }
      export function removeUser(id: number, t: (m: string) => string = identity) {
        return t("Real key through a parameter");
      }
    `,
    "controllers/org.ctrl.ts": `
      import { createOrg, removeUser } from "../services/org.service";
      export function handler(req: any) {
        createOrg({ t: req.t! });
        removeUser(1, req.t!);
      }
    `,
  });
  assert.ok(scan.keys.has("Real key through input.t"));
  assert.ok(scan.keys.has("Real key through a parameter"));
});

test("helpers, lookup maps and keyed notification fields resolve to keys", () => {
  const scan = scanFixture({
    "controllers/c.ctrl.ts": `
      const MESSAGES = { go_live: "Only a planned use case can go live" };
      const notFound = (message: string) => ({ status: 404, message });
      export function handler(req: any, action: "go_live") {
        const outcome = notFound("Training not found");
        req.t(outcome.message);
        req.t(MESSAGES[action]);
        return { titleKey: "Keyed title", subjectKey: "Keyed subject: {name}" };
      }
    `,
  });
  for (const k of [
    "Only a planned use case can go live",
    "Training not found",
    "Keyed title",
    "Keyed subject: {name}",
  ]) {
    assert.ok(scan.keys.has(k), k);
  }
});

test("bare STATUS_CODE literals and template messages are reported", () => {
  const scan = scanFixture({
    "controllers/d.ctrl.ts": `
      export function handler(req: any, res: any, id: string) {
        res.json(STATUS_CODE[400]("Bare message"));
        res.json(STATUS_CODE[400](\`Template \${id}\`));
        res.json(STATUS_CODE[400](req.t("Wrapped message")));
      }
    `,
  });
  assert.deepEqual(
    scan.bareStatus.map((b) => b.value),
    ["Bare message"],
  );
  assert.equal(scan.templates.length, 1);
  assert.ok(scan.keys.has("Wrapped message"));
});

test("untranslated email subjects in config objects are optional keys", () => {
  const scan = scanFixture({
    "controllers/e.ctrl.ts": `
      export async function alert(isHard: boolean, m: string) {
        const title = isHard ? \`Metric breach: \${m}\` : "Metric fine";
        await dispatchAlerts(1, [2], { type: "x", title, message: "m" }, true, {
          template: "breach",
          subject: title,
          variables: {},
        });
      }
    `,
  });
  const subjects = scan.untranslatedSubjects.map((s) => s.key).sort();
  assert.deepEqual(subjects, ["Metric breach: {m}", "Metric fine"]);
  assert.ok(!scan.keys.has("Metric fine"), "untranslated subjects are not required keys");
  assert.ok(scan.subjectKeys.has("Metric fine"));
  assert.equal(scan.untranslatedTitles.length, 2);
});
