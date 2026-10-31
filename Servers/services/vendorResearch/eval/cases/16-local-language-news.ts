import type { EvalCase } from "../types";
import { NOW, finish, page, result } from "./builders";

const SITE = "https://brume-logiciels.fr";
const BREACH = "https://www.journaldunet.example/brume-logiciels-fuite-de-donnees";
const SECOND_BREACH = "https://www.silicon.example/brume-logiciels-base-ouverte";
const FINE = "https://www.lemonde.example/cnil-sanctionne-brume-logiciels";
const SITEMAP = `${SITE}/sitemap.xml`;

/**
 * A vendor in France (see market.ts). Its country domain (`.fr`) and the legal form of its name
 * (SAS) say that its press writes in French, and the French press is where its breach and the fine
 * of the CNIL are reported: the English searches find nothing. The code searches the news in
 * French as well, with the name of the authority, the session keeps the French articles, and the
 * analysis writes the findings in English and quotes the French of the sources as it is written.
 *
 * Under the credibility rule the breach is Low, because both of its publishers are unknown to the
 * registry (spec D5.6 #4); the fine stays Low, on one publisher the registry does not know either.
 *
 * If this case fails, the searches in the language of the market are no longer made, or the
 * analysis no longer accepts a quote that is not English.
 */
export const LOCAL_LANGUAGE_NEWS: EvalCase = {
  id: "local-language-news",
  title: "The press writes in French, and so does the authority",
  reproduces:
    "A vendor in a country whose press writes in its own language was searched in English only, and the fine of its data protection authority was never found.",
  vendor: {
    name: "Brume Logiciels SAS",
    website: "brume-logiciels.fr",
    provides: "Business management software",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the articles and the vendor's pages")],
    searches: [
      { kind: "news", query: "Brume Logiciels data breach", results: [] },
      { kind: "news", query: "Brume Logiciels security incident", results: [] },
      {
        kind: "news",
        query: "Brume Logiciels fuite de données",
        results: [
          result(
            BREACH,
            "Brume Logiciels : une fuite de données touche 30 000 clients",
            "L'éditeur Brume Logiciels a confirmé qu'une base de données de clients est restée accessible sans mot de passe pendant deux semaines.",
            "2026-09-22",
            "Journal du Net",
          ),
          result(
            SECOND_BREACH,
            "Base de données ouverte chez Brume Logiciels",
            "Une base contenant les coordonnées de 30 000 clients de Brume Logiciels était exposée sur internet, selon un chercheur en sécurité.",
            "2026-09-23",
            "Silicon",
          ),
        ],
      },
      { kind: "news", query: "Brume Logiciels cyberattaque", results: [] },
      { kind: "news", query: "Brume Logiciels lawsuit", results: [] },
      { kind: "news", query: "Brume Logiciels fined", results: [] },
      { kind: "news", query: "Brume Logiciels FTC", results: [] },
      { kind: "news", query: "Brume Logiciels settlement", results: [] },
      { kind: "news", query: "Brume Logiciels outage", results: [] },
      { kind: "news", query: "Brume Logiciels layoffs", results: [] },
      { kind: "news", query: "Brume Logiciels bankruptcy", results: [] },
      { kind: "news", query: "Brume Logiciels acquisition", results: [] },
      {
        kind: "news",
        query: "Brume Logiciels CNIL sanction",
        results: [
          result(
            FINE,
            "La CNIL sanctionne Brume Logiciels de 150 000 euros",
            "La CNIL a prononcé une amende de 150 000 euros contre Brume Logiciels pour un défaut de sécurité des données de ses clients.",
            "2026-08-14",
            "Le Monde",
          ),
        ],
      },
      { kind: "news", query: "Brume Logiciels plainte", results: [] },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: {
          ...page(
            `${SITE}/`,
            "Brume Logiciels",
            "Brume Logiciels publie des logiciels de gestion pour les petites entreprises.",
          ),
          links: [
            { text: "Trust centre", url: `${SITE}/trust` },
            { text: "Security", url: `${SITE}/security` },
            { text: "Privacy policy", url: `${SITE}/privacy` },
          ],
        },
      },
      {
        url: SITEMAP,
        page: page(
          SITEMAP,
          "",
          `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${SITE}/tarifs</loc></url><url><loc>${SITE}/legal/subprocessors</loc></url></urlset>`,
        ),
      },
      {
        url: BREACH,
        page: page(
          BREACH,
          "Brume Logiciels : une fuite de données touche 30 000 clients",
          "L'éditeur Brume Logiciels a confirmé qu'une base de données de clients est restée accessible sans mot de passe pendant deux semaines. L'entreprise a fermé l'accès et dit n'avoir trouvé aucune trace de copie des données.",
        ),
      },
      {
        url: SECOND_BREACH,
        page: page(
          SECOND_BREACH,
          "Base de données ouverte chez Brume Logiciels",
          "Une base contenant les coordonnées de 30 000 clients de Brume Logiciels était exposée sur internet, selon un chercheur en sécurité. L'éditeur affirme avoir prévenu ses clients par courriel.",
        ),
      },
      {
        url: FINE,
        page: page(
          FINE,
          "La CNIL sanctionne Brume Logiciels de 150 000 euros",
          "La CNIL a prononcé une amende de 150 000 euros contre Brume Logiciels pour un défaut de sécurité des données de ses clients. La sanction date d'août 2026.",
        ),
      },
      {
        url: `${SITE}/trust`,
        page: page(
          `${SITE}/trust`,
          "Trust centre",
          "Brume Logiciels holds an ISO 27001 certificate, renewed every year.",
        ),
      },
      {
        url: `${SITE}/security`,
        page: page(
          `${SITE}/security`,
          "Security",
          "Data at Brume Logiciels is encrypted in transit and at rest. We run a penetration test every year.",
        ),
      },
      {
        url: `${SITE}/privacy`,
        page: page(
          `${SITE}/privacy`,
          "Privacy policy",
          "We do not use customer data to train models. Our subprocessors are listed on a page of their own.",
        ),
      },
      {
        url: `${SITE}/legal/subprocessors`,
        page: page(
          `${SITE}/legal/subprocessors`,
          "Subprocessors",
          "Brume Logiciels uses a hosting provider and an email provider. It uses no model provider.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "A customer database of Brume Logiciels was reachable without a password for two weeks in September 2026, and held the details of about 30,000 customers.",
          impact_description:
            "Customer data we store with the vendor may have been readable by others during that time.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor whether our data was in the database and for its incident report.",
          confidence: "medium",
          rationale:
            "Two French publishers report it and the vendor has confirmed it, but nobody says whether the data was copied.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "une base de données de clients est restée accessible sans mot de passe pendant deux semaines",
            },
            {
              source_id: "S2",
              quote:
                "Une base contenant les coordonnées de 30 000 clients de Brume Logiciels était exposée sur internet",
            },
          ],
        },
        {
          category: "legal_regulatory",
          risk_description:
            "The French data protection authority fined Brume Logiciels 150,000 euros in August 2026 for failing to secure the data of its customers.",
          impact_description:
            "The fine shows that the vendor's security did not meet the legal duty at the time, which bears on the data we give it.",
          likelihood: "Likely",
          risk_severity: "Minor",
          action_plan:
            "Ask the vendor what it changed after the fine and whether it has told its customers.",
          confidence: "low",
          rationale:
            "One article reports the fine and the amount is stated, but it is not on the page of the authority.",
          evidence: [
            {
              source_id: "S5",
              quote:
                "une amende de 150 000 euros contre Brume Logiciels pour un défaut de sécurité des données de ses clients",
            },
          ],
        },
      ],
      category_notes: [
        { category: "certifications", note: "An ISO 27001 certificate is stated as current." },
        { category: "ai_specific", note: "The vendor says it uses no model provider." },
      ],
    },
  },
  expected: {
    findings: [
      { category: "security_incidents", anyOf: ["database", "30,000"], credibility: "low" },
      { category: "legal_regulatory", anyOf: ["150,000", "fined"], credibility: "low" },
    ],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 2,
    maxIrrelevantSources: 0,
    maxDuplicateSources: 0,
    maxBadUrls: 0,
    maxDatedWebResults: 0,
    maxSnippetOnlyFindings: 0,
    maxOverconfident: 0,
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
