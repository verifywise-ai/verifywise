export const GeneralPurposeAImodels = [
  {
    order_no: 1,
    title:
      "Classify general-purpose AI models and determine whether they pose systemic risk.",
    description:
      "Assess each GPAI model against the systemic-risk threshold and maintain classification documentation (Art 51).",
    article: "Art. 51",
    subControls: [
      {
        order_no: 1,
        title:
          "We have assessed whether any GPAI model meets the systemic risk threshold (cumulative compute >10^25 FLOPs, or Commission designation).",
        description:
          "Compute budget estimates, designation notifications, and threshold assessment records are retained per model.",
      },
      {
        order_no: 2,
        title:
          "We maintain documentation of the classification determination and update it when model capabilities or compute thresholds change.",
        description:
          "Versioned classification record with review triggers on capability upgrades or regulatory threshold changes.",
      },
    ],
  },
  {
    order_no: 2,
    title:
      "Maintain technical documentation and provide information to downstream AI system providers.",
    description:
      "Technical documentation and downstream transparency obligations for GPAI providers (Art 52.1.a-b).",
    article: "Art. 52(1)(a)-(b)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have drawn up and maintain technical documentation of the model including training process, testing, and evaluation results, per Annex XI.",
        description:
          "Annex XI-compliant technical documentation covering training, testing, and evaluation is maintained and kept current.",
      },
      {
        order_no: 2,
        title:
          "We provide downstream AI system providers with sufficient information and documentation to understand the model's capabilities and limitations and comply with their own obligations.",
        description:
          "Model cards, API documentation, and usage guidance are published for downstream providers with capability and limitation disclosures.",
      },
      {
        order_no: 3,
        title:
          "We maintain an up-to-date technical summary of the model's characteristics available to the AI Office upon request.",
        description:
          "Standing technical summary retained and updated on capability changes; available within required response timeframes.",
      },
    ],
  },
  {
    order_no: 3,
    title:
      "Establish a copyright compliance policy and publish a training content summary.",
    description:
      "Copyright compliance policy and publicly available training data summary (Art 52.1.c-d).",
    article: "Art. 52(1)(c)-(d)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have established and implemented a policy to comply with Union copyright law, including the text and data mining opt-out mechanism under Directive (EU) 2019/790.",
        description:
          "Documented copyright policy covering TDM opt-out honouring, takedown procedures, and attribution practices.",
      },
      {
        order_no: 2,
        title:
          "We have drawn up and made publicly available a sufficiently detailed summary of the content used for training the model, following the template provided by the AI Office.",
        description:
          "Published training-data summary aligned to AI Office template; accessibility and language coverage evidenced.",
      },
    ],
  },
  {
    order_no: 4,
    title:
      "Assess and mitigate systemic risks for models classified as posing systemic risk.",
    description:
      "Systemic-risk obligations for GPAI-with-systemic-risk providers: evaluation, risk assessment, incident reporting, cybersecurity (Art 53).",
    article: "Art. 53",
    subControls: [
      {
        order_no: 1,
        title:
          "We perform model evaluations including adversarial testing to identify and mitigate systemic risks.",
        description:
          "Documented evaluation methodology (red-teaming, adversarial probes) with periodic cadence.",
      },
      {
        order_no: 2,
        title:
          "We have assessed possible systemic risks, including their sources, that may stem from the development, placing on the market, or use of the model.",
        description:
          "Systemic risk register with sources, scenarios, and mitigation coverage.",
      },
      {
        order_no: 3,
        title:
          "We track, document, and report serious incidents and possible corrective measures to the AI Office and relevant national authorities without undue delay.",
        description:
          "Incident management process with reporting channels to the AI Office and NCAs, with retention of corrective-measure records.",
      },
      {
        order_no: 4,
        title:
          "We ensure an adequate level of cybersecurity protection for the model and its physical infrastructure.",
        description:
          "Cybersecurity controls covering weights protection, infrastructure hardening, and access governance.",
      },
    ],
  },
  {
    order_no: 5,
    title:
      "Appoint an EU authorized representative (if non-EU provider) and adhere to codes of practice.",
    description:
      "Authorized representative mandate and participation in codes of practice (Art 54-55).",
    article: "Art. 54-55",
    subControls: [
      {
        order_no: 1,
        title:
          "If established outside the Union, we have appointed an authorized representative established in the Union before making a GPAI model available on the Union market.",
        description:
          "Written mandate to EU representative covering compliance verification, documentation custody, and authority cooperation.",
      },
      {
        order_no: 2,
        title:
          "We participate in or adhere to codes of practice covering the obligations in Articles 52 and 53, or demonstrate equivalent alternative means of compliance.",
        description:
          "Evidence of code-of-practice participation or a documented equivalent-compliance plan.",
      },
    ],
  },
];
