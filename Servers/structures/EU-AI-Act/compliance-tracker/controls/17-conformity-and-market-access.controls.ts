export const ConformityAndMarketAccess = [
  {
    order_no: 1,
    title:
      "Non-EU providers must appoint an authorized representative established in the Union before placing a high-risk AI system on the market.",
    description:
      "Authorized representative appointment and mandate requirements for non-EU providers (Art 22).",
    article: "Art. 22",
    subControls: [
      {
        order_no: 1,
        title:
          "If established outside the Union, we have appointed an authorized representative in the Union by written mandate.",
        description:
          "Written mandate appointing the EU authorized representative prior to market placement (Art 22.1).",
      },
      {
        order_no: 2,
        title:
          "The authorized representative is mandated to: verify the EU declaration of conformity and technical documentation have been drawn up, keep a copy of the EU declaration and technical documentation at the disposal of authorities for 10 years, provide authorities with all information and documentation necessary to demonstrate conformity, and cooperate with authorities on any action they take.",
        description:
          "Authorized representative's mandated tasks documented in the representation agreement (Art 22.2).",
      },
    ],
  },
  {
    order_no: 2,
    title:
      "Complete the applicable conformity assessment procedure before placing the system on the market or putting it into service.",
    description:
      "Conformity assessment procedure determination, execution, and re-execution on substantial modification (Art 43).",
    article: "Art. 43",
    subControls: [
      {
        order_no: 1,
        title:
          "We have determined whether the conformity assessment procedure is based on internal control (Annex VI) or involves assessment by a notified body (Annex VII), based on the specific high-risk classification.",
        description:
          "Conformity assessment route determination with justification (Annex VI vs VII).",
      },
      {
        order_no: 2,
        title:
          "Where the AI system is intended to be used for biometric categorization, emotion recognition, or any Annex III area requiring third-party assessment, we have engaged a notified body.",
        description:
          "Notified body engagement records for systems requiring third-party assessment.",
      },
      {
        order_no: 3,
        title:
          "We repeat the conformity assessment procedure whenever a substantial modification is made to the system.",
        description:
          "Substantial-modification trigger process that re-runs the applicable conformity assessment.",
      },
    ],
  },
  {
    order_no: 3,
    title:
      "Draw up a written or electronic EU declaration of conformity for each high-risk AI system and keep it at the disposal of authorities for 10 years.",
    description:
      "EU declaration of conformity contents and retention (Art 47, Annex V).",
    article: "Art. 47",
    subControls: [
      {
        order_no: 1,
        title:
          "The EU declaration of conformity contains: name and type of the AI system, name and address of the provider, a statement that the EU declaration of conformity is issued under the sole responsibility of the provider, reference to harmonized standards or common specifications used, reference to any notified body involved, and a dated signature (Annex V).",
        description:
          "Annex V-compliant declaration template in use; retention procedures cover the 10-year period.",
      },
    ],
  },
  {
    order_no: 4,
    title:
      "Affix the CE marking visibly, legibly, and indelibly to the high-risk AI system or its data plate/documentation.",
    description:
      "CE marking placement rules including documentation-only variants (Art 48).",
    article: "Art. 48",
    subControls: [
      {
        order_no: 1,
        title: "The CE marking is affixed before the system is placed on the market.",
        description:
          "Pre-market CE marking affixation procedure in the release workflow.",
      },
      {
        order_no: 2,
        title:
          "Where no physical product exists, the CE marking is included in the accompanying documentation.",
        description:
          "Documentation-based CE marking procedure for software-only systems.",
      },
      {
        order_no: 3,
        title:
          "The CE marking is subject to the general principles set out in Article 30 of Regulation (EC) No 765/2008.",
        description:
          "Compliance with Regulation (EC) No 765/2008 Art 30 general principles verified.",
      },
    ],
  },
];
