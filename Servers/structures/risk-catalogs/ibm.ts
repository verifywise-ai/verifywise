/**
 * GENERATED from Clients/src/presentation/assets/IBMAIRISKDB.json — do not edit by hand.
 *
 * Raw JSON import is not possible here: Servers/tsconfig.json has
 * resolveJsonModule disabled and the build only copies SQL/templates/locales
 * into dist, so the catalogs live as TS modules instead. Content is verbatim
 * from the source file; the only transformation is camelCase field names and
 * splitting "Risk Category" on ";" into a trimmed string array.
 */

import { RiskCatalogEntry } from "./types";

/** IBM AI Risk Atlas — 113 entries. */
export const IBM_RISK_CATALOG: RiskCatalogEntry[] = [
  {
    id: 1,
    summary: "Unexplainable and untraceable actions",
    description:
      "The agent may take actions that can't be traced back to a clear reasoning path. This makes troubleshooting, auditing and incident investigation difficult. It also reduces trust in the system.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk", "Compliance risk"],
  },
  {
    id: 2,
    summary: "Sharing IP or confidential information with the user",
    description:
      "The agent might surface proprietary data or personal information in natural-language outputs. Leaks often go unnoticed and create legal and reputational exposure. Even small slips can be irreversible.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Legal risk", "Reputational risk", "Cybersecurity risk"],
  },
  {
    id: 3,
    summary: "Sharing IP or confidential information with tools",
    description:
      "External tools or APIs may receive sensitive data unintentionally when the agent passes context outward. Once data enters third-party systems, control and visibility are lost.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Third-party or vendor risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Legal risk",
    ],
  },
  {
    id: 4,
    summary: "Discriminatory actions",
    description:
      "The agent may treat groups unfairly due to biased reasoning or skewed training patterns. This affects service quality, hiring decisions or customer treatment. It can cause serious compliance and reputation damage.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Human resources risk"],
  },
  {
    id: 5,
    summary: "Introduction of new data bias",
    description:
      "Agents can generate new biased content or reinforce skewed data patterns. These issues spread across downstream systems and create long-term fairness gaps.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk", "Compliance risk"],
  },
  {
    id: 6,
    summary: "Impact on human dignity",
    description:
      "Agents may interact in ways that feel disrespectful or dehumanizing. This undermines user trust and can conflict with internal ethical standards. In sensitive contexts it causes real harm.",
    riskSeverity: "Moderate",
    likelihood: "Unlikely",
    riskCategories: ["Reputational risk", "Compliance risk", "Human resources risk"],
  },
  {
    id: 7,
    summary: "Impact on human agency",
    description:
      "Highly autonomous agents can take over decisions that should remain under human control. This reduces oversight and can create overdependence on automated judgment.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Strategic risk", "Operational risk", "Compliance risk"],
  },
  {
    id: 8,
    summary: "Impact on jobs",
    description:
      "Agentic automation reshapes job roles and can displace certain tasks entirely. Teams may face uncertainty and morale issues as responsibilities shift.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Human resources risk", "Strategic risk"],
  },
  {
    id: 9,
    summary: "Environmental impact",
    description:
      "Agents may loop or execute unnecessary actions, increasing compute consumption. Over time this leads to higher energy use and larger cloud costs.",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Environmental risk", "Financial risk"],
  },
  {
    id: 10,
    summary: "Over-reliance or under-reliance on agents",
    description:
      "Some users trust the agent too much, others ignore it entirely. Both extremes undermine safety and effectiveness and introduce avoidable errors.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk"],
  },
  {
    id: 11,
    summary: "Misaligned actions",
    description:
      "The agent may pursue goals that technically match the prompt but conflict with actual intentions. These errors lead to harmful or wasteful outcomes.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk", "Strategic risk"],
  },
  {
    id: 12,
    summary: "Attacks on external resources used by the agent",
    description:
      "Agents depend on external APIs, tools and services. If attackers compromise these components, the agent inherits the risk and may behave unpredictably.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Third-party or vendor risk", "Operational risk"],
  },
  {
    id: 13,
    summary: "Unauthorized use",
    description:
      "Without strong access controls, an agent can be triggered by someone who shouldn't have access. This results in unintended actions, data exposure or policy violations.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Compliance risk"],
  },
  {
    id: 14,
    summary: "Exploiting trust mismatch",
    description:
      "Users often assume the agent is more reliable or capable than it actually is. This misplaced trust can be exploited or lead to poor decisions.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Reputational risk", "Operational risk", "Human resources risk"],
  },
  {
    id: 15,
    summary: "Function-calling hallucination",
    description:
      "The agent may trigger tool calls based on incorrect assumptions or invented context. These hallucinated actions can modify systems or data in dangerous ways.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Technological risk", "Operational risk", "Cybersecurity risk"],
  },
  {
    id: 16,
    summary: "Redundant actions",
    description:
      "Agents may repeat tasks or run unnecessary steps because of misinterpreted state or looping behavior. This wastes compute resources and slows workflows.",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Environmental risk", "Financial risk"],
  },
  {
    id: 17,
    summary: "Incomplete agent evaluation",
    description:
      "Many agent capabilities aren't covered in standard testing. This creates blind spots where failures emerge only in real-world conditions.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 18,
    summary: "Mitigation and maintenance challenges",
    description:
      "Agent behavior changes as tools, environments or models evolve. Maintaining safe behavior requires constant monitoring and policy updates over time.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Strategic risk", "Compliance risk"],
  },
  {
    id: 19,
    summary: "Lack of agent transparency",
    description:
      "The agent's internal reasoning and state transitions are hard to inspect. This makes it difficult to audit decisions and understand harmful outcomes.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 20,
    summary: "Reproducibility issues",
    description:
      "Agent behavior can differ between runs due to randomness, tool timing or environmental differences. This complicates debugging, evaluation and incident analysis.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Technological risk", "Operational risk"],
  },
  {
    id: 21,
    summary: "Accountability of agent actions",
    description:
      "When an agent acts autonomously, it becomes unclear who is responsible for outcomes. This creates governance complexity and can lead to regulatory problems.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 22,
    summary: "Compliance difficulties",
    description:
      "Autonomous actions may unintentionally violate rules, contracts or regulatory requirements. Ensuring continuous compliance becomes harder as agents evolve.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 23,
    summary: "Unrepresentative training distribution",
    description:
      "The dataset doesn't accurately reflect real-world scenarios or user populations. This causes uneven model performance and unreliable predictions in critical contexts.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk", "Compliance risk"],
  },
  {
    id: 24,
    summary: "Training data contamination",
    description:
      "The dataset contains irrelevant, corrupted or low-quality examples, which distort model learning. These impurities often lead to unstable or inconsistent model behavior.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Technological risk", "Operational risk"],
  },
  {
    id: 25,
    summary: "Model overfitting during training",
    description:
      "The model memorizes specific training examples instead of learning generalizable patterns. This results in degraded performance when encountering new or unseen data.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Technological risk", "Operational risk"],
  },
  {
    id: 26,
    summary: "Embedded dataset bias",
    description:
      "Harmful societal or historical biases are present in the training data and become encoded in the model. This leads to unfair outcomes, discrimination and compliance issues.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Human resources risk"],
  },
  {
    id: 27,
    summary: "Poor data curation practices",
    description:
      "Data is collected, filtered or prepared inconsistently, without quality controls or ethical oversight. These weaknesses undermine the reliability and fairness of the model.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Compliance risk"],
  },
  {
    id: 28,
    summary: "Risky or incorrect retraining",
    description:
      "When retraining processes are unmanaged, new data can introduce regressions or erase important learned behaviors. Models may degrade without clear warning.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 29,
    summary: "Malicious data poisoning",
    description:
      "Attackers or compromised pipelines may inject deceptive samples into the training dataset. This allows models to be manipulated into harmful or targeted behaviors.",
    riskSeverity: "Major",
    likelihood: "Unlikely",
    riskCategories: ["Cybersecurity risk", "Operational risk"],
  },
  {
    id: 30,
    summary: "Presence of personal data in training",
    description:
      "The dataset unintentionally includes personal or sensitive information. This creates regulatory exposure and ethical concerns if the model reproduces this content.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Legal risk", "Compliance risk"],
  },
  {
    id: 31,
    summary: "Reidentification through dataset content",
    description:
      "Even anonymized training data can sometimes be matched with external datasets to reveal identities. This undermines privacy protections and exposes organizations to scrutiny.",
    riskSeverity: "Major",
    likelihood: "Unlikely",
    riskCategories: ["Data privacy risk", "Compliance risk", "Legal risk"],
  },
  {
    id: 32,
    summary: "Misalignment with data privacy rights",
    description:
      "The collected data may not comply with user consent, regional data laws or deletion requests. These gaps can trigger legal disputes or force retraining from scratch.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Legal risk", "Compliance risk"],
  },
  {
    id: 33,
    summary: "Opaque training dataset",
    description:
      "Teams lack visibility into how the dataset was sourced, filtered or labeled. This opacity makes audits difficult and weakens trust in the model's foundations.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk"],
  },
  {
    id: 34,
    summary: "Unverified dataset provenance",
    description:
      "The origin, licensing or intended use of the data is unclear. This creates IP uncertainty and risks models being built on unauthorized or unethical sources.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk", "Third-party or vendor risk"],
  },
  {
    id: 35,
    summary: "Restrictions on data acquisition",
    description:
      "Regulations or contractual terms limit which datasets the organization can legally collect or purchase. Violating these rules exposes projects to penalties or forced shutdowns.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk"],
  },
  {
    id: 36,
    summary: "Restrictions on data usage",
    description:
      "Some data is licensed only for research or non-commercial use. Training models beyond those boundaries creates legal liabilities and reputational issues.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk"],
  },
  {
    id: 37,
    summary: "Restrictions on data transfer",
    description:
      "Cross-border data flows may violate regional laws or internal policies. These constraints impact cloud architecture, storage, and model training pipelines.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 38,
    summary: "Confidential material embedded in training data",
    description:
      "Internal documents, trade secrets or customer records may appear in datasets without authorization. Models trained on such data risk exposing sensitive information later.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Cybersecurity risk", "Legal risk"],
  },
  {
    id: 39,
    summary: "Insufficient rights to use training data",
    description:
      "The dataset may be protected by copyright or license terms that don't allow model training or redistribution. Using it improperly can lead to lawsuits and loss of trust.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk", "Strategic risk"],
  },
  {
    id: 40,
    summary: "Low inference accuracy",
    description:
      "The model may generate incorrect outputs when handling real-world data not seen during training. These mistakes can be subtle and hard to detect in complex workflows. In high-impact domains this becomes a reliability concern.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 41,
    summary: "Evasion-based inference attack",
    description:
      "Attackers craft inputs that intentionally mislead the model into producing wrong or unsafe outputs. These attacks often bypass normal guardrails and exploit model blind spots.",
    riskSeverity: "Major",
    likelihood: "Unlikely",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 42,
    summary: "Model extraction attempt",
    description:
      "An attacker sends repeated, carefully designed prompts to reverse-engineer parts of the model. Over time this leaks intellectual property and reduces competitive advantage.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 43,
    summary: "Jailbreaking the model",
    description:
      "Users attempt to bypass safety rules through adversarial prompting or instruction manipulation. Successful jailbreaks allow harmful output generation or restricted functionality.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Compliance risk", "Operational risk"],
  },
  {
    id: 44,
    summary: "IP exposure in prompts",
    description:
      "Users may include confidential designs, source code or proprietary knowledge directly in prompts. This information may be logged, cached or indirectly surfaced later.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 45,
    summary: "Sensitive data exposure in prompts",
    description:
      "Prompts may contain personal information or confidential business details. If mishandled, this data can leak into analytics logs or reappear in outputs.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Legal risk", "Compliance risk"],
  },
  {
    id: 46,
    summary: "Prompt injection attack",
    description:
      "A malicious actor embeds hidden instructions in input text, documents or URLs. The model follows these hidden commands, overriding intended behavior.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk"],
  },
  {
    id: 47,
    summary: "Prompt leaking through responses",
    description:
      "The model may reveal parts of its own system prompt, chain-of-thought hints or prior interactions. These disclosures weaken security and reveal internal logic.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk"],
  },
  {
    id: 48,
    summary: "Prompt priming manipulation",
    description:
      "Attackers manipulate earlier conversation context to influence how the model interprets later prompts. This leads to biased or harmful outcomes without clear visibility.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk"],
  },
  {
    id: 49,
    summary: "Context overload attack",
    description:
      "The attacker floods the context window with long or noisy text, pushing out relevant safety instructions or system messages. This degrades reliability and control.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 50,
    summary: "Direct instruction override",
    description:
      "Simple but forceful instructions are crafted to convince the model to ignore its guardrails. These attacks exploit limitations in safety alignment.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk"],
  },
  {
    id: 51,
    summary: "Encoded malicious inputs",
    description:
      "Attackers embed harmful instructions inside encoded or obfuscated sequences (base64, unicode tricks, special tokens). Models may decode and execute them unintentionally.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 52,
    summary: "Indirect-objective manipulation",
    description:
      "Attackers instruct the model through indirect cues, such as asking it to emulate another agent or persona. These pathways often bypass standard safeguards.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk"],
  },
  {
    id: 53,
    summary: "Social-engineering prompt attack",
    description:
      "Attackers craft emotionally manipulative or authoritative prompts to trick the model into harmful behavior. These prompts exploit trust and politeness patterns in the model.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Human resources risk", "Operational risk"],
  },
  {
    id: 54,
    summary: "Special-token exploits",
    description:
      "Models may respond unpredictably to rare or reserved tokens that behave differently from normal text. Attackers exploit these quirks to destabilize the system.",
    riskSeverity: "Moderate",
    likelihood: "Unlikely",
    riskCategories: ["Technological risk", "Cybersecurity risk"],
  },
  {
    id: 55,
    summary: "Attribute inference attempt",
    description:
      "Attackers analyze outputs to infer hidden attributes about the training data or demographics. This can reveal sensitive patterns or violate privacy expectations.",
    riskSeverity: "Major",
    likelihood: "Unlikely",
    riskCategories: ["Data privacy risk", "Compliance risk"],
  },
  {
    id: 56,
    summary: "Membership inference attempt",
    description:
      "Attackers try to determine whether specific individuals or records were used during training. Success exposes privacy gaps and weakens legal defensibility.",
    riskSeverity: "Major",
    likelihood: "Unlikely",
    riskCategories: ["Data privacy risk", "Legal risk", "Compliance risk"],
  },
  {
    id: 57,
    summary: "Biased decision outputs",
    description:
      "The model may generate outputs that consistently favor or disadvantage certain groups. These biased patterns appear in scoring, recommendations or evaluations and can be difficult to detect. Organizations risk compliance violations and reputational harm.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Human resources risk"],
  },
  {
    id: 58,
    summary: "Skewed content generation",
    description:
      "Outputs may reflect subtle biases from training data, producing unbalanced summaries, suggestions or narratives. These distortions influence real decisions and user perceptions.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk"],
  },
  {
    id: 59,
    summary: "Harmful advisory output",
    description:
      "The model may propose unsafe actions, incorrect instructions or dangerous recommendations. Users might act on them without verifying accuracy. This risk grows in domains like healthcare or finance.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Legal risk", "Safety risk"],
  },
  {
    id: 60,
    summary: "Unsafe code generation",
    description:
      "When generating code, the model may introduce security vulnerabilities or flawed logic. Developers may trust the output too readily, leading to exploitable systems.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Technological risk", "Operational risk"],
  },
  {
    id: 61,
    summary: "Toxic or offensive output",
    description:
      "The model may generate language that is insulting, harmful or inappropriate. Even rare incidents damage trust and can have regulatory implications.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Reputational risk", "Compliance risk"],
  },
  {
    id: 62,
    summary: "Incomplete or misleading advice",
    description:
      "The model may provide partially correct answers that omit critical details. These subtle gaps can mislead users more than outright errors.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Safety risk"],
  },
  {
    id: 63,
    summary: "Overtrust in generated outputs",
    description:
      "Users may rely heavily on AI-generated responses without validating them. This leads to poor decision-making, especially in high-stakes environments.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Strategic risk"],
  },
  {
    id: 64,
    summary: "Harmful use of generated output",
    description:
      "End users may deliberately weaponize the model's output (e.g., for fraud, manipulation or cyberattacks). The model becomes an indirect enabler of harmful activity.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Legal risk"],
  },
  {
    id: 65,
    summary: "Disinformation generation",
    description:
      "The model can produce highly realistic but false content that spreads quickly. This can influence public opinion or damage institutional credibility.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Reputational risk", "Legal risk", "Societal risk"],
  },
  {
    id: 66,
    summary: "Nonconsensual content generation",
    description:
      "The model may be used to generate content involving individuals without their consent, including impersonation. This creates ethical and privacy violations.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Data privacy risk", "Reputational risk"],
  },
  {
    id: 67,
    summary: "Propagation of toxic content",
    description:
      "The model may repeat or amplify harmful language it has been exposed to. These outputs negatively affect communities and user wellbeing.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Reputational risk", "Compliance risk"],
  },
  {
    id: 68,
    summary: "Improper contextual usage",
    description:
      "Outputs may be applied outside their intended purpose, leading to misuse. Even harmless-looking responses cause harm when placed into the wrong business flow.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Compliance risk"],
  },
  {
    id: 69,
    summary: "Lack of user disclosure",
    description:
      "When the output does not clarify that it is AI-generated, users may interpret it as authoritative or human-written. This transparency gap misleads stakeholders.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Reputational risk"],
  },
  {
    id: 70,
    summary: "Hallucinatory incorrect output",
    description:
      "The model may confidently generate content that is entirely fabricated. These hallucinations often appear plausible, increasing the risk of being taken as truth.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Safety risk", "Reputational risk"],
  },
  {
    id: 71,
    summary: "Exposure of private information through output",
    description:
      "The model might unintentionally output private data learned from training or previous interactions. This creates legal exposure and privacy violations.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Legal risk", "Compliance risk"],
  },
  {
    id: 72,
    summary: "Copyright-sensitive content generation",
    description:
      "Outputs may resemble or replicate copyrighted material. This introduces intellectual property disputes and business risk.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk", "Reputational risk"],
  },
  {
    id: 73,
    summary: "Disclosure of confidential information",
    description:
      "The model can unknowingly reproduce internal documents, secrets or proprietary designs. These exposures are difficult to detect and mitigate post-incident.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Legal risk"],
  },
  {
    id: 74,
    summary: "Opaque reasoning in output",
    description:
      "The model produces conclusions without explaining how it arrived at them. This reduces reliability and complicates human validation.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Compliance risk"],
  },
  {
    id: 75,
    summary: "Unreliable source attribution",
    description:
      "When asked for citations, the model may fabricate sources or misattribute information. This damages credibility and can mislead users who rely on accuracy.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk"],
  },
  {
    id: 76,
    summary: "Untraceable output origins",
    description:
      "It becomes unclear whether an output was generated from training data, retrieved material or internal heuristics. This ambiguity obstructs audits and legal review.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk"],
  },
  {
    id: 77,
    summary: "Inaccessible training-source context",
    description:
      "Users and auditors cannot determine the training datasets behind specific outputs. This makes it difficult to assess fairness, privacy exposure or legal compliance.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 78,
    summary: "Insufficient data transparency",
    description:
      "Teams may not clearly understand how data was sourced, processed or validated before being used in an AI system. This lack of clarity complicates audits and weakens trust. It often leads to compliance gaps.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk"],
  },
  {
    id: 79,
    summary: "Lack of model transparency",
    description:
      "The internal workings of the model remain unclear to developers, auditors or stakeholders. This makes it difficult to explain decisions or diagnose harmful outcomes. Transparency gaps often escalate oversight issues.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 80,
    summary: "Opaque system-level behavior",
    description:
      "Even if individual components are documented, the full system behavior becomes unpredictable when interactions scale. Organizations struggle to map cause and effect across the pipeline.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk"],
  },
  {
    id: 81,
    summary: "Insufficient domain expertise",
    description:
      "Teams building or deploying models may lack deep knowledge of the domain where the AI is applied. This leads to misinterpretation of outputs, weak oversight and flawed decision-making.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Human resources risk", "Operational risk"],
  },
  {
    id: 82,
    summary: "Poor use-case definition",
    description:
      "AI systems may be deployed into workflows without clearly defining scope, boundaries or intended outcomes. Ambiguous goals increase the risk of misuse or misalignment.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Strategic risk", "Operational risk"],
  },
  {
    id: 83,
    summary: "Unrepresentative risk testing",
    description:
      "Testing may focus on narrow scenarios and fail to simulate real-world conditions. Blind spots emerge, especially in edge cases or diverse population segments.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk"],
  },
  {
    id: 84,
    summary: "Incorrect or shallow risk testing",
    description:
      "Tests may be rushed, incomplete or misaligned with actual deployment conditions. This produces a false sense of confidence and allows major issues to escape detection.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Compliance risk"],
  },
  {
    id: 85,
    summary: "Lack of diversity in test coverage",
    description:
      "Testing may omit demographic groups, environmental conditions or linguistic variations. AI performance then becomes uneven across users and contexts.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Reputational risk"],
  },
  {
    id: 86,
    summary: "Temporal drift in performance",
    description:
      "AI systems degrade over time because real-world data shifts, user behavior changes or context evolves. Without continuous monitoring, the system becomes less accurate and less safe.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Strategic risk"],
  },
  {
    id: 87,
    summary: "Model usage rights uncertainty",
    description:
      "Teams may be unsure whether they legally have the rights to use a model for certain purposes. These uncertainties create legal exposure and can halt deployments abruptly.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk"],
  },
  {
    id: 88,
    summary: "Ambiguous legal accountability",
    description:
      "It may be unclear who is legally responsible for an AI-driven decision or outcome. This creates conflicts between teams, vendors and regulators, especially during incidents.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk", "Strategic risk"],
  },
  {
    id: 89,
    summary: "Unclear ownership of generated content",
    description:
      "AI-generated outputs may not have a clear owner under current IP frameworks. This ambiguity complicates commercial use and contract obligations.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Strategic risk"],
  },
  {
    id: 90,
    summary: "Environmental impact of AI operations",
    description:
      "Large-scale model training and inference consume significant energy. Without monitoring, organizations may exceed sustainability targets or face public criticism.",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Environmental risk", "Reputational risk"],
  },
  {
    id: 91,
    summary: "Negative impact on affected communities",
    description:
      "AI systems may reinforce stereotypes, misrepresent groups or cause real-world harm in marginalized communities. These harms often surface slowly and are difficult to reverse.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Reputational risk", "Compliance risk", "Societal risk"],
  },
  {
    id: 92,
    summary: "Human exploitation through automation",
    description:
      "AI-driven workflows may pressure workers, accelerate productivity expectations or automate oversight unfairly. These issues create workplace inequality and ethical concerns.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Human resources risk", "Reputational risk"],
  },
  {
    id: 93,
    summary: "Workforce disruption and job displacement",
    description:
      "AI adoption can restructure teams and eliminate roles unexpectedly. Poor communication and planning amplify morale loss and resistance to adoption.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Human resources risk", "Strategic risk"],
  },
  {
    id: 94,
    summary: "Reduced human agency in oversight processes",
    description:
      "As AI automates decision-making, human reviewers may be sidelined or feel unable to intervene. This weakens governance and accountability mechanisms.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Strategic risk", "Compliance risk", "Operational risk"],
  },
  {
    id: 95,
    summary: "Cultural homogenization via AI systems",
    description:
      "AI-driven outputs may standardize communication, creativity and expression in ways that suppress cultural diversity. This subtly shapes user behavior over time.",
    riskSeverity: "Moderate",
    likelihood: "Unlikely",
    riskCategories: ["Societal risk", "Reputational risk"],
  },
  {
    id: 96,
    summary: "Academic integrity risks",
    description:
      "Students or researchers may misuse AI to bypass learning, write assignments or generate research. This erodes educational trust and assessment integrity.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Educational risk", "Reputational risk"],
  },
  {
    id: 97,
    summary: "AI-enabled plagiarism",
    description:
      "AI can generate content that is too similar to copyrighted or academic sources. Users may unknowingly commit plagiarism, triggering disciplinary or legal consequences.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Educational risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 98,
    summary: "Exclusion of certain user groups",
    description:
      "AI systems may work poorly for users with specific accents, disabilities, languages or cultural backgrounds. This exclusion reduces accessibility and harms user experience.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Societal risk", "Reputational risk"],
  },
  {
    id: 99,
    summary: "Realistic but incorrect content generation",
    description:
      "Generative models can produce text that looks polished and authoritative but is factually wrong. These errors are more likely to be believed because of the natural writing style. This increases misinformation risks and misinformed decision-making.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Safety risk"],
  },
  {
    id: 100,
    summary: "Highly plausible hallucinations",
    description:
      "Hallucinations in generative models often appear coherent and detailed, making them harder to detect. Users may adopt them as truth, causing cascading errors in workflows. This is especially dangerous in compliance-heavy domains.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Compliance risk", "Reputational risk"],
  },
  {
    id: 101,
    summary: "Synthetic content abuse at scale",
    description:
      "Generative AI enables rapid creation of harmful media such as phishing emails, impersonations or fraud campaigns. Attackers gain efficiency and sophistication with minimal effort.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Societal risk", "Legal risk"],
  },
  {
    id: 102,
    summary: "Manipulative or persuasive output",
    description:
      "Generative models can craft emotionally engaging or persuasive content that influences behavior. This raises risks of manipulation in politics, finance or consumer decisions.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Societal risk", "Reputational risk", "Legal risk"],
  },
  {
    id: 103,
    summary: "Deepfake-style synthetic media generation",
    description:
      "Models capable of generating images, video or audio can be misused to create realistic fabrications. These outputs can damage reputations, enable fraud or undermine trust.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 104,
    summary: "Unintentional disclosure of sensitive training patterns",
    description:
      "Generative models may reproduce phrases, structures or snippets that resemble sensitive training data. This happens even without explicit memorization and creates privacy/legal risk.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Legal risk", "Compliance risk"],
  },
  {
    id: 105,
    summary: "Amplified copyright exposure",
    description:
      "Generated text or media may resemble copyrighted works, even when not an exact match. Organizations face IP risks when outputs are used commercially.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Legal risk", "Compliance risk"],
  },
  {
    id: 106,
    summary: "Propagating biased generative patterns",
    description:
      "Generative models may amplify biases through storytelling, examples or structural patterns. These subtle biases spread through downstream content or decisions.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Reputational risk", "Societal risk"],
  },
  {
    id: 107,
    summary: "Unsafe reasoning chains",
    description:
      "Generative models sometimes produce step-by-step reasoning that seems rational but contains flaws or unsafe assumptions. These errors mislead users and weaken safety.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Safety risk", "Operational risk"],
  },
  {
    id: 108,
    summary: "Self-reinforcing generative drift",
    description:
      "When generative outputs are fed back into systems as new data, the model begins amplifying its own artifacts and distortions. This causes long-term degradation of quality and fairness.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Technological risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 109,
    summary: "Generative scaling misuse",
    description:
      "The ability to mass-produce text, audio or visuals at near-zero cost enables large-scale campaigns — both beneficial and harmful. Without controls, this increases societal and regulatory concerns.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Societal risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 110,
    summary: "Contextual overfitting in generation",
    description:
      "Generative models sometimes overfit to the local context, producing outputs that reflect prompt bias rather than objective reasoning. This leads to skewed or misleading content.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 111,
    summary: "Overpersonalized or invasive generation",
    description:
      "Models can produce content that feels too personalized based on small user inputs, making users feel surveilled or profiled. This harms trust and creates privacy tension.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Reputational risk"],
  },
  {
    id: 112,
    summary: "Loss of human creativity diversity",
    description:
      "Overuse of generative tools can lead to homogenized writing style, visuals or expression. Organizations may slowly lose creative originality in marketing, design or communication.",
    riskSeverity: "Moderate",
    likelihood: "Unlikely",
    riskCategories: ["Strategic risk", "Reputational risk", "Societal risk"],
  },
  {
    id: 113,
    summary: "Misleading confidence in AI authority",
    description:
      "Generative AI tends to sound polished and confident, even when wrong. This stylistic authority encourages users to overtrust the system beyond safe limits.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Strategic risk"],
  },
];
