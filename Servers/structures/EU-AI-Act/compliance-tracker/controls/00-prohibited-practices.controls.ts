export const ProhibitedPractices = [
  {
    order_no: 1,
    title:
      "The organization does not deploy AI systems that use subliminal techniques beyond a person's consciousness to materially distort behavior, causing or likely to cause physical or psychological harm.",
    description:
      "Prohibits deployment of AI using subliminal or manipulative techniques below conscious awareness that materially distort behavior and are likely to cause harm (Art 5.1.a).",
    article: "Art. 5(1)(a)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have reviewed all AI systems for subliminal or manipulative techniques that operate below conscious awareness.",
        description:
          "Documented review of all deployed and planned AI systems against subliminal manipulation criteria.",
      },
      {
        order_no: 2,
        title:
          "We have documented the assessment confirming no AI system uses techniques intended to materially distort a person's behavior in a manner likely to cause harm.",
        description:
          "Written attestation of non-applicability or, where applicable, documented removal or redesign of such techniques.",
      },
    ],
  },
  {
    order_no: 2,
    title:
      "The organization does not deploy AI systems that exploit vulnerabilities of specific groups due to age, disability, or social or economic situation to materially distort behavior, causing or likely to cause harm.",
    description:
      "Prohibits AI that exploits vulnerabilities of specific groups (age, disability, socio-economic situation) in a way that materially distorts behavior and is likely to cause harm (Art 5.1.b).",
    article: "Art. 5(1)(b)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have assessed whether any AI system specifically targets or disproportionately affects vulnerable groups (children, elderly, persons with disabilities, economically disadvantaged persons).",
        description:
          "Vulnerability impact assessment records for each AI system in scope.",
      },
      {
        order_no: 2,
        title:
          "We have documented safeguards preventing AI systems from exploiting group-specific vulnerabilities.",
        description:
          "Design controls, usage restrictions, and monitoring processes documented for vulnerability mitigation.",
      },
    ],
  },
  {
    order_no: 3,
    title:
      "The organization does not use AI systems for social scoring — evaluating or classifying natural persons based on social behavior or personal characteristics, leading to detrimental or unfavorable treatment unrelated to the context of data collection.",
    description:
      "Prohibits use of AI for social scoring that produces detrimental treatment unrelated to the context of data collection (Art 5.1.c).",
    article: "Art. 5(1)(c)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have confirmed no AI system assigns scores or classifications to individuals based on social behavior or inferred personal traits for purposes unrelated to the original data collection context.",
        description:
          "Inventory of scoring/classification systems with context-of-use mapping.",
      },
      {
        order_no: 2,
        title:
          "We have reviewed all scoring, ranking, or classification systems to ensure none constitute general-purpose social scoring.",
        description:
          "Scoring-system review reports documenting purpose, data sources, and decision impacts.",
      },
    ],
  },
  {
    order_no: 4,
    title:
      "The organization does not use real-time remote biometric identification systems in publicly accessible spaces for law enforcement purposes, except under the narrow exceptions permitted by the regulation.",
    description:
      "Prohibits use of real-time remote biometric identification in publicly accessible spaces for law enforcement purposes, outside the narrow Art 5.1.d exceptions.",
    article: "Art. 5(1)(d)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have confirmed no real-time remote biometric identification system is deployed in publicly accessible spaces.",
        description:
          "System inventory and deployment-context assessment records.",
      },
      {
        order_no: 2,
        title:
          "If any exception applies (targeted search for victims, prevention of imminent threat, locating suspects of serious crime), we have documented the specific legal basis, prior judicial authorization, and necessity assessment.",
        description:
          "Legal basis memorandum, judicial authorization records, and necessity/proportionality assessment per use.",
      },
    ],
  },
  {
    order_no: 5,
    title:
      "The organization does not use AI systems for emotion recognition in workplace or educational settings, except for medical or safety purposes.",
    description:
      "Prohibits emotion recognition systems in workplace and educational settings except for medical or safety purposes (Art 5.1.e).",
    article: "Art. 5(1)(e)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have confirmed no AI system infers emotions of employees, job candidates, or students based on biometric data.",
        description:
          "HR/EdTech system inventory and emotion-inference capability assessment.",
      },
      {
        order_no: 2,
        title:
          "If emotion recognition is used for medical or safety reasons, we have documented the specific justification and obtained any required consent.",
        description:
          "Medical/safety justification records and consent management artifacts.",
      },
    ],
  },
  {
    order_no: 6,
    title:
      "The organization does not use AI systems for biometric categorization that individually categorize natural persons to deduce or infer race, political opinions, trade union membership, religious or philosophical beliefs, sex life, or sexual orientation.",
    description:
      "Prohibits biometric categorization AI systems that infer sensitive personal attributes (Art 5.1.f).",
    article: "Art. 5(1)(f)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have confirmed no AI system uses biometric data (facial images, fingerprints, voice, gait) to infer sensitive personal attributes.",
        description:
          "Biometric system inventory, data-flow analysis, and inference-target review.",
      },
      {
        order_no: 2,
        title:
          "We have reviewed all biometric processing systems and documented that none classify individuals by protected characteristics.",
        description:
          "Classification target review report and documented controls.",
      },
    ],
  },
  {
    order_no: 7,
    title:
      "The organization does not create or expand facial recognition databases through untargeted scraping of facial images from the internet or CCTV footage.",
    description:
      "Prohibits creating/expanding facial recognition databases through untargeted scraping of internet or CCTV images (Art 5.1.g).",
    article: "Art. 5(1)(g)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have confirmed no AI system collects facial images from public internet sources or surveillance cameras for building facial recognition databases.",
        description:
          "Data-sourcing review for facial recognition datasets.",
      },
      {
        order_no: 2,
        title:
          "Any facial recognition system in use relies only on lawfully obtained, purpose-specific image datasets.",
        description:
          "Data provenance records and data processing agreements for facial recognition datasets.",
      },
    ],
  },
  {
    order_no: 8,
    title:
      "The organization does not use AI systems to make individual risk assessments of natural persons for predicting criminal offenses based solely on profiling or personality traits.",
    description:
      "Prohibits AI that predicts criminal offenses of natural persons based solely on profiling or personality traits (Art 5.1.h).",
    article: "Art. 5(1)(h)",
    subControls: [
      {
        order_no: 1,
        title:
          "We have confirmed no AI system predicts the likelihood of a natural person committing a criminal offense based solely on profiling, prior offending, or personality assessment.",
        description:
          "Predictive policing / risk-scoring system inventory and logic review.",
      },
      {
        order_no: 2,
        title:
          "Any crime-related AI system supplements, rather than replaces, human assessment and is based on objective, verifiable facts directly linked to criminal activity.",
        description:
          "Human-in-the-loop design documentation and evidence basis for crime-related AI outputs.",
      },
    ],
  },
];
