export const ProviderDocumentation = [
  {
    order_no: 1,
    title:
      "Establish, implement, document, and maintain a continuous iterative risk management system throughout the entire lifecycle of the high-risk AI system.",
    description:
      "Risk management system across the entire AI lifecycle covering identification, analysis, treatment, and residual-risk evaluation (Art 9).",
    article: "Art. 9",
    subControls: [
      {
        order_no: 1,
        title:
          "We have established a risk management system that identifies and analyzes known and reasonably foreseeable risks to health, safety, or fundamental rights.",
        description:
          "Risk register covering health, safety, and fundamental rights impacts with analysis records (Art 9.2.a).",
      },
      {
        order_no: 2,
        title:
          "We estimate and evaluate the risks that may emerge when the system is used in accordance with its intended purpose and under conditions of reasonably foreseeable misuse.",
        description:
          "Risk evaluation covering intended-use and foreseeable-misuse scenarios (Art 9.2.b).",
      },
      {
        order_no: 3,
        title:
          "We evaluate risks arising from analysis of data gathered from the post-market monitoring system.",
        description:
          "Feedback loop from Art 72 post-market monitoring into the Art 9 risk system (Art 9.2.c).",
      },
      {
        order_no: 4,
        title:
          "We adopt risk management measures that consist of elimination or reduction of risks through adequate design and development, and where appropriate, implementation of adequate mitigation and control measures.",
        description:
          "Design-based risk controls and complementary mitigation/control measures documented per risk (Art 9.4).",
      },
      {
        order_no: 5,
        title:
          "Testing procedures are suitable to identify the most appropriate and targeted risk management measures.",
        description:
          "Testing procedures are designed to evaluate risk-control effectiveness (Art 9.5).",
      },
      {
        order_no: 6,
        title:
          "We test the high-risk AI system against preliminarily defined metrics and probabilistic thresholds appropriate to the intended purpose.",
        description:
          "Pre-defined metrics and probabilistic acceptance thresholds used for system testing (Art 9.6).",
      },
      {
        order_no: 7,
        title:
          "Residual risks associated with each hazard and the overall residual risk are judged to be acceptable.",
        description:
          "Residual risk acceptance records signed off by the risk owner (Art 9.7).",
      },
    ],
  },
  {
    order_no: 2,
    title:
      "Ensure training, validation, and testing datasets meet quality criteria and are subject to appropriate data governance practices.",
    description:
      "Data governance covering design choices, collection, preparation, representativeness, bias detection, and special-category data handling (Art 10).",
    article: "Art. 10",
    subControls: [
      {
        order_no: 1,
        title:
          "We have documented data governance practices covering design choices, data collection processes, data preparation operations, assumptions, prior assessments of data availability and suitability, examination for possible biases, and identification of relevant data gaps or shortcomings.",
        description:
          "Data governance records covering each element of Art 10.2 for training, validation, and testing datasets.",
      },
      {
        order_no: 2,
        title:
          "Training, validation, and testing datasets are relevant, sufficiently representative, and as free of errors and as complete as possible in view of the intended purpose.",
        description:
          "Dataset quality attestations covering relevance, representativeness, error rate, and completeness (Art 10.3).",
      },
      {
        order_no: 3,
        title:
          "Datasets take into account the specific geographical, contextual, behavioral, or functional setting within which the high-risk AI system is intended to be used.",
        description:
          "Context-of-use documentation describing geographical, contextual, behavioral, and functional coverage of datasets (Art 10.4).",
      },
      {
        order_no: 4,
        title:
          "Where strictly necessary for bias detection and correction, the provider may process special categories of personal data subject to appropriate safeguards for fundamental rights.",
        description:
          "Safeguards and legal basis for any processing of special categories of personal data for bias detection/correction (Art 10.5).",
      },
    ],
  },
  {
    order_no: 3,
    title:
      "Draw up technical documentation before placing on market or putting into service, and keep it up to date.",
    description:
      "Annex IV technical documentation covering system description, lifecycle changes, risk management, standards applied, and EU declaration of conformity (Art 11).",
    article: "Art. 11",
    subControls: [
      {
        order_no: 1,
        title:
          "We have drawn up technical documentation demonstrating compliance with requirements in Chapter III Section 2, and providing authorities and notified bodies with all necessary information to assess compliance.",
        description:
          "Chapter III Section 2 compliance evidence maintained for authority/notified-body review (Art 11.1).",
      },
      {
        order_no: 2,
        title:
          "Technical documentation includes: general description, detailed description of elements and development process, information about monitoring/functioning/control, description of the risk management system, description of relevant changes made through the system's lifecycle, list of harmonized standards applied, and a copy of the EU declaration of conformity (Annex IV).",
        description:
          "Annex IV-aligned technical documentation covering all required sections.",
      },
    ],
  },
  {
    order_no: 4,
    title:
      "Design high-risk AI systems with logging capabilities enabling the recording of events relevant for identifying risk and facilitating post-market monitoring.",
    description:
      "Automatic logging of relevant events across the system lifecycle (Art 12).",
    article: "Art. 12",
    subControls: [
      {
        order_no: 1,
        title:
          "The logging capabilities enable recording of the period of each use, the reference database against which input data has been checked, input data for which the search has led to a match, and the identification of natural persons involved in the verification of results.",
        description:
          "Log schema captures usage periods, reference databases, matched inputs, and verifier identities where applicable (Art 12.2).",
      },
      {
        order_no: 2,
        title:
          "Logging is proportionate to the intended purpose and the applicable legal obligations under Union or national law.",
        description:
          "Logging configuration and retention documented with proportionality rationale (Art 12.3).",
      },
    ],
  },
  {
    order_no: 5,
    title:
      "Design high-risk AI systems to achieve an appropriate level of accuracy, robustness, and cybersecurity and to perform consistently in those respects throughout their lifecycle.",
    description:
      "Accuracy, robustness, and cybersecurity requirements and AI-specific vulnerability controls (Art 15).",
    article: "Art. 15",
    subControls: [
      {
        order_no: 1,
        title:
          "Levels of accuracy and the relevant accuracy metrics are declared in the instructions for use.",
        description:
          "Accuracy levels and metrics declared in end-user instructions (Art 15.2).",
      },
      {
        order_no: 2,
        title:
          "The system is designed to be resilient regarding errors, faults, or inconsistencies in the environment, and is robust with regard to unauthorized third-party attempts to alter its use, outputs, or performance.",
        description:
          "Resilience and robustness controls against environmental errors and unauthorized alteration (Art 15.4).",
      },
      {
        order_no: 3,
        title:
          "Technical solutions to address AI-specific vulnerabilities include measures to prevent, detect, respond to, resolve, and control for data poisoning attacks, model poisoning, adversarial examples or model evasion, confidentiality attacks, or model flaws.",
        description:
          "AI-specific security controls for data/model poisoning, adversarial examples, confidentiality attacks, and model flaws (Art 15.5).",
      },
    ],
  },
  {
    order_no: 6,
    title:
      "Keep technical documentation and automatically generated logs available for the period required by law.",
    description:
      "Retention of technical documentation and automatic logs (Art 18-19).",
    article: "Art. 18-19",
    subControls: [
      {
        order_no: 1,
        title:
          "Technical documentation is kept at the disposal of national competent authorities for a period of 10 years after the system has been placed on the market or put into service.",
        description:
          "10-year retention and accessibility procedures for technical documentation (Art 18.1).",
      },
      {
        order_no: 2,
        title:
          "Automatically generated logs are kept for a period appropriate to the intended purpose of the high-risk AI system, of at least six months unless provided otherwise in applicable Union or national law.",
        description:
          "Log retention policy covering the Art 19 minimum and any sector-specific extensions.",
      },
    ],
  },
];
