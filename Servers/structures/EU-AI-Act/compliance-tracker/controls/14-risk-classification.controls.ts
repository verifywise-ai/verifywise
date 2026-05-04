export const RiskClassification = [
  {
    order_no: 1,
    title:
      "Determine whether the AI system is a safety component of, or is itself, a product covered by EU harmonization legislation listed in Annex I.",
    description:
      "Annex I product-safety classification: assess and document whether the system is a safety component of, or a product covered by, Annex I legislation (Art 6.1).",
    article: "Art. 6(1)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have assessed whether the AI system falls under Annex I product safety legislation (machinery, toys, lifts, medical devices, vehicles, aviation, marine equipment, etc.).",
        description: "Annex I applicability assessment report per AI system.",
      },
      {
        order_no: 2,
        title:
          "If the system is a safety component or requires third-party conformity assessment under Annex I legislation, we have classified it as high-risk.",
        description:
          "Classification record referencing the applicable Annex I sectoral legislation and its conformity assessment path.",
      },
    ],
  },
  {
    order_no: 2,
    title: "Determine whether the AI system falls into a high-risk use case listed in Annex III.",
    description:
      "Annex III standalone high-risk classification across the eight listed areas, plus Art 6(3) derogation assessment (Art 6.2-3, Art 7).",
    article: "Art. 6(2)-(3), Art. 7",
    subControls: [
      {
        order_no: 1,
        title:
          "We have assessed the AI system against all eight Annex III areas: (1) biometrics, (2) critical infrastructure, (3) education and vocational training, (4) employment and worker management, (5) access to essential services, (6) law enforcement, (7) migration/asylum/border control, (8) administration of justice and democratic processes.",
        description:
          "Per-area assessment documenting whether each AI system maps to an Annex III use case.",
      },
      {
        order_no: 2,
        title:
          "We have documented the classification determination including the specific Annex III area and use case.",
        description:
          "Classification register with Annex III area, specific use case, and supporting rationale.",
      },
      {
        order_no: 3,
        title:
          "If the system performs a narrow procedural task, improves a previous human activity, detects decision patterns without replacing human assessment, or performs a preparatory task, we have assessed whether the Art 6(3) exception applies and documented the reasoning.",
        description:
          "Art 6(3) exception evaluation with explicit reasoning against each of the four exception criteria.",
      },
    ],
  },
];
