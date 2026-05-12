#!/usr/bin/env node
/**
 * Generate de.json and fr.json from en.json using a hand-curated glossary +
 * sentence-pattern templates. NO network calls — this runs offline and
 * produces deterministic output.
 *
 * Coverage strategy (Phase 5):
 *   1. Hand-translated phrases (HAND_TRANSLATIONS) — short, high-visibility
 *      messages that need nuance the templates can't capture (e.g. articles,
 *      gender). Highest priority.
 *   2. Frontend glossary (Clients/src/i18n/translations.ts) — picks up the
 *      ~1 backend key that overlaps with the UI dictionary.
 *   3. Sentence templates — predictable patterns ("<X> is required", "Invalid
 *      <X>", "<X> not found", etc.) composed with the noun glossary.
 *   4. Anything that doesn't match passes through as English. The runtime
 *      falls back to the key when a translation is missing, so unmatched
 *      strings still render correctly (just in English).
 *
 * Technical tokens (snake_case, dotted paths, ALL_CAPS) and placeholders
 * ({name}, {1}) inside an English string pass through unchanged.
 *
 * Quality bar: machine quality acceptable per Phase 5 plan. Native-speaker
 * review is a deferred TODO when a paying customer commits.
 *
 * Usage:
 *   node scripts/translate-with-glossary.mjs              # write de.json + fr.json
 *   node scripts/translate-with-glossary.mjs --dry-run    # print stats + samples
 */
import fs from "node:fs";
import path from "node:path";
import { SERVERS_ROOT, readJson, writeJson } from "./lib/i18nScriptUtils.mjs";

const EN_PATH = path.join(SERVERS_ROOT, "locales", "en.json");
const DE_PATH = path.join(SERVERS_ROOT, "locales", "de.json");
const FR_PATH = path.join(SERVERS_ROOT, "locales", "fr.json");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Conservative French elision: vowel/h-leading nouns take "d'", others take "de ".
function frArticle(noun) {
  return /^[aeiouhAEIOUH]/.test(noun) ? `d'${noun}` : `de ${noun}`;
}

// ─── Domain glossary ─────────────────────────────────────────────────────────
// Keys are lowercase singular English; values are [de, fr]. Mirrors frontend
// translations.ts choices for consistency between toast (frontend) and error
// message (backend).
const NOUNS = {
  account: ["Konto", "compte"],
  action: ["Aktion", "action"],
  annotation: ["Anmerkung", "annotation"],
  approval: ["Genehmigung", "approbation"],
  approver: ["Genehmiger", "approbateur"],
  assessment: ["Bewertung", "évaluation"],
  assignee: ["Beauftragter", "destinataire"],
  category: ["Kategorie", "catégorie"],
  control: ["Kontrolle", "contrôle"],
  "control category": ["Kontrollkategorie", "catégorie de contrôle"],
  configuration: ["Konfiguration", "configuration"],
  dataset: ["Datensatz", "ensemble de données"],
  description: ["Beschreibung", "description"],
  email: ["E-Mail", "e-mail"],
  evidence: ["Nachweis", "preuve"],
  field: ["Feld", "champ"],
  file: ["Datei", "fichier"],
  folder: ["Ordner", "dossier"],
  form: ["Formular", "formulaire"],
  framework: ["Rahmenwerk", "cadre"],
  fria: ["FRIA", "FRIA"],
  incident: ["Vorfall", "incident"],
  intake: ["Aufnahme", "réception"],
  link: ["Verknüpfung", "lien"],
  model: ["Modell", "modèle"],
  "model inventory": ["Modellinventar", "inventaire des modèles"],
  "model risk": ["Modellrisiko", "risque du modèle"],
  name: ["Name", "nom"],
  note: ["Notiz", "note"],
  notification: ["Benachrichtigung", "notification"],
  organization: ["Organisation", "organisation"],
  password: ["Passwort", "mot de passe"],
  plugin: ["Plugin", "plugin"],
  policy: ["Richtlinie", "politique"],
  project: ["Projekt", "projet"],
  "project member": ["Projektmitglied", "membre du projet"],
  "project risk": ["Projektrisiko", "risque du projet"],
  "project scope": ["Projektumfang", "périmètre du projet"],
  question: ["Frage", "question"],
  report: ["Bericht", "rapport"],
  request: ["Anfrage", "demande"],
  resource: ["Ressource", "ressource"],
  reviewer: ["Prüfer", "réviseur"],
  risk: ["Risiko", "risque"],
  role: ["Rolle", "rôle"],
  rule: ["Regel", "règle"],
  scan: ["Scan", "analyse"],
  step: ["Schritt", "étape"],
  status: ["Status", "statut"],
  submission: ["Einreichung", "soumission"],
  subcontrol: ["Unterkontrolle", "sous-contrôle"],
  subtopic: ["Unterthema", "sous-sujet"],
  task: ["Aufgabe", "tâche"],
  team: ["Team", "équipe"],
  title: ["Titel", "titre"],
  token: ["Token", "jeton"],
  topic: ["Thema", "sujet"],
  training: ["Schulung", "formation"],
  trigger: ["Auslöser", "déclencheur"],
  user: ["Benutzer", "utilisateur"],
  vendor: ["Anbieter", "fournisseur"],
  "vendor risk": ["Anbieterrisiko", "risque du fournisseur"],
  view: ["Ansicht", "vue"],
  workflow: ["Arbeitsablauf", "flux de travail"],
};

// Suffixes for "<noun> <suffix>" compounds (e.g. "Action ID", "Plugin key").
// Suffixes that are themselves nouns (name/description/status/title) reuse
// NOUNS automatically — only entries unique to suffix usage are listed here.
// Acronyms keep their English form on both sides.
const SUFFIX_ONLY = {
  id: ["ID", "ID"],
  key: ["Schlüssel", "clé"],
  url: ["URL", "URL"],
  type: ["Typ", "type"],
  code: ["Code", "code"],
  label: ["Bezeichnung", "libellé"],
};

function lookupNoun(phrase, lang) {
  const idx = lang === "de" ? 0 : 1;
  const entry = NOUNS[phrase.toLowerCase()];
  return entry ? entry[idx] : null;
}

function lookupSuffix(suffix, lang) {
  const idx = lang === "de" ? 0 : 1;
  const key = suffix.toLowerCase();
  if (SUFFIX_ONLY[key]) return SUFFIX_ONLY[key][idx];
  if (NOUNS[key]) return NOUNS[key][idx];
  return null;
}

// Look up a possibly-compound phrase. Tries:
//   1. Full lowercase phrase against NOUNS.
//   2. Phrase with trailing suffix (key/id/url/...) — translate the lead noun
//      and the suffix separately, then compose.
//      "Action ID" -> DE "Aktion-ID", FR "ID d'action".
function lookupPhrase(phrase, lang) {
  const direct = lookupNoun(phrase, lang);
  if (direct) return direct;

  const words = phrase.split(/\s+/);
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  const localizedSuffix = lookupSuffix(last, lang);
  if (!localizedSuffix) return null;
  const head = words.slice(0, -1).join(" ");
  const headTr = lookupNoun(head, lang);
  if (!headTr) return null;

  if (lang === "de") return `${titleCase(headTr)}-${titleCase(localizedSuffix)}`;
  return `${titleCase(localizedSuffix)} ${frArticle(headTr.toLowerCase())}`;
}

// ─── Sentence templates ─────────────────────────────────────────────────────
// `makeTemplate` turns a (regex, deFmt, frFmt) triple into the shape
// `translateOne` expects. Each format function receives the title-cased noun
// translation and an optional context object (for plurality, etc.).
function makeTemplate(test, deFmt, frFmt) {
  return {
    test,
    apply: (m) => {
      const noun = m[1];
      const ctx = { isPlural: m[2] === "are" };
      const de = lookupPhrase(noun, "de");
      const fr = lookupPhrase(noun, "fr");
      return {
        de: de ? deFmt(titleCase(de), ctx) : null,
        fr: fr ? frFmt(titleCase(fr), ctx) : null,
      };
    },
  };
}

const TEMPLATES = [
  makeTemplate(
    /^(.+?) (is|are) required$/,
    (n, { isPlural }) => `${n} ${isPlural ? "sind" : "ist"} erforderlich`,
    (n, { isPlural }) => `${n} ${isPlural ? "sont requis" : "est requis"}`,
  ),
  // "<noun> with ID {id} not found" — used by translated dynamic exceptions.
  // Placed BEFORE the generic `not found` template: first-match-wins, and
  // specific patterns must precede general ones.
  makeTemplate(
    /^(.+?) with ID \{id\} not found$/,
    (n) => `${n} mit ID {id} nicht gefunden`,
    (n) => `${n} avec l'ID {id} introuvable`,
  ),
  makeTemplate(
    /^(.+?) not found$/,
    (n) => `${n} nicht gefunden`,
    (n) => `${n} introuvable`,
  ),
  makeTemplate(
    /^Invalid (.+?)$/,
    (n) => `Ungültige ${n}`,
    (n) => `${n} invalide`,
  ),
  makeTemplate(
    /^(.+?) deleted successfully\.?$/,
    (n) => `${n} erfolgreich gelöscht`,
    (n) => `${n} supprimé(e) avec succès`,
  ),
  makeTemplate(
    /^(.+?) saved successfully\.?$/,
    (n) => `${n} erfolgreich gespeichert`,
    (n) => `${n} enregistré(e) avec succès`,
  ),
  makeTemplate(
    /^(.+?) updated successfully\.?$/,
    (n) => `${n} erfolgreich aktualisiert`,
    (n) => `${n} mis(e) à jour avec succès`,
  ),
  makeTemplate(
    /^(.+?) created successfully\.?$/,
    (n) => `${n} erfolgreich erstellt`,
    (n) => `${n} créé(e) avec succès`,
  ),
  makeTemplate(
    /^(.+?) cannot be empty$/,
    (n) => `${n} darf nicht leer sein`,
    (n) => `${n} ne peut pas être vide`,
  ),
];

// ─── Hand-translated phrases ─────────────────────────────────────────────────
// Short, high-visibility messages where templates would lose nuance — French
// articles ("Le jeton..."), gendered adjectives, idiomatic phrasing. Entries
// here override the templates intentionally; do NOT remove an entry just
// because a template "covers" the same English string.
const HAND_TRANSLATIONS = {
  "Access denied": { de: "Zugriff verweigert", fr: "Accès refusé" },
  Unauthorized: { de: "Nicht autorisiert", fr: "Non autorisé" },
  "User not authenticated": {
    de: "Benutzer nicht authentifiziert",
    fr: "Utilisateur non authentifié",
  },
  "Insufficient permissions": {
    de: "Unzureichende Berechtigungen",
    fr: "Autorisations insuffisantes",
  },
  "Internal server error": {
    de: "Interner Serverfehler",
    fr: "Erreur interne du serveur",
  },
  "Not Found": { de: "Nicht gefunden", fr: "Introuvable" },
  "Invalid email format": {
    de: "Ungültiges E-Mail-Format",
    fr: "Format d'e-mail invalide",
  },
  "Invalid email or password": {
    de: "Ungültige E-Mail oder ungültiges Passwort",
    fr: "E-mail ou mot de passe invalide",
  },
  "Current password is incorrect": {
    de: "Aktuelles Passwort ist falsch",
    fr: "Le mot de passe actuel est incorrect",
  },
  "Token is required": { de: "Token ist erforderlich", fr: "Le jeton est requis" },
  "Refresh token is required": {
    de: "Refresh-Token ist erforderlich",
    fr: "Le jeton d'actualisation est requis",
  },
  "Invalid refresh token": {
    de: "Ungültiges Refresh-Token",
    fr: "Jeton d'actualisation invalide",
  },
  "Email already exists": { de: "E-Mail existiert bereits", fr: "L'e-mail existe déjà" },
  "User with this email already exists": {
    de: "Benutzer mit dieser E-Mail existiert bereits",
    fr: "Un utilisateur avec cet e-mail existe déjà",
  },
  "A user with this email already exists": {
    de: "Ein Benutzer mit dieser E-Mail existiert bereits",
    fr: "Un utilisateur avec cet e-mail existe déjà",
  },
  "Create your account": {
    de: "Erstellen Sie Ihr Konto",
    fr: "Créez votre compte",
  },
  "Password reset request": {
    de: "Passwort zurücksetzen",
    fr: "Demande de réinitialisation du mot de passe",
  },
  "No file provided": {
    de: "Keine Datei bereitgestellt",
    fr: "Aucun fichier fourni",
  },
  "No file uploaded": {
    de: "Keine Datei hochgeladen",
    fr: "Aucun fichier téléversé",
  },
  "No fields to update": {
    de: "Keine Felder zu aktualisieren",
    fr: "Aucun champ à mettre à jour",
  },
  "No valid fields to update": {
    de: "Keine gültigen Felder zu aktualisieren",
    fr: "Aucun champ valide à mettre à jour",
  },
  "No valid fields provided for update": {
    de: "Keine gültigen Felder zur Aktualisierung angegeben",
    fr: "Aucun champ valide fourni pour la mise à jour",
  },
  // approvalWorkflow.ctrl.ts dynamic-step messages
  "Step {n} name is required": {
    de: "Schritt {n}: Name ist erforderlich",
    fr: "Étape {n} : le nom est requis",
  },
  "Step {n} must have at least one approver": {
    de: "Schritt {n} benötigt mindestens einen Genehmiger",
    fr: "L'étape {n} doit avoir au moins un approbateur",
  },
  "Step {n} must have requires_all_approvers field": {
    de: "Schritt {n} benötigt das Feld requires_all_approvers",
    fr: "L'étape {n} doit avoir le champ requires_all_approvers",
  },
  // Intake-form email subjects (Phase 6 in-scope)
  "Submission received: {formName}": {
    de: "Einreichung erhalten: {formName}",
    fr: "Soumission reçue : {formName}",
  },
  "New submission pending review: {formName}": {
    de: "Neue Einreichung zur Überprüfung: {formName}",
    fr: "Nouvelle soumission en attente d'examen : {formName}",
  },
  "Submission approved: {formName}": {
    de: "Einreichung genehmigt: {formName}",
    fr: "Soumission approuvée : {formName}",
  },
  "Submission requires changes: {formName}": {
    de: "Einreichung erfordert Änderungen: {formName}",
    fr: "La soumission nécessite des modifications : {formName}",
  },
};

// Returns { translated: string, source: "hand"|"existing"|"frontend"|"template"|"english" }.
// Resolution order:
//   1. HAND_TRANSLATIONS (highest priority — explicit overrides)
//   2. existing — preserves a translation already in de.json/fr.json that
//      isn't identical to English. Lets human edits and prior LLM passes
//      survive a regeneration.
//   3. Frontend glossary (rare overlap with backend keys)
//   4. Sentence templates
//   5. Fall back to English
function translateOne(en, lang, frontendGlossary, existingDict, sourceEn) {
  if (HAND_TRANSLATIONS[en]) {
    return { translated: HAND_TRANSLATIONS[en][lang], source: "hand" };
  }
  if (existingDict && existingDict[en] && existingDict[en] !== sourceEn) {
    return { translated: existingDict[en], source: "existing" };
  }
  if (frontendGlossary[en]) {
    return { translated: frontendGlossary[en], source: "frontend" };
  }
  for (const tpl of TEMPLATES) {
    const m = en.match(tpl.test);
    if (!m) continue;
    const result = tpl.apply(m);
    if (result[lang]) return { translated: result[lang], source: "template" };
  }
  return { translated: en, source: "english" };
}

// ─── Frontend glossary loader ────────────────────────────────────────────────
// Caveat: hand-rolled brace-balancing parser. Assumes string values do not
// contain unescaped `{` or `}`. The current frontend translations use `{name}`
// placeholders inside values — those are valid JS string contents but DO NOT
// upset our balancer (we only count braces in `src`, not within string
// literals). If the frontend ever introduces a key/value containing a literal
// `}` outside a string, this parser would skew. Worth revisiting then.
const TRANSLATIONS_TS = path.join(SERVERS_ROOT, "..", "Clients", "src", "i18n", "translations.ts");
let _translationsSrc = null;
function loadFrontendGlossary(lang) {
  if (_translationsSrc === null) _translationsSrc = fs.readFileSync(TRANSLATIONS_TS, "utf8");
  const src = _translationsSrc;
  const start = src.indexOf(`${lang}: {`);
  if (start < 0) return {};
  let depth = 0;
  let i = src.indexOf("{", start);
  const blockStart = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = src.slice(blockStart + 1, i);
  const re = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const dict = {};
  let m;
  while ((m = re.exec(body))) {
    const key = m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const val = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    dict[key] = val;
  }
  return dict;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const en = readJson(EN_PATH);
const glossaryDe = loadFrontendGlossary("de");
const glossaryFr = loadFrontendGlossary("fr");

// Load existing translations so prior hand-translations / LLM-generated
// translations survive a regeneration. Missing files yield empty dicts.
const existingDe = readJson(DE_PATH, {});
const existingFr = readJson(FR_PATH, {});

const out = { de: {}, fr: {} };
const stats = {
  de: { hand: 0, existing: 0, frontend: 0, template: 0, english: 0 },
  fr: { hand: 0, existing: 0, frontend: 0, template: 0, english: 0 },
};

const enKeys = Object.keys(en).sort((a, b) => a.localeCompare(b));
for (const key of enKeys) {
  const de = translateOne(key, "de", glossaryDe, existingDe, en[key]);
  const fr = translateOne(key, "fr", glossaryFr, existingFr, en[key]);
  out.de[key] = de.translated;
  out.fr[key] = fr.translated;
  stats.de[de.source]++;
  stats.fr[fr.source]++;
}

console.log("=== translate-with-glossary ===");
console.log(`Source keys: ${enKeys.length}`);
console.log("DE:", stats.de);
console.log("FR:", stats.fr);
const dePct = Math.round(((enKeys.length - stats.de.english) / enKeys.length) * 100);
const frPct = Math.round(((enKeys.length - stats.fr.english) / enKeys.length) * 100);
console.log(`Translated: DE ${dePct}%  FR ${frPct}%`);

if (DRY_RUN) {
  console.log("\nSample translations:");
  for (const key of enKeys.slice(0, 10)) {
    console.log(`  EN: ${key}`);
    console.log(`  DE: ${out.de[key]}`);
    console.log(`  FR: ${out.fr[key]}`);
    console.log();
  }
} else {
  writeJson(DE_PATH, out.de);
  writeJson(FR_PATH, out.fr);
  console.log(`\nWrote ${enKeys.length} keys each to de.json + fr.json`);
}
