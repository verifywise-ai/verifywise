/**
 * Finds every server message that reaches a translator, using the TypeScript
 * AST rather than regexes. Shared by `extract-i18n-keys.mjs` (writes en.json)
 * and `i18n-check-en.mjs` (CI: en.json must match the code).
 *
 * A "sink" is a place where a string is translated or sent to a client:
 *   - req.t(key) / _req.t!(key) / request.t(key) / t(key)
 *   - translate(lang, key) / translateRequest(req, key)
 *   - new XxxException(key)          (controllers translate error.message)
 *   - sanitizeErrorMessage(error, key)
 *   - i18nKey: key                   (CustomException option, result objects)
 *   - STATUS_CODE[n](key)            (bare: sent untranslated, reported)
 *   - subject: key / getSubject: () => key   (email files only, see below)
 *
 * The key argument does not have to be a literal. It is resolved, within the
 * file and across relative imports, through:
 *   - const declarations and destructuring (`const { failure } = options`)
 *   - lookup maps and arrays (`MESSAGES[action]`, `LABELS.go_live`)
 *   - helper parameters: `notFound(message)` resolves to the literal passed at
 *     every call of `notFound`, including callers in importing files
 *   - return values: `const parsed = parseId(x)` then `req.t(parsed.message)`
 *     resolves to the `message` of every object `parseId` returns
 *   - conditionals, `??` and `||`
 *
 * A template literal can never match a dictionary key, so one that reaches a
 * translator or STATUS_CODE is reported, not turned into a key. Email subjects
 * are the exception: an untranslated `subject: \`Approved: ${x.name}\`` is
 * recorded as the named key "Approved: {name}" so its translation can be kept
 * ready, and listed as untranslated.
 *
 * Strings are taken from the AST, so escapes are decoded (`'risk\'s'` is the
 * key "risk's").
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { SERVERS_ROOT } from "./i18nScriptUtils.mjs";

// Directories never scanned at any depth.
const SKIP_ANYWHERE = new Set(["node_modules", "dist", "tests", "__tests__", "coverage"]);
// Top-level Servers directories that hold no request-time code: build and
// one-off scripts, migrations and seeds, docs, generated output, typings.
const SKIP_TOP_LEVEL = new Set([
  "scripts",
  "database",
  "docs",
  "documentation",
  "endpoints-test",
  "tools",
  "patches",
  "templates",
  "locales",
  "types",
]);
const SKIP_FILE = [/\.test\.ts$/, /\.spec\.ts$/, /\.d\.ts$/];

// Opt-in for the email-subject sinks: `subject:` is too generic to read in
// every file (DB columns, API fields), so only files that send email count.
const EMAIL_FILE_HINT =
  /\b(sendEmail|getSubject|emailService|sendInAppNotification|sendEmailWithTemplate)\b/;

// Strings that reach a translator but are deliberately not in en.json: they
// are read by other systems (webhooks, API key holders), not by people.
export const NOISE_KEYS = new Set([
  "Missing X-API-Key header",
  "Missing X-GitHub-Event header",
  "Missing X-Hub-Signature-256 header",
  "Request body must be raw buffer",
  "Mock data deleted",
  "Mock data inserted",
]);

const REQ_NAMES = /^_?(req|request)$/;
const TRANSLATOR_FNS = new Set(["t", "translate", "translateRequest", "translateError"]);
const MAX_DEPTH = 30;

function listFiles() {
  const out = [];
  const visit = (dir, depth) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_ANYWHERE.has(entry.name)) continue;
        if (depth === 0 && SKIP_TOP_LEVEL.has(entry.name)) continue;
        visit(path.join(dir, entry.name), depth + 1);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !SKIP_FILE.some((re) => re.test(entry.name))
      ) {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  visit(SERVERS_ROOT, 0);
  return out.sort();
}

const unwrap = (n) => {
  while (
    n &&
    (ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isTypeAssertionExpression(n) ||
      ts.isSatisfiesExpression(n) ||
      ts.isAwaitExpression(n))
  ) {
    n = n.expression;
  }
  return n;
};

const calleeName = (call) => {
  const c = unwrap(call.expression);
  if (ts.isIdentifier(c)) return c.text;
  if (ts.isPropertyAccessExpression(c)) return c.name.text;
  return null;
};

const propName = (nameNode) => {
  if (!nameNode) return null;
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) {
    return nameNode.text;
  }
  if (ts.isComputedPropertyName(nameNode)) {
    const e = unwrap(nameNode.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return null;
};

const isTranslatorCall = (n) => {
  n = unwrap(n);
  if (!n || !ts.isCallExpression(n)) return false;
  const c = unwrap(n.expression);
  if (ts.isIdentifier(c)) return TRANSLATOR_FNS.has(c.text);
  if (ts.isPropertyAccessExpression(c)) return c.name.text === "t";
  return false;
};

/**
 * Turn `Approved: ${entity.name}` into "Approved: {name}": the placeholder is
 * the last identifier of the expression, or the one before a trailing method
 * call (`${event.entityType.toLowerCase()}` -> {entityType}). Positional {n}
 * on a clash.
 */
export function namedTemplateKey(tpl) {
  const used = new Set();
  let positional = 0;
  let out = tpl.head.text;
  for (const span of tpl.templateSpans) {
    const expr = span.expression.getText().trim();
    const idents = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
    let name = idents[idents.length - 1];
    if (/\.\s*[a-zA-Z_]\w*\s*\([^)]*\)\s*$/.test(expr) && idents.length > 1) {
      name = idents[idents.length - 2];
    }
    if (!name || used.has(name)) out += `{${++positional}}`;
    else {
      used.add(name);
      out += `{${name}}`;
    }
    out += span.literal.text;
  }
  return out;
}

export function scanServerMessages() {
  const files = listFiles();
  const sourceFiles = new Map(); // abs path -> SourceFile
  for (const f of files) {
    sourceFiles.set(
      f,
      ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true),
    );
  }

  // --- module graph -------------------------------------------------------
  const resolveModule = (fromFile, spec) => {
    if (!spec.startsWith(".")) return null;
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const cand of [`${base}.ts`, path.join(base, "index.ts")]) {
      if (sourceFiles.has(cand)) return cand;
    }
    return null;
  };

  // file -> Map(localName -> { file, name })
  const imports = new Map();
  // `${file}::${exportedName}` -> [{ file: importer, local }]
  const importers = new Map();
  for (const [file, sf] of sourceFiles) {
    const map = new Map();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause) continue;
      const target = resolveModule(file, st.moduleSpecifier.text);
      if (!target) continue;
      const nb = st.importClause.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          const name = (el.propertyName ?? el.name).text;
          map.set(el.name.text, { file: target, name });
          const k = `${target}::${name}`;
          if (!importers.has(k)) importers.set(k, []);
          importers.get(k).push({ file, local: el.name.text });
        }
      }
    }
    imports.set(file, map);
  }

  // file -> Map(calleeName -> CallExpression[])
  const callIndex = new Map();
  for (const [file, sf] of sourceFiles) {
    const idx = new Map();
    const visit = (n) => {
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const name = n.expression ? calleeName(n) : null;
        if (name) {
          if (!idx.has(name)) idx.set(name, []);
          idx.get(name).push(n);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    callIndex.set(file, idx);
  }

  // A top-level declaration of `file`, following `export { x } from` and
  // `export * from` re-exports (barrel index files).
  const topLevelDecl = (file, name, find = findInStatements, hops = 0) => {
    const sf = sourceFiles.get(file);
    if (!sf || hops > 5) return null;
    const own = find(sf.statements, name);
    if (own) return own;
    for (const st of sf.statements) {
      if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
      const target = resolveModule(file, st.moduleSpecifier.text);
      if (!target) continue;
      if (!st.exportClause) {
        const hit = topLevelDecl(target, name, find, hops + 1);
        if (hit) return hit;
      } else if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.name.text !== name) continue;
          const hit = topLevelDecl(target, (el.propertyName ?? el.name).text, find, hops + 1);
          if (hit) return hit;
        }
      }
    }
    return null;
  };

  // --- string-literal union types ------------------------------------------
  function findTypeInStatements(statements, name) {
    for (const st of statements) {
      if (
        (ts.isTypeAliasDeclaration(st) ||
          ts.isInterfaceDeclaration(st) ||
          ts.isEnumDeclaration(st)) &&
        st.name.text === name
      ) {
        return st;
      }
    }
    return null;
  }

  function findTypeDecl(nameNode) {
    const name = nameNode.text;
    const sf = nameNode.getSourceFile();
    const own = findTypeInStatements(sf.statements, name);
    if (own) return own;
    const imp = imports.get(sf.fileName)?.get(name);
    return imp ? topLevelDecl(imp.file, imp.name, findTypeInStatements) : null;
  }

  /**
   * The string literals a type annotation allows, following `path` into
   * interfaces and object types. `null` when the type is not made of string
   * literals only (e.g. plain `string`), so the caller falls back to values.
   */
  function typeValues(typeNode, pathIn, depth = 0) {
    if (!typeNode || depth > MAX_DEPTH) return null;
    const next = depth + 1;
    const all = (nodes, p) => {
      const out = [];
      for (const n of nodes) {
        const v = typeValues(n, p, next);
        if (v === null) return null;
        out.push(...v);
      }
      return out;
    };
    if (ts.isParenthesizedTypeNode(typeNode)) return typeValues(typeNode.type, pathIn, next);
    if (ts.isUnionTypeNode(typeNode)) return all(typeNode.types, pathIn);
    if (ts.isLiteralTypeNode(typeNode)) {
      if (typeNode.literal.kind === ts.SyntaxKind.NullKeyword) return [];
      if (ts.isStringLiteral(typeNode.literal) && pathIn.length === 0) {
        return [{ kind: "lit", value: typeNode.literal.text, node: typeNode.literal }];
      }
      return null;
    }
    if (typeNode.kind === ts.SyntaxKind.UndefinedKeyword) return [];
    if (
      pathIn.length > 0 &&
      (ts.isTypeLiteralNode(typeNode) || ts.isInterfaceDeclaration(typeNode))
    ) {
      const [head, ...rest] = pathIn;
      const members = typeNode.members.filter(
        (m) => ts.isPropertySignature(m) && (head === "*" || propName(m.name) === head),
      );
      return members.length
        ? all(
            members.map((m) => m.type),
            rest,
          )
        : null;
    }
    if (pathIn.length > 0 && ts.isArrayTypeNode(typeNode) && pathIn[0] === "*") {
      return typeValues(typeNode.elementType, pathIn.slice(1), next);
    }
    if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
      const args = typeNode.typeArguments ?? [];
      const name = typeNode.typeName.text;
      if ((name === "Array" || name === "ReadonlyArray") && pathIn[0] === "*" && args[0]) {
        return typeValues(args[0], pathIn.slice(1), next);
      }
      if (name === "Record" && pathIn.length > 0 && args[1]) {
        return typeValues(args[1], pathIn.slice(1), next);
      }
      const decl = findTypeDecl(typeNode.typeName);
      if (!decl) return null;
      if (ts.isTypeAliasDeclaration(decl)) return typeValues(decl.type, pathIn, next);
      if (ts.isInterfaceDeclaration(decl)) return typeValues(decl, pathIn, next);
      if (ts.isEnumDeclaration(decl) && pathIn.length === 0) {
        const out = [];
        for (const m of decl.members) {
          const init = m.initializer && unwrap(m.initializer);
          if (!init || !ts.isStringLiteral(init)) return null;
          out.push({ kind: "lit", value: init.text, node: init });
        }
        return out;
      }
    }
    return null;
  }

  // A string a constant expression folds to: literals, consts, templates of
  // constants and `n.toLocaleString("en-US")`. `null` when not constant.
  function constValue(expr, depth = 0) {
    const e = unwrap(expr);
    if (!e || depth > MAX_DEPTH) return null;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isNumericLiteral(e)) return String(Number(e.text));
    if (ts.isIdentifier(e)) {
      const d = findDecl(e);
      const list = d?.type === "var" ? d.decl.parent : null;
      if (!list || !(list.flags & ts.NodeFlags.Const) || d.path.length || !d.decl.initializer) {
        return null;
      }
      return constValue(d.decl.initializer, depth + 1);
    }
    if (ts.isTemplateExpression(e)) {
      let out = e.head.text;
      for (const span of e.templateSpans) {
        const v = constValue(span.expression, depth + 1);
        if (v === null) return null;
        out += v + span.literal.text;
      }
      return out;
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      const method = e.expression.name.text;
      const recv = constValue(e.expression.expression, depth + 1);
      if (recv === null) return null;
      if (method === "toString" && e.arguments.length === 0) return recv;
      if (method === "toLocaleString") {
        const localeArg = e.arguments[0] && unwrap(e.arguments[0]);
        if (!localeArg || !ts.isStringLiteral(localeArg) || e.arguments.length > 1) return null;
        return Number(recv).toLocaleString(localeArg.text);
      }
    }
    return null;
  }

  // --- name resolution ----------------------------------------------------
  function bindingHit(nameNode, name, pathSoFar = []) {
    if (ts.isIdentifier(nameNode)) return nameNode.text === name ? pathSoFar : null;
    if (ts.isObjectBindingPattern(nameNode)) {
      for (const el of nameNode.elements) {
        if (el.dotDotDotToken) continue;
        const key = propName(el.propertyName ?? el.name);
        if (key === null) continue;
        const hit = bindingHit(el.name, name, [...pathSoFar, key]);
        if (hit) return hit;
      }
    }
    if (ts.isArrayBindingPattern(nameNode)) {
      for (const el of nameNode.elements) {
        if (ts.isOmittedExpression(el)) continue;
        const hit = bindingHit(el.name, name, [...pathSoFar, "*"]);
        if (hit) return hit;
      }
    }
    return null;
  }

  function findInStatements(statements, name) {
    for (const st of statements) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          const p = bindingHit(d.name, name);
          if (p) return { type: "var", decl: d, path: p };
        }
      } else if (ts.isFunctionDeclaration(st) && st.name?.text === name) {
        return { type: "fn", fn: st };
      } else if (ts.isEnumDeclaration(st) && st.name.text === name) {
        return { type: "enum", decl: st };
      }
    }
    return null;
  }

  function findDecl(id) {
    const name = id.text;
    let n = id.parent;
    while (n) {
      if (ts.isFunctionLike(n) && n.parameters) {
        for (let i = 0; i < n.parameters.length; i++) {
          const p = bindingHit(n.parameters[i].name, name);
          if (p) return { type: "param", fn: n, index: i, param: n.parameters[i], path: p };
        }
      }
      if (
        ts.isBlock(n) ||
        ts.isSourceFile(n) ||
        ts.isModuleBlock(n) ||
        ts.isCaseClause(n) ||
        ts.isDefaultClause(n)
      ) {
        const hit = findInStatements(n.statements, name);
        if (hit) return hit;
      }
      if (
        (ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isForStatement(n)) &&
        n.initializer &&
        ts.isVariableDeclarationList(n.initializer)
      ) {
        for (const d of n.initializer.declarations) {
          if (bindingHit(d.name, name)) return { type: "loop" };
        }
      }
      n = n.parent;
    }
    const file = id.getSourceFile().fileName;
    const imp = imports.get(file)?.get(name);
    if (imp) {
      const hit = topLevelDecl(imp.file, imp.name);
      if (hit) return hit;
    }
    return null;
  }

  // The name a function is called by, and the file it is declared in.
  function functionName(fn) {
    if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name) {
      return propName(fn.name);
    }
    const p = fn.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (p && ts.isPropertyAssignment(p)) return propName(p.name);
    return null;
  }

  function callersOf(fn) {
    const name = functionName(fn);
    if (!name) return [];
    const file = fn.getSourceFile().fileName;
    const calls = [...(callIndex.get(file)?.get(name) ?? [])];
    for (const imp of importers.get(`${file}::${name}`) ?? []) {
      calls.push(...(callIndex.get(imp.file)?.get(imp.local) ?? []));
    }
    return calls;
  }

  // Function nodes an expression can evaluate to (for call return values).
  function functionsOf(expr, ctx) {
    expr = unwrap(expr);
    if (!expr) return [];
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return [expr];
    if (ts.isIdentifier(expr)) {
      const d = findDecl(expr);
      if (!d) return [];
      if (d.type === "fn") return [d.fn];
      if (d.type === "var" && d.path.length === 0 && d.decl.initializer) {
        return functionsOf(d.decl.initializer, ctx);
      }
      if (d.type === "param" && d.path.length === 0 && ctx.depth < MAX_DEPTH) {
        const out = [];
        for (const call of callersOf(d.fn)) {
          const arg = call.arguments?.[d.index];
          if (arg) out.push(...functionsOf(arg, { ...ctx, depth: ctx.depth + 1 }));
        }
        return out;
      }
    }
    return [];
  }

  function returnExpressions(fn) {
    if (!fn.body) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    const out = [];
    const visit = (n) => {
      if (ts.isFunctionLike(n)) return;
      if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(fn.body, visit);
    return out;
  }

  /**
   * Every string the expression can be, following `path` into objects:
   * [{ kind: "lit", value, node } | { kind: "tpl", node } |
   *  { kind: "translated" } | { kind: "unresolved", node }]
   */
  function valuesOf(expr, pathIn, ctx) {
    const key = `${expr.getSourceFile().fileName}:${expr.pos}:${expr.end}:${pathIn.join(".")}`;
    if (ctx.seen.has(key) || ctx.depth > MAX_DEPTH) return [];
    ctx.seen.add(key);
    const next = { ...ctx, depth: ctx.depth + 1 };
    const e = unwrap(expr);
    if (!e) return [];

    if (ts.isConditionalExpression(e)) {
      return [...valuesOf(e.whenTrue, pathIn, next), ...valuesOf(e.whenFalse, pathIn, next)];
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
        return [...valuesOf(e.left, pathIn, next), ...valuesOf(e.right, pathIn, next)];
      }
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return valuesOf(e.right, pathIn, next);
    }
    if (ts.isIdentifier(e)) {
      if (e.text === "undefined") return [];
      const d = findDecl(e);
      if (!d) return [{ kind: "unresolved", node: e }];
      if (d.type === "var") {
        if (!d.decl.initializer) return [{ kind: "unresolved", node: e }];
        return valuesOf(d.decl.initializer, [...d.path, ...pathIn], next);
      }
      if (d.type === "param") {
        // A parameter typed as a string-literal union lists its own values.
        const typed = d.path.length === 0 ? typeValues(d.param.type, pathIn) : null;
        if (typed) return typed;
        const out = [];
        if (d.param.initializer && d.path.length === 0) {
          out.push(...valuesOf(d.param.initializer, pathIn, next));
        }
        const callers = callersOf(d.fn);
        if (callers.length === 0) return [...out, { kind: "unresolved", node: e }];
        for (const call of callers) {
          const arg = call.arguments?.[d.index];
          if (arg) out.push(...valuesOf(arg, [...d.path, ...pathIn], next));
        }
        return out;
      }
      if (d.type === "enum") {
        const want = pathIn[0];
        const out = [];
        for (const m of d.decl.members) {
          if (want && want !== "*" && propName(m.name) !== want) continue;
          if (m.initializer) out.push(...valuesOf(m.initializer, pathIn.slice(1), next));
        }
        return out;
      }
      return [{ kind: "unresolved", node: e }];
    }

    if (pathIn.length > 0) {
      const [head, ...rest] = pathIn;
      if (ts.isObjectLiteralExpression(e)) {
        const out = [];
        for (const p of e.properties) {
          const name = propName(p.name);
          if (head !== "*" && name !== head) continue;
          if (ts.isPropertyAssignment(p)) out.push(...valuesOf(p.initializer, rest, next));
          else if (ts.isShorthandPropertyAssignment(p)) out.push(...valuesOf(p.name, rest, next));
        }
        return out;
      }
      if (ts.isArrayLiteralExpression(e)) {
        return e.elements.flatMap((el) => valuesOf(el, rest, next));
      }
    }

    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      return pathIn.length === 0 ? [{ kind: "lit", value: e.text, node: e }] : [];
    }
    if (ts.isTemplateExpression(e)) {
      if (pathIn.length > 0) return [];
      const folded = constValue(e);
      return folded === null
        ? [{ kind: "tpl", node: e }]
        : [{ kind: "lit", value: folded, node: e }];
    }
    if (ts.isPropertyAccessExpression(e)) {
      return valuesOf(e.expression, [e.name.text, ...pathIn], next);
    }
    if (ts.isElementAccessExpression(e)) {
      const arg = unwrap(e.argumentExpression);
      const k = arg && (ts.isStringLiteral(arg) || ts.isNumericLiteral(arg)) ? arg.text : "*";
      return valuesOf(e.expression, [k, ...pathIn], next);
    }
    if (ts.isCallExpression(e)) {
      if (pathIn.length === 0 && isTranslatorCall(e)) return [{ kind: "translated" }];
      const callee = unwrap(e.expression);
      // list.find(...) / list.at(i) is one element of the list.
      if (ts.isPropertyAccessExpression(callee) && ["find", "at"].includes(callee.name.text)) {
        return valuesOf(callee.expression, ["*", ...pathIn], next);
      }
      const fns = functionsOf(e.expression, next);
      if (fns.length === 0) return [{ kind: "unresolved", node: e }];
      return fns.flatMap((fn) => {
        const typed = typeValues(fn.type, pathIn);
        if (typed) return typed;
        return returnExpressions(fn).flatMap((r) => valuesOf(r, pathIn, next));
      });
    }
    return [{ kind: "unresolved", node: e }];
  }

  // --- sinks ----------------------------------------------------------------
  const result = {
    files: files.length,
    keys: new Map(), // key -> { sinks: Set, locs: Set }
    bareStatus: [], // literal sent through STATUS_CODE without translation
    templates: [], // template literal reaching a translator or STATUS_CODE
    untranslatedSubjects: [], // email subject literals/templates (not translated)
    unresolved: 0,
  };
  const loc = (node) => {
    const sf = node.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    return `${path.relative(SERVERS_ROOT, sf.fileName)}:${line + 1}`;
  };
  const addKey = (value, sink, node) => {
    if (!value.trim()) return;
    if (!result.keys.has(value)) result.keys.set(value, { sinks: new Set(), locs: new Set() });
    const k = result.keys.get(value);
    k.sinks.add(sink);
    k.locs.add(loc(node));
  };

  const collect = (arg, sink, at, { onTemplate } = {}) => {
    if (!arg) return;
    const values = valuesOf(arg, [], { seen: new Set(), depth: 0 });
    for (const v of values) {
      if (v.kind === "lit") {
        addKey(v.value, sink, v.node);
        if (sink === "status") result.bareStatus.push({ loc: loc(at), value: v.value });
      } else if (v.kind === "tpl") {
        if (onTemplate) onTemplate(v.node);
        else if (sink !== "exception") {
          result.templates.push({ loc: loc(v.node), sink, text: v.node.getText() });
        }
      } else if (v.kind === "unresolved") {
        result.unresolved++;
      }
    }
  };

  const subjectSink = (arg, at) => {
    const e = unwrap(arg);
    if (!e || isTranslatorCall(e)) return;
    let k = null;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) k = e.text;
    else if (ts.isTemplateExpression(e)) k = namedTemplateKey(e);
    // `${title}: ${name}` has no words of its own to translate.
    if (k === null || !/\p{L}/u.test(k.replace(/\{\w+\}/g, ""))) return;
    addKey(k, "emailSubject", e);
    result.untranslatedSubjects.push({ loc: loc(at), key: k });
  };

  for (const [, sf] of sourceFiles) {
    const emailFile = EMAIL_FILE_HINT.test(sf.text);
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const c = unwrap(n.expression);
        const args = n.arguments;
        const name = calleeName(n);
        if (emailFile && (name === "sendEmail" || name === "sendEmailWithTemplate") && args[1]) {
          subjectSink(args[1], n);
        }
        if (ts.isPropertyAccessExpression(c) && c.name.text === "t") {
          const recv = unwrap(c.expression);
          if (ts.isIdentifier(recv) && REQ_NAMES.test(recv.text)) collect(args[0], "req.t", n);
        } else if (ts.isIdentifier(c)) {
          if (c.text === "t") collect(args[0], "t", n);
          else if (c.text === "translate" || c.text === "translateRequest") {
            collect(args[1], c.text, n);
          } else if (c.text === "sanitizeErrorMessage") collect(args[1], "sanitize", n);
        } else if (
          ts.isElementAccessExpression(c) &&
          ts.isIdentifier(c.expression) &&
          c.expression.text === "STATUS_CODE" &&
          args[0]
        ) {
          // Only a literal written at the call is a bare message. A variable
          // passed to STATUS_CODE is usually data (`STATUS_CODE[200](rows)`).
          const a = unwrap(args[0]);
          if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))
            collect(a, "status", n);
          else if (ts.isTemplateExpression(a)) collect(a, "status", n);
        }
      } else if (ts.isNewExpression(n)) {
        const c = n.expression;
        if (ts.isIdentifier(c) && /Exception$/.test(c.text) && n.arguments?.[0]) {
          collect(n.arguments[0], "exception", n);
        }
      } else if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
        const name = propName(n.name);
        const value = ts.isPropertyAssignment(n) ? n.initializer : n.name;
        if (name === "i18nKey") collect(value, "i18nKey", n);
        else if (emailFile && name === "subject") subjectSink(value, n);
        else if (emailFile && name === "getSubject") {
          const fn = unwrap(value);
          if (fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) subjectSink(fn.body, n);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  for (const k of NOISE_KEYS) result.keys.delete(k);
  result.bareStatus = result.bareStatus.filter((b) => !NOISE_KEYS.has(b.value));
  return result;
}
