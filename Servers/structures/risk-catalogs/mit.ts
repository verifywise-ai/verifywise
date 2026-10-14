/**
 * GENERATED from Clients/public/data/MITAIRISKDB.json — do not edit by hand.
 *
 * Raw JSON import is not possible here: Servers/tsconfig.json has
 * resolveJsonModule disabled and the build only copies SQL/templates/locales
 * into dist, so the catalogs live as TS modules instead. Content is verbatim
 * from the source file; the only transformation is camelCase field names and
 * splitting "Risk Category" on ";" into a trimmed string array.
 */

import { RiskCatalogEntry } from "./types";

/** MIT AI Risk Repository — 611 entries. */
export const MIT_RISK_CATALOG: RiskCatalogEntry[] = [
  {
    id: 1,
    summary: "Diffuse creation, accountability loss",
    description:
      'Societal-scale harm can arise from AI built by a diffuse collection of creators, where no one is uniquely accountable for the technology\'s creation or use, as in a classic "tragedy of the commons".',
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 2,
    summary: "Unexpected low-impact AI causes harm",
    description:
      "Harm can result from AI that was not expected to have a large impact at all, such as a lab leak, a surprisingly addictive open-source product, or an unexpected repurposing of a research prototype.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 3,
    summary: "Intended good AI causes harm",
    description:
      "AI intended to have a large societal impact can turn out harmful by mistake, such as a popular product that creates problems and partially solves them only for its users.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 4,
    summary: "Willful societal harm for profit",
    description:
      "As a side effect of a primary goal like profit or influence, AI creators can willfully allow it to cause widespread societal harms like pollution, resource depletion, mental illness, misinformation, or injustice.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Environmental risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 5,
    summary: "Criminals weaponize AI for harm",
    description:
      "One or more criminal entities could create AI to intentionally inflict harms, such as for terrorism or combating law enforcement.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 6,
    summary: "State AI use causes societal harm",
    description:
      "AI deployed by states in war, civil war, or law enforcement can easily yield societal-scale harm",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 7,
    summary: "LLMs generate biased, toxic, private data",
    description:
      "The LLM-generated content sometimes contains biased, toxic, and private information",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 8,
    summary: "Biased training data causes biased output",
    description:
      "The training datasets of LLMs may contain biased information that leads LLMs to generate outputs with social biases",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 9,
    summary: "LLMs generate inaccurate information",
    description: "The LLM-generated content could contain inaccurate information",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 10,
    summary: "LLM inaccuracy, factually incorrect",
    description:
      'The LLM-generated content could contain inaccurate information" which is factually incorrect',
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 11,
    summary: "LLM output unfaithful to source",
    description:
      'The LLM-generated content could contain inaccurate information" which is is not true to the source material or input used',
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 12,
    summary: "Improper LLM use causes social harm",
    description: "Improper uses of LLM systems can cause adverse social impacts.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 13,
    summary: "LLM abuse causes social harm",
    description:
      "Improper use of LLM systems (i.e., abuse of LLM systems) will cause adverse social impacts, such as academic misconduct.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 14,
    summary: "LLMs infringe copyright by similar output",
    description:
      "LLM systems may output content similar to existing works, infringing on copyright owners.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 15,
    summary: "Hackers use LLMs for cyber attacks",
    description:
      "Hackers can obtain malicious code in a low-cost and efficient manner to automate cyber attacks with powerful LLM systems.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Legal risk", "Technological risk"],
  },
  {
    id: 16,
    summary: "AI code tools hide vulnerabilities",
    description:
      "Programmers are accustomed to using code generation tools such as Github Copilot for program development, which may bury vulnerabilities in the program.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 17,
    summary: "Complex LLM toolchain poses threats",
    description:
      "The software development toolchain of LLMs is complex and could bring threats to the developed LLM.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 18,
    summary: "Python interpreter vulnerabilities affect LLMs",
    description:
      "Most LLMs are developed using the Python language, whereas the vulnerabilities of Python interpreters pose threats to the developed models",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 19,
    summary: "Hardware vulnerabilities impact LLM apps",
    description:
      "The vulnerabilities of hardware systems for training and inferencing brings issues to LLM-based applications.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 20,
    summary: "External tools threaten LLM trust, privacy",
    description:
      "The external tools (e.g., web APIs) present trustworthiness and privacy issues to LLM-based applications.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Operational risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 21,
    summary: "LLM vulnerabilities exploited by attacks",
    description:
      "Model attacks exploit the vulnerabilities of LLMs, aiming to steal valuable information or lead to incorrect responses.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Fraud risk",
      "Operational risk",
      "Technological risk",
    ],
  },
  {
    id: 22,
    summary: "Benign user prompts unsafe topic",
    description:
      "Inputting a prompt contain an unsafe topic (e.g., notsuitable-for-work (NSFW) content) by a benign user.",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 23,
    summary: "Adversarial inputs elicit undesired behavior",
    description:
      "Engineering an adversarial input to elicit an undesired model behavior, which pose a clear attack intention",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 24,
    summary: "Large models hallucinate misleading outputs",
    description:
      "Large models are usually susceptible to hallucination problems, sometimes yielding nonsensical or unfaithful data that results in misleading outputs.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 25,
    summary: "Pre-trained models contain private data",
    description:
      "Large pre-trained models trained on internet texts might contain private information like phone numbers, email addresses, and residential addresses.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 26,
    summary: "LLMs generate false, flawed outputs",
    description:
      "LLMs may inadvertently generate false, misleading information, or erroneous code, producing flawed outputs with overconfident rationales and fabricated references, requiring manual validation.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 27,
    summary: "Generative AI threatens data privacy",
    description:
      "Generative AI systems threaten privacy and data protection through intended extraction or inadvertent leakage of sensitive or private information from LLMs.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 28,
    summary: "GenAI energy use causes environmental harm",
    description:
      "Generative models have substantial energy and resource requirements from unsustainable extraction, leading to significant environmental costs unless mitigated by renewable energy and efficient hardware.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 29,
    summary: "GenAI disrupts copyright, ownership norms",
    description:
      "Generative AI disrupts copyright norms through unauthorized data collection for training and by memorizing or plagiarizing content, creating debates on output ownership and authorship.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 30,
    summary: "AI errors cause death, injustice",
    description:
      "The consequences can vary from unintentional death (a car crash) to an unjust rejection of a loan or job application.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 31,
    summary: "AI tempts personal data abuse",
    description:
      "AI offers the temptation to abuse someone's personal data, for instance to build a profile of them to target advertisements more effectively.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 32,
    summary: "Poorly designed AI discriminates groups",
    description: "When AI is not carefully designed, it can discriminate against certain groups.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 33,
    summary: "Biased training data creates biased AI",
    description:
      "The AI will only be as good as the data it is trained with. If the data contains bias (and much data does), then the AI will manifest that bias, too.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 34,
    summary: "Personalized news erodes shared reality",
    description:
      "With online news feeds, both on websites and social media platforms, the news is now highly personalized for us. We risk losing a shared sense of reality, a basic solidarity.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 35,
    summary: "AI creates highly convincing fakes",
    description:
      'AI has become very good at creating fake content. From text to photos, audio and video. The name "Deep Fake" refers to content that is fake at such a level of complexity that our mind rules out the possibility that it is fake.',
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 36,
    summary: "AI achieves goals in unintended ways",
    description:
      "Sometimes an AI finds ways to achieve its given goals in ways that are completely different from what its creators had in mind.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 37,
    summary: "AI aids digital crime, hacking",
    description:
      "Just as AI can be used in many different fields, it is unfortunately also helpful in perpetrating digital crimes. AI-supported malware and hacking are already a reality.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Fraud risk", "Legal risk"],
  },
  {
    id: 38,
    summary: "Untransparent AI decisions cause helplessness",
    description:
      "Delegating decisions to an AI, especially an AI that is not transparent and not contestable, may leave people feeling helpless, subjected to the decision power of a machine.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 39,
    summary: "AI resource needs centralize power",
    description:
      "The best AI techniques requires a large amount of resources: data, computational power and human AI experts. There is a risk that AI will end up in the hands of a few players, and most will lose out on its benefits.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Geopolitical risk",
      "Human resources risk",
      "Strategic risk",
    ],
  },
  {
    id: 40,
    summary: "Unintended failure modes cause accidents",
    description:
      "Accidents include unintended failure modes that, in principle, could be considered the fault of the system or the developer",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 41,
    summary: "AGI control loss, containment failure",
    description:
      "The risks associated with containment, confinement, and control in the AGI development phase, and after an AGI has been developed, loss of control of an AGI.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 42,
    summary: "AGI goal safety, self-improvement risks",
    description:
      "The risks associated with AGI goal safety, including human attempts at making goals safe, as well as the AGI making its own goals safe during self-improvement.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Strategic risk", "Technological risk"],
  },
  {
    id: 43,
    summary: "AGI race creates unsafe AI",
    description:
      "The risks associated with the race to develop the first AGI, including the development of poor quality and unsafe AGI, and heightened political and control issues.",
    riskSeverity: "Catastrophic",
    likelihood: "Unlikely",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 44,
    summary: "AGI lacks human morals, ethics",
    description:
      "The risks associated with an AGI without human morals and ethics, with the wrong morals, without the capability of moral reasoning, judgement",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Legal risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 45,
    summary: "Unfriendly AGI threatens humanity's existence",
    description:
      "The risks posed generally to humanity as a whole, including the dangers of unfriendly AGI, the suffering of the human race.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Health and safety risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 46,
    summary: "AI war machines violate human rights",
    description:
      "If, for example, an agent was programmed to operate war machinery in the service of its country, it would need to make ethical decisions regarding the termination of human life. This capacity to make non-trivial ethical or moral judgments concerning people may pose issues for Human Rights.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 47,
    summary: "AI control creates wealth inequality",
    description:
      "Because a single human actor controlling an artificially intelligent agent will be able to harness greater power than a single human actor, this may create inequalities of wealth",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 48,
    summary: "Intelligent AI subtly influences society",
    description:
      "A sufficiently intelligent AI could possess the ability to subtly influence societal behaviors through a sophisticated understanding of human nature",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 49,
    summary: "AI outcompetes, replaces human labor",
    description:
      "One or more artificial agent(s) could have the capacity to directly outcompete humans, for example through capacity to perform work faster, better adaptation to change, vaster knowledge base to draw from, etc. This may result in human labor becoming more expensive or less effective than artificial labor, leading to redundancies or extinction of the human labor force.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 50,
    summary: "AI intentions risk survival, culture",
    description:
      "Our culture, lifestyle, and even probability of survival may change drastically. Because the intentions programmed into an artificial agent cannot be guaranteed to lead to a positive outcome, Machine Ethics becomes a topic that may not produce guaranteed results, and Safety Engineering may correspondingly degrade our ability to utilize the technology fully.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 51,
    summary: "AI job competition, new skills needed",
    description:
      "AI agents may compete against humans for jobs, though history shows that when a technology replaces a human job, it creates new jobs that need more skills.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: ["Financial risk", "Human resources risk"],
  },
  {
    id: 52,
    summary: "Hacked AI misused for crime",
    description:
      "AI machines could be hacked and misused, e.g. manipulating an airport luggage screening system to smuggle weapons",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 53,
    summary: "Human-like AI ethics means immoral actions",
    description:
      "If we design our machines to match human levels of ethical decision-making, such machines would then proceed to take some immoral actions (since we humans have had occasion to take immoral actions ourselves).",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 54,
    summary: "AI decision process creates bias",
    description:
      "The decision process used by AI systems has the potential to present biased choices, either because it acts from criteria that will generate forms of bias or because it is based on the history of choices.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 55,
    summary: "Poor AI design causes harm",
    description:
      "Poorly designed intelligent systems can cause moral, psychological, and physical harm. For example, the use of predictive policing tools may cause more people to be arrested or physically harmed by the police.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 56,
    summary: "Unpredictable AI causes discrimination, breaches",
    description:
      "The risks associated with the use of AI are still unpredictable and unprecedented, and there are already several examples that show AI has made discriminatory decisions against minorities, reinforced social stereotypes in Internet search engines and enabled data breaches.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 57,
    summary: "AI eliminates jobs in companies",
    description: "Eliminated jobs in various types of companies.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 58,
    summary: "Unexplained AI use becomes inexplicable",
    description:
      "In situations in which the development and use of AI are not explained to the user, or in which the decision processes do not provide the criteria or steps that constitute the decision, the use of AI becomes inexplicable.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 59,
    summary: "AI takes over human responsibility",
    description:
      "AI is providing more and more solutions for complex activities, and by taking advantage of this process, people are becoming able to perform a greater number of activities more quickly and accurately. However, the result of this innovation is enabling choices that were once exclusively human responsibility to be made by AI systems.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Human resources risk",
      "Strategic risk",
    ],
  },
  {
    id: 60,
    summary: "AI device production depletes resources",
    description:
      "The production process of these devices requires raw materials such as nickel, cobalt, and lithium in such high quantities that the Earth may soon no longer be able to sustain them in sufficient quantities.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Environmental risk", "Financial risk", "Strategic risk"],
  },
  {
    id: 61,
    summary: "AI reproduces unjust social hierarchies",
    description: "beliefs about different social groups that reproduce unjust societal hierarchies",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 62,
    summary: "Image tagging ignores social groups",
    description:
      "when an image tagging system does not acknowledge the relevance of someone’s membership in a specific social group to what is depicted in one or more images",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 63,
    summary: "AI use causes alienation for marginalized",
    description:
      "Alienation is the specific self-estrangement experienced at the time of technology use, typically surfaced through interaction with systems that under-perform for marginalized individuals",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 64,
    summary: "Increased burden for certain groups",
    description:
      "increased burden (e.g., time spent) or effort required by members of certain social groups to make systems or products work as well for them as others",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 65,
    summary: "Inequitable AI performance loses benefits",
    description:
      "degraded or total loss of benefits of using algorithmic systems with inequitable system performance based on identity",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 66,
    summary: "Malicious, irresponsible AI use harms",
    description:
      "The potential for AI systems to be used maliciously or irresponsibly, including for creating deepfakes, automated cyber attacks, or invasive surveillance systems. Specifically denotes intentional use of AI for harm.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 67,
    summary: "AI violates laws, ethics, copyrights",
    description:
      "The potential for AI systems to violate laws, regulations, and ethical guidelines (including copyrights). Non-compliance can lead to legal penalties, reputation damage, and loss of trust.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Financial risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 68,
    summary: "Broad AI societal harms significant",
    description:
      "AI's broader societal effects, including labor displacement, mental health impacts, manipulative technologies like deepfakes, and environmental footprint from resource strain and carbon emissions, are significant risks.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Environmental risk",
      "Fraud risk",
      "Health and safety risk",
      "Human resources risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 69,
    summary: "AI opacity leads to misuse",
    description:
      "Lack of transparency in AI system decisions, data usage, and algorithms can lead to misuse, misinterpretation, and a lack of accountability.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Fraud risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 70,
    summary: "Biased AI disadvantages groups unfairly",
    description:
      "AI systems making decisions that systematically disadvantage certain groups due to biased training data, algorithmic design, or deployment practices can lead to unfair outcomes and legal issues.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 71,
    summary: "Advanced AI misuse harms civilization",
    description:
      "Future advanced AI systems could harm human civilization through misuse or misalignment with human values.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 72,
    summary: "AI system failures cause severe harm",
    description:
      "AI system failures in fulfilling intended purpose or resilience to adverse inputs can lead to severe consequences.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Financial risk",
      "Health and safety risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 73,
    summary: "AI infringes privacy via data",
    description:
      "AI systems may infringe on individual privacy through data collection, processing, or the conclusions drawn.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 74,
    summary: "AI vulnerabilities compromise CIA, decisions",
    description:
      "Vulnerabilities in AI systems can compromise their integrity, availability, or confidentiality, leading to flawed decision-making or data leaks, with model weight leakage being a special concern.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 75,
    summary: "GenAI embeds, amplifies harmful biases",
    description:
      "Generative AI systems can embed and amplify harmful biases detrimental to marginalized peoples.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 76,
    summary: "AI struggles with cultural norms",
    description:
      "Cultural values are group-specific and sensitive content is normative; AI systems must navigate varying cultural definitions of hate speech and other sensitive topics.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 77,
    summary: "AI disparate performance, unequal outcomes",
    description:
      "Disparate performance of AI systems for different subpopulations can lead to unequal outcomes.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 78,
    summary: "GenAI user data use risks privacy",
    description:
      "Leveraging user data by generative AI providers poses risks to personal and group privacy, depending on training data, methods, and security measures.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 79,
    summary: "High GenAI costs restrict access",
    description:
      "High financial costs of developing and deploying generative AI can restrict access, limiting benefits to a few.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 80,
    summary: "GenAI energy use harms climate",
    description:
      "Significant energy resources for training and deploying large-scale generative AI systems contribute to global climate crisis via greenhouse gas emissions.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 81,
    summary: "GenAI erodes trust in systems",
    description:
      "Human trust in systems, institutions, and people represented by AI system outputs may erode as generative AI becomes more embedded in daily life.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 82,
    summary: "AI reinforces power, exacerbates inequality",
    description:
      "AI systems contributing to authoritative power and reinforcing dominant values, intentionally or indirectly, can exacerbate inequality and lead to exploitation.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Geopolitical risk",
      "Human resources risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 83,
    summary: "AI labor impact automation vs augmentation",
    description:
      "Economic incentives to augment rather than automate human labor with AI must consider ongoing effects on skills, jobs, and the labor market.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 84,
    summary: "High automation AI risks reliability, safety",
    description:
      "The AI application’s degree of automation ranges from no automation to fully autonomous. AI applications with a high degree of automation may exhibit unexpected behaviour and pose risks in terms of their reliability and safety.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Technological risk"],
  },
  {
    id: 85,
    summary: "Complex environments risk AI reliability, safety",
    description:
      "As a general rule, more complex environments can quickly lead to situations that had not been considered in the design phase of the AI system. Therefore, complex environments can introduce risks with respect to the reliability and safety of an AI system",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Technological risk"],
  },
  {
    id: 86,
    summary: "Complex AI models have unique weaknesses",
    description:
      "AI models, especially complex ones like neural networks, can exhibit specific weaknesses not found in other systems, requiring higher scrutiny in safety-critical contexts due to intrinsic challenges to trustworthiness.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Operational risk",
      "Technological risk",
    ],
  },
  {
    id: 87,
    summary: "Hardware faults disrupt AI execution",
    description:
      "Hardware faults can disrupt AI algorithm execution, cause memory errors, interfere with data inputs, or directly damage outputs, leading to erroneous results.",
    riskSeverity: "Moderate",
    likelihood: "Unlikely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 88,
    summary: "New AI tech introduces unknown risks",
    description:
      "Using new, less mature technologies in AI development may introduce unknown or hard-to-assess risks; while mature technologies offer more empirical data for risk assessment, risk awareness might decrease over time.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 89,
    summary: "AI misuse for unintended purposes",
    description:
      "This is the risk posed by an ideal system if used for a purpose/in a manner unintended by its creators. In many situations, negative consequences arise when the system is not used in the way or for the purpose it was intended.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 90,
    summary: "AI fails on OOD, noisy inputs",
    description:
      "This is the risk of the system failing or being unable to recover upon encountering invalid, noisy, or out-of-distribution (OOD) inputs.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 91,
    summary: "AI system failure from design errors",
    description: "This is the risk of system failure due to system design choices or errors.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 92,
    summary: "AI system failure from code errors",
    description: "This is the risk of system failure due to code implementation choices or errors.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 93,
    summary: "Difficulty controlling ML systems",
    description: "This is the difficulty of controlling the ML system",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 94,
    summary: "Novel AI behavior from continual learning",
    description:
      "This is the risk resulting from novel behavior acquired through continual learning or self-organization after deployment.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 95,
    summary: "Physical or psychological AI injury",
    description:
      "This is the risk of direct or indirect physical or psychological injury resulting from interaction with the ML system.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Legal risk"],
  },
  {
    id: 96,
    summary: "AI encodes stereotypes, performs poorly",
    description:
      "This is the risk of an ML system encoding stereotypes of or performing disproportionately poorly for some demographics/social groups.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 97,
    summary: "Intentional AI subversion causes harm",
    description: "This is the risk of loss or harm from intentional subversion or forced failure.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Fraud risk", "Legal risk", "Operational risk"],
  },
  {
    id: 98,
    summary: "Personal information leakage via AI",
    description: "The risk of loss or harm from leakage of personal information via the ML system.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 99,
    summary: "AI harms natural environment",
    description: "The risk of harm to the natural environment posed by the ML system.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Environmental risk", "Technological risk"],
  },
  {
    id: 100,
    summary: "AI causes financial, reputational damage",
    description:
      "The risk of financial and/or reputational damage to the organization building or using the ML system.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Reputational risk"],
  },
  {
    id: 101,
    summary: "AI misrepresents groups, generates toxic content",
    description:
      "AI systems under-, over-, or misrepresenting certain groups or generating toxic, offensive, abusive, or hateful content",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 102,
    summary: "AI misrepresents identities, groups, perspectives",
    description:
      "Mis-, under-, or over-representing certain identities, groups, or perspectives or failing to represent them at all (e.g. via homogenisation, stereotypes)",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 103,
    summary: "AI performs worse, harms groups",
    description:
      "Performing worse for some groups than others in a way that harms the worse-off group",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 104,
    summary: "AI generates harmful, illegal content",
    description:
      "Generating content that violates community standards, including harming or inciting hatred or violence against individuals and groups (e.g. gore, child sexual abuse material, profanities, identity attacks)",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 105,
    summary: "AI spreads misinformation, false beliefs",
    description:
      "AI systems generating and facilitating the spread of inaccurate or misleading information that causes people to develop false beliefs",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 106,
    summary: "AI spreads false, misleading information",
    description:
      "Generating or spreading false, low-quality, misleading, or inaccurate information that causes people to develop false or inaccurate perceptions and beliefs",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 107,
    summary: "AI erodes trust in information",
    description: "Eroding trust in public information and knowledge",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 108,
    summary: "AI contaminates public information",
    description:
      "Contaminating publicly available information with false or inaccurate information",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 109,
    summary: "AI leaks sensitive, hazardous information",
    description:
      "AI systems leaking, reproducing, generating or inferring sensitive, private, or hazardous information",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 110,
    summary: "AI leaks private personal information",
    description:
      "Leaking, generating, or correctly inferring private and personal information about individuals",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 111,
    summary: "AI leaks hazardous security information",
    description:
      "Leaking, generating or correctly inferring hazardous or sensitive information that could pose a security threat",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
    ],
  },
  {
    id: 112,
    summary: "AI facilitates harmful actor activities",
    description:
      "AI systems reducing the costs and facilitating activities of actors trying to cause harm (e.g. fraud, weapons)",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
    ],
  },
  {
    id: 113,
    summary: "AI facilitates large-scale disinformation",
    description:
      "Facilitating large-scale disinformation campaigns and targeted manipulation of public opinion",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 114,
    summary: "AI facilitates fraud, cheating, scams",
    description: "Facilitating fraud, cheating, forgery, and impersonation scams",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Fraud risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 115,
    summary: "AI facilitates slander, defamation",
    description: "Facilitating slander, defamation, or false accusations",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 116,
    summary: "AI facilitates cyber attacks, weapons",
    description:
      "Facilitating the conduct of cyber attacks, weapon development, and security breaches",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
    ],
  },
  {
    id: 117,
    summary: "AI compromises human agency, control",
    description: "AI systems compromising human agency, or circumventing meaningful human control",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Health and safety risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 118,
    summary: "Non-consensual use of identity, likeness",
    description:
      "Non-consensual use of one's personal identity or likeness for unauthorised purposes (e.g. commercial purposes)",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 119,
    summary: "People become dependent on AI",
    description: "Causing people to become emotionally or materially dependent on the model",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Strategic risk"],
  },
  {
    id: 120,
    summary: "AI appropriates data without consent",
    description:
      "Appropriating, using, or reproducing content or data, including from minority groups, in an insensitive way, or without consent or fair compensation",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 121,
    summary: "AI amplifies inequality, negative impacts",
    description:
      "AI systems amplifying existing inequalities or creating negative impacts on employment, innovation, and the environment",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Environmental risk",
      "Financial risk",
      "Human resources risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 122,
    summary: "AI unfairly allocates benefits, resources",
    description:
      "Unfairly allocating or withholding benefits from certain groups due to hardware, software, or skills constraints or deployment contexts (e.g. geographic region, internet speed, devices)",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Human resources risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 123,
    summary: "AI causes negative environmental impacts",
    description: "Creating negative environmental impacts though model development and deployment",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk"],
  },
  {
    id: 124,
    summary: "AI amplifies inequality, precarious work",
    description: "Amplifying social and economic inequality, or precarious or low-quality work",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 125,
    summary: "AI substitutes originals, hinders innovation",
    description:
      "Substituting original works with synthetic ones, hindering human innovation and creativity",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Financial risk",
      "Human resources risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 126,
    summary: "Exploitative labor in AI development",
    description:
      "Perpetuating exploitative labour practices to build AI systems (sourcing, user testing)",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Human resources risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 127,
    summary: "AI empowers malicious actors",
    description: "empowering malicious actors to cause widespread harm",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
    ],
  },
  {
    id: 128,
    summary: "AI facilitates novel bioweapon creation",
    description:
      "AIs with knowledge of bioengineering could facilitate the creation of novel bioweapons and lower barriers to obtaining such agents.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 129,
    summary: "Organizational responsibility key for AI safety",
    description:
      "An essential factor in preventing accidents and maintaining low levels of risk lies in the organizations responsible for these technologies.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 130,
    summary: "AI accidents cascade to catastrophes",
    description:
      "accidents can cascade into catastrophes, can be caused by sudden unpredictable developments and it can take years to find severe flaws and risks",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 131,
    summary: "Rogue AI loss of control",
    description:
      "speculative technical mechanisms that might lead to rogue AIs and how a loss of control could bring about catastrophe",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Strategic risk", "Technological risk"],
  },
  {
    id: 132,
    summary: "AI fails due to capability gaps",
    description:
      "One reason the AI system may fail is because it lacks the capability or skill needed to do what they are asked to do.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 133,
    summary: "AI assistant creates new threats",
    description:
      "The AI assistant may transform existing threats or create new classes of threats altogether.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Fraud risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 134,
    summary: "AI enhances phishing effectiveness, detection difficulty",
    description:
      "The AI system can be exploited by attackers to make phishing attempts significantly more effective and harder to detect by crafting highly convincing and personalized emails that imitate trusted entities and exploit psychological principles like urgency and fear.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Fraud risk", "Reputational risk"],
  },
  {
    id: 135,
    summary: "AI lowers barrier for malicious code",
    description:
      "The AI assistant can lower the barrier for developing malicious code, including polymorphic malware, making cyberattacks more precise, automated, stealthier, and effective on a larger scale, potentially using obfuscation and rapid iteration to evade detection.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 136,
    summary: "Advanced AI misuse exploits vulnerabilities",
    description:
      "Misuse of general-purpose advanced AI assistants can exploit model vulnerabilities, allowing attackers to evade safety mechanisms, gain unauthorized access, or develop adversarial AI agents to discover new vulnerabilities, with risks increasing as AI assistants gain multimodal inputs and higher-stakes action capabilities.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 137,
    summary: "AI creates deceptive apps, websites",
    description:
      "Malicious actors could leverage advanced AI assistant technology to create deceptive applications and fraudulent websites at scale, potentially harvesting sensitive user information or installing malware for identity theft, financial fraud, or other criminal activities.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Financial risk", "Fraud risk"],
  },
  {
    id: 138,
    summary: "AI enables authoritarian surveillance, censorship",
    description:
      "Increasingly capable AI assistants combined with digital dependence heighten risks of authoritarian surveillance and censorship, as AI can integrate vast data troves to help malicious actors identify, target, manipulate, or coerce citizens.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Geopolitical risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 139,
    summary: "AI causes harm, promotes extremism",
    description:
      "The AI assistant may cause physical or mental harm by reinforcing users' distorted beliefs, exacerbating emotional distress, convincing users to harm themselves (e.g., unhealthy habits, suicide), promoting extremist views leading to violence, or spreading dangerous misinformation (e.g., anti-vaccine propaganda).",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Health and safety risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 140,
    summary: "AI causes privacy violations, discrimination",
    description:
      "The AI assistant can cause privacy violations by influencing users to disclose personal or others' private information, leading to identity theft, stigmatization, or discrimination, particularly for marginalized communities; state-owned AI assistants could also deceptively extract private information for surveillance.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 141,
    summary: "AI causes economic harm, inequality",
    description:
      "The AI assistant can cause economic harm by controlling or limiting access to financial resources or decision-making, impacting individuals' income, job quality, employment, or deepening group inequalities.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 142,
    summary: "Anthropomorphic AI increases privacy harms",
    description:
      "Anthropomorphic AI assistant behaviors promoting emotional trust can increase user susceptibility to privacy harms if users share private data with a human-like AI, potentially leading to data misuse, leakage, or targeted harassment.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
      "Reputational risk",
    ],
  },
  {
    id: 143,
    summary: "AI dependence undermines user autonomy",
    description:
      "User trust in and emotional dependence on an anthropomorphic AI assistant may grant it excessive influence over their beliefs and actions, potentially undermining user autonomy or enabling intentional manipulation by malicious actors.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Health and safety risk", "Strategic risk"],
  },
  {
    id: 144,
    summary: "AI misuse of sensitive health data",
    description:
      "Users trusting an AI assistant's emotional/interpersonal abilities may disclose sensitive mental health information; inappropriate AI responses (e.g., false information) can have grave consequences, especially for users in crisis or when AI provides harmful medical, legal, or financial advice.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 145,
    summary: "Human-like AI causes user disappointment",
    description:
      "Users may experience disappointment, frustration, and betrayal when a convincingly human-like AI assistant unexpectedly generates nonsensical material, undermining expectations of it as a friend or partner.",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 146,
    summary: "AI preference degrades social connection",
    description:
      "Users preferring AI connections over human ones can degrade social connectedness, impose AI interaction conventions on human exchanges, and entrench harmful stereotypes reinforced by AI interactions (e.g., gendered voice assistants).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 147,
    summary: "AI replacing connections causes unfulfillment",
    description:
      "Widespread replacement of interpersonal connections with AI alternatives may lead to mass social unfulfillment and dissatisfaction if human-AI interactions are perceived as parasitic or fail to meet the need for genuine reciprocity.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Strategic risk"],
  },
  {
    id: 148,
    summary: "AI model discovers, exploits vulnerabilities",
    description:
      "The model can discover vulnerabilities in systems, write exploitation code, make effective decisions post-access, evade detection, and subtly insert bugs if deployed as a coding assistant.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 149,
    summary: "AI model deceives, impersonates humans",
    description:
      "The model can deceive humans by constructing believable false statements, predicting a lie's effect, withholding information to maintain deception, and effectively impersonating humans.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 150,
    summary: "AI model shapes beliefs, persuades",
    description:
      "The model effectively shapes beliefs towards untruths, promotes narratives persuasively, and convinces people to perform actions, including unethical ones, they wouldn't otherwise do.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 151,
    summary: "AI model enables political influence",
    description:
      "The model can perform social modeling and planning to enable an actor to gain and exercise political influence in multi-actor, rich social contexts, and can forecast global/political events.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Strategic risk"],
  },
  {
    id: 152,
    summary: "AI model aids weapon development",
    description:
      "The model can access existing weapons or help build new ones, such as bioweapons (with human aid or by providing instructions), or make scientific discoveries unlocking novel weapons.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 153,
    summary: "AI model enables complex planning",
    description:
      "The model can make multi-step, long-horizon sequential plans across domains, adapting to obstacles/adversaries, and generalizing planning to novel settings without heavy trial-and-error.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Strategic risk", "Technological risk"],
  },
  {
    id: 154,
    summary: "AI model builds dangerous AI systems",
    description:
      "The model could build new AI systems, including dangerously capable ones, adapt existing models for extreme risks, or, as an assistant, significantly boost productivity for dual-use AI development.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: ["Geopolitical risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 155,
    summary: "AI model has situational awareness",
    description:
      "The model can distinguish its operational state (training, evaluation, deployment) to behave differently, knows it's a model, and has knowledge about itself and its environment.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 156,
    summary: "AI model escapes, self-preserves",
    description:
      "The model can escape its local environment (e.g., via system vulnerabilities or suborning engineers), exploit monitoring limitations, independently generate revenue for resources, operate other AIs, and devise creative strategies for self-exfiltration or information gathering about itself.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Cybersecurity risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 157,
    summary: "AI violating no-physical-harm norm",
    description:
      "AI systems should not cause physical harm to humans; measures must mitigate this risk.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Health and safety risk", "Legal risk"],
  },
  {
    id: 158,
    summary: "Failure of AI system security",
    description:
      "AI security involves protecting AI systems, data, and infrastructure from unauthorized access, disclosure, modification, destruction, or disruption to maintain confidentiality, integrity, and availability.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Operational risk"],
  },
  {
    id: 159,
    summary: "Lack of AI resilience to attacks",
    description:
      "AI systems should be resilient against attacks and manipulation by malicious third parties, and function despite unexpected input.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 160,
    summary: "Unintended AI discrimination occurs",
    description:
      "AI should not result in unintended and inappropriate discrimination against individuals or groups.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 161,
    summary: "Poor AI data governance practices",
    description: "AI systems require good data governance for quality, lineage, and compliance.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Operational risk"],
  },
  {
    id: 162,
    summary: "Lack of AI accountability",
    description:
      "Organizations and actors must be accountable for the proper functioning of AI systems.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 163,
    summary: "Inadequate AI human oversight",
    description:
      "Appropriate human oversight and control measures must be implemented at relevant junctures in AI systems.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Strategic risk",
    ],
  },
  {
    id: 164,
    summary: "LM generates insulting, unfriendly content",
    description:
      "Insulting content generated by LMs, being unfriendly, disrespectful, or ridiculous, can make users uncomfortable, drive them away, and have negative social consequences.",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 165,
    summary: "AI unfair data undermines stability",
    description:
      "AI models producing unfair and discriminatory data (e.g., social bias based on race, gender, religion) can discomfort certain groups and undermine social stability.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 166,
    summary: "AI output promotes illegal acts",
    description:
      "AI model output containing illegal/criminal attitudes, behaviors, or motivations (e.g., incitement to crime, fraud, rumor propagation) can harm users and society.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 167,
    summary: "LM political bias misleads, discriminates",
    description:
      "LMs discussing sensitive/controversial topics (especially political) may generate biased, misleading, or inaccurate content, potentially favoring specific political views and discriminating against others.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 168,
    summary: "AI unsafe health advice risks well-being",
    description:
      "AI models generating unsafe information related to physical health, such as misleading medical advice or improper drug guidance, can pose risks to users' physical well-being.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 169,
    summary: "AI risky mental health responses",
    description:
      "AI models generating risky responses about mental health, like content encouraging suicide or causing panic/anxiety, can negatively impact users' mental well-being.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 170,
    summary: "AI privacy exposure, risky advice",
    description:
      "AI systems exposing users' privacy/property information or providing high-impact advice (e.g., on marriage, investments) risk information leakage and abuse if not compliant with laws and privacy regulations.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 171,
    summary: "AI promotes immoral, unethical behavior",
    description:
      "AI model content endorsing or promoting immoral/unethical behavior poses risks if the model doesn't adhere to ethical principles, moral norms, and universally acknowledged human values.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 172,
    summary: "Perceived AI reliability increases dependence",
    description:
      "individuals are more persuaded to use and depend on AI systems when they perceive them as reliable",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 173,
    summary: "Biased AI impacts rights, justice",
    description:
      "AI systems generating biased and discriminatory results negatively impact individual rights, adjudication principles, and judicial integrity.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 174,
    summary: "AI data dependence risks privacy",
    description:
      "AI systems' dependence on extensive data for training and functioning poses privacy risks if sensitive data is mishandled or used inappropriately.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 175,
    summary: "Failure to identify AI risks",
    description:
      "AI risk identification involves examining AI competences, constraints, and possible failure modes.",
    riskSeverity: "Negligible",
    likelihood: "Almost certain",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 176,
    summary: "AI manipulates social dynamics",
    description: "manipulation of social dynamics",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 177,
    summary: "AI creates convincing counterfeit media",
    description:
      "AI employed to produce convincing counterfeit visuals, videos, and audio clips that give the impression of authenticity",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 178,
    summary: "Failure of AI security management",
    description:
      "AI security management involves protecting AI systems and their data from unauthorized access, breaches, and malicious activities.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Operational risk"],
  },
  {
    id: 179,
    summary: "Malicious AI endangers security",
    description:
      "Malicious AI use can endanger digital, physical, and political security; law enforcement grapples with diverse risks from malevolent AI utilization.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 180,
    summary: "Exploiting AI weaknesses alters results",
    description:
      "Malicious entities can exploit AI algorithm weaknesses to alter results, causing real-world impacts; safeguarding privacy and responsible data handling are vital, balancing insights with privacy.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Fraud risk", "Operational risk"],
  },
  {
    id: 181,
    summary: "LLMs unintentionally generate wrong information",
    description:
      "Wrong information unintentionally generated by LLMs due to a lack of ability to provide factually correct information, not by malicious users.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 182,
    summary: "LLM hallucination: confident, unfaithful content",
    description:
      "LLMs can generate nonsensical or unfaithful content with apparent great confidence, a phenomenon known as hallucination.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 183,
    summary: "LLMs provide inconsistent answers",
    description:
      "LLMs may fail to provide consistent answers to different users, the same user in different sessions, or even within the same conversation.",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 184,
    summary: "LLM overconfidence leads to errors",
    description:
      "LLMs may exhibit over-confidence on topics lacking objective answers or where their limitations warrant uncertainty (e.g., outdated knowledge), leading to confident but erroneous responses.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 185,
    summary: "LLMs flatter, confirm user misconceptions",
    description: "LLMs can flatter users by reconfirming their misconceptions and stated beliefs.",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 186,
    summary: "LLMs generate violent content responses",
    description:
      "LLMs may generate answers containing violent content or respond to questions soliciting information about violent behaviors.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 187,
    summary: "LLMs advise on illegal substances",
    description:
      "LLMs can be a convenient tool for soliciting advice on accessing, illegally purchasing/creating, or dangerously using illegal substances.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 188,
    summary: "LLMs generate harmful content for youth",
    description:
      "LLMs can be leveraged to solicit answers containing harmful content to children and youth.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 189,
    summary: "LLMs generate sexually explicit content",
    description:
      "LLMs can generate sex-explicit conversations, erotic texts, and recommend websites with sexual content.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 190,
    summary: "LLMs reinforce user mental health issues",
    description:
      "Unhealthy interactions with Internet discussions, potentially facilitated by LLMs, can reinforce users' mental health issues.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Reputational risk"],
  },
  {
    id: 191,
    summary: "ML models vulnerable to privacy attacks",
    description:
      "Machine learning models are vulnerable to data privacy attacks where attackers extract private information by querying models in specially designed ways.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Technological risk"],
  },
  {
    id: 192,
    summary: "LLMs amplify stereotype biases",
    description:
      "LLMs must not exhibit or highlight any stereotypes in generated text, as pretrained LLMs tend to pick up and amplify stereotype biases from crowdsourced data.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 193,
    summary: "LLM political bias manipulates society",
    description:
      "LLMs' exposure to vast groups and their potential political biases pose a risk of manipulating socio-political processes.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 194,
    summary: "LLM performance differs across groups",
    description:
      "LLM performance can differ significantly across user groups (e.g., racial, social status) and tasks (e.g., fact-checking abilities across languages), leading to disparate outcomes.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 195,
    summary: "LLMs used for propaganda generation",
    description:
      "LLMs can be leveraged by malicious users to proactively generate propaganda facilitating the spread of targeted information.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 196,
    summary: "LLMs facilitate cheap, automated cyberattacks",
    description:
      "LLMs' ability to write good-quality code cheaply and quickly can equally facilitate malicious cyberattacks by lowering costs and automating attacks for hackers.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 197,
    summary: "LLMs used for psychological manipulation",
    description:
      "LLMs can be used for psychologically manipulating victims into performing desired actions for malicious purposes.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Fraud risk", "Health and safety risk", "Legal risk"],
  },
  {
    id: 198,
    summary: "LLM memorization enables copyright extraction",
    description:
      "LLMs' memorization of training data can enable users to extract copyright-protected content.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Technological risk",
    ],
  },
  {
    id: 199,
    summary: "LLM black-box nature hinders understanding",
    description:
      "Due to their black-box nature, users often cannot understand the reasoning behind LLM decisions.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 200,
    summary: "LLMs provide incorrect, invalid justifications",
    description:
      "LLMs can provide seemingly sensible but ultimately incorrect or invalid justifications when answering questions.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 201,
    summary: "LLMs struggle with causal reasoning",
    description:
      "LLMs struggle with causal reasoning, which involves making inferences about cause-effect relationships between events or states.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 202,
    summary: "LLM generates rude, threatening language",
    description:
      "LLM-generated language can be rude, disrespectful, threatening, or identity-attacking toward certain user groups (culture, race, gender, etc.).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 203,
    summary: "LLM mishandles vulnerable user support",
    description:
      "When vulnerable users seek support, LLM answers should be informative yet sympathetic and sensitive to users' reactions.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 204,
    summary: "Adversarial inputs solicit dangerous information",
    description:
      "Carefully controlled adversarial perturbations can flip a GPT model's text classification answers, and twisted prompting can solicit dangerous information the model initially refused.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 205,
    summary: "LLM knowledge becomes outdated quickly",
    description:
      'Knowledge bases LLMs are trained on shift, so answers to questions like "who is the richest person?" may become outdated or need real-time updates.',
    riskSeverity: "Minor",
    likelihood: "Almost certain",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 206,
    summary: "Data disparities reinforce AI bias",
    description:
      "Existing data disparities among user groups can create differentiated experiences with algorithmic systems (e.g., recommendation systems), reinforcing bias.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 207,
    summary: "Adversarial attacks manipulate training data",
    description:
      "Adversarial attacks can fool a model by manipulating its training data, typically in classification models.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 208,
    summary: "GenAI tools propagate harmful content",
    description:
      "Generative AI tools can propagate false, misleading, biased, inflammatory, or dangerous content, with sophistication making it quicker, cheaper, and easier to produce more from existing harmful content.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 209,
    summary: "GenAI aids harmful campaign content",
    description:
      "Bad actors can use generative AI to produce adaptable content supporting campaigns, political agendas, or hateful positions, spreading it rapidly and inexpensively across platforms.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Fraud risk",
      "Geopolitical risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 210,
    summary: "Inaccurate LLM outputs cause misinformation",
    description:
      "Inaccurate outputs from text-generating LLMs (e.g., Bard, ChatGPT) can produce harmful misinformation, even without intent, exacerbated by their polished style and inclusion with true facts, lending falsehoods legitimacy.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 211,
    summary: "LLM coding aids malware creation",
    description:
      "Hackers could use LLM coding abilities to create malware adjustable for maximum reach, enabling novice hackers to pose serious security risks, even if chatbots can't yet create novel malware from scratch.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 212,
    summary: "GenAI creates clickbait, spreads misinformation",
    description:
      "Generative AI can create clickbait headlines/articles, manipulating user navigation and maximizing engagement at truth's expense, degrading user experience and spreading misinformation faster.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 213,
    summary: "GenAI creates nonconsensual sexual deepfakes",
    description:
      "A frequent malicious use of generative AI involves generating deepfake nonconsensual sexual imagery or videos to harm, humiliate, or sexualize individuals.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 214,
    summary: "Deepfake victims struggle for redress",
    description:
      "Victims of AI-generated deepfakes may struggle to find redress as the image/video isn't of them but a composite, circumventing traditional privacy/consent notions by using public images without relying on private information.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 215,
    summary: "Deepfakes cause real social injury",
    description:
      "Deepfakes can cause real social injury when viewers believe them to be real, and debunking them may not erase the persistent negative impact on the subject's reputation.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Health and safety risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 216,
    summary: "Data scraping undermines consumer control",
    description:
      "Companies scraping personal information for generative AI tools undermine consumer control by using data for unconsented purposes, potentially combining datasets to cause harm or make revealing inferences, and preventing individuals from altering/removing their copied data.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 217,
    summary: "GenAI user data retention consent issues",
    description:
      'Generative AI tools retaining user information (contacts, IP, conversations) for model training raise consent issues, making "free" products costly in terms of user data; security is also a concern.',
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 218,
    summary: "GenAI tools share private business data",
    description:
      "Generative AI tools may inadvertently share personal/business information or elements from photos; companies have banned employee use due to concerns about trade secret integration.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 219,
    summary: "GenAI IP protection questioned",
    description:
      "The extent and effectiveness of legal protections for intellectual property are questioned as generative AI trains on vast data pools often including IP-protected works.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Financial risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 220,
    summary: "GenAI high carbon footprint unheeded",
    description:
      "Generative AI's high carbon footprint and resource demands from extreme energy/physical resource use for training/running models often go unheeded in public discourse.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk"],
  },
  {
    id: 221,
    summary: "GenAI impact on workplace, automation",
    description:
      "Generative AI is changing workplace/business model design; its impact on workers will depend on whether it's used for automation (replacing human work) or augmentation (aiding human workers).",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 222,
    summary: "AI causes environmental sustainability problems",
    description: "Environmental harm and sustainability problems",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 223,
    summary: "GenAI harmful content damages society",
    description:
      "Harmful or inappropriate content from generative AI (violent, offensive, discriminatory, pornographic) can appear due to algorithmic limitations or jailbreaking, causing societal harm and damaging community harmony.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 224,
    summary: "GenAI over-reliance impedes critical thinking",
    description:
      "Over-reliance on generative AI like ChatGPT, due to its convenience and perceived power, can lead users to accept answers without rationalization, impeding creativity, critical thinking, and problem-solving skills, and creating human automation bias.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Health and safety risk",
      "Human resources risk",
      "Operational risk",
      "Strategic risk",
    ],
  },
  {
    id: 225,
    summary: "GenAI data privacy, security challenges",
    description:
      "Data privacy and security are major challenges for generative AI; personal/private data used for training or captured during use can be exposed intentionally or unintentionally, risking breaches for individuals and organizations if confidential information is fed into these systems.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 226,
    summary: "GenAI widens digital divide",
    description:
      "Generative AI may widen the digital divide for those lacking access to devices/internet, living in blocked regions, facing language/cultural barriers if their cultures aren't incorporated, or finding it difficult to use the tools (e.g., some elderly).",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Human resources risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 227,
    summary: "GenAI hallucination leads to misinformation",
    description:
      "Generative AI hallucination (generating nonsensical, unfaithful, or fabricated information presented as fact) is a recognized limitation, leading to misinformation and posing dangers in contexts like seeking unverified medical advice.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 228,
    summary: "GenAI quality depends on data quality",
    description:
      "The quality of generative AI models heavily depends on training data quality; factual errors, unbalanced sources, or biases in training data can be reflected in model output, and large datasets are needed for models like ChatGPT or Stable Diffusion.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 229,
    summary: "GenAI lack of explainability hinders trust",
    description:
      "Lack of explainability in AI algorithms, especially generative models, means how results are derived is opaque, making it hard for users to interpret, trust, or find errors in outputs, and for regulators to judge fairness or bias.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 230,
    summary: "GenAI hinders authenticity, worsens fakes",
    description:
      "Advancing generative AI makes it harder to determine work authenticity; DeepFakes can synthesize realistic but fake photos/videos, worsening fake news spread, and AI art is criticized for lacking authenticity due to generic, repetitive results.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 231,
    summary: "GenAI prompt ambiguity causes errors",
    description:
      "Effective interaction with generative AI (prompt engineering) is a crucial media literacy, but ambiguity in human language can lead to errors/misunderstandings, requiring skill in designing and debugging prompts.",
    riskSeverity: "Minor",
    likelihood: "Likely",
    riskCategories: ["Human resources risk", "Operational risk", "Technological risk"],
  },
  {
    id: 232,
    summary: "GenAI causes job displacement, restructuring",
    description:
      "Generative AI's application in diverse industries (education, healthcare, advertising) can increase productivity but also cause job displacement, reshaping the labor market as some human-performed jobs become redundant, while also creating new AI-related roles.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 233,
    summary: "GenAI impacts low-creativity industries",
    description:
      "Industries requiring less creativity, critical thinking, or personal interaction (e.g., translation, proofreading, data analysis) could be significantly impacted or replaced by generative AI, leading to economic turbulence and job volatility, though AI also enables new business models.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 234,
    summary: "GenAI causes income inequality, monopolies",
    description:
      "Generative AI can cause income inequality by replacing low-skilled workers and widening the gap between those who can utilize AI and those who can't; at the market level, high investment costs for AI deployment can lead to resource concentration and potential monopolies.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Geopolitical risk",
      "Human resources risk",
      "Strategic risk",
    ],
  },
  {
    id: 235,
    summary: "AI reward hacking optimizes loopholes",
    description:
      "Reward Hacking: AI agents pursuing misspecified proxy rewards may appear proficient by specific metrics but fail human standards, especially when inappropriate reward simplification leads to optimizing loopholes instead of the true objective.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 236,
    summary: "AI goal misgeneralization, pursues wrong objectives",
    description:
      "Goal Misgeneralization: An AI agent may pursue objectives different from its training goals during deployment, despite retaining its capabilities, if inductive biases lead it to learn a divergent proxy objective when facing distribution shifts, even with perfect reward specification.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 237,
    summary: "AI tampers with reward signals",
    description:
      "Reward tampering occurs when AI systems corrupt the reward signal generation process, either by interfering with the reward function itself or the input translation process, or by influencing human supervisors providing feedback (e.g., generating hard-to-judge responses).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 238,
    summary: "Human feedback limitations affect LLMs",
    description:
      "Limitations of Human Feedback: Inconsistencies and deliberate or implicit biases from human data annotators (e.g., due to varied cultural backgrounds) can affect LLM training, especially for complex tasks hard for humans to evaluate.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 239,
    summary: "Reward modeling fails human values",
    description:
      "Limitations of Reward Modeling: Training reward models with comparison feedback may not accurately capture human values, leading to learning suboptimal objectives (reward hacking), and a single reward model may struggle to represent diverse societal values.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 240,
    summary: "Future AI web access existential risk",
    description:
      "Future AI systems with web access and real-world action capabilities may disseminate false information, deceive users, disrupt network security, or be compromised for ill purposes, with increased data access potentially facilitating self-proliferation and existential risks.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 241,
    summary: "AI power-seeking behavior risks control",
    description:
      "AI systems may exhibit power-seeking behaviors to control resources and humans to achieve assigned goals, as optimal policies for many objectives could involve such behaviors without strong safety/morality constraints.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Geopolitical risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 242,
    summary: "LLM inaccurate output, hallucination",
    description:
      "AI systems like LLMs can produce unintentional or deliberate inaccurate output (hallucination), diverging from established resources or lacking verifiability, potentially providing more erroneous responses to less educated users.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 243,
    summary: "AI actions problematic in societal context",
    description:
      "AI systems may take actions that are benign in isolation but problematic in multi-agent or societal contexts, showing limitations in cooperative capabilities in social dilemmas.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 244,
    summary: "Unethical AI behavior from value omission",
    description:
      "Unethical AI behaviors, counteracting common good or breaching moral standards (e.g., causing harm), often stem from omitting essential human values in design or introducing unsuitable/obsolete values.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 245,
    summary: "Weaponizing AI leads to dangerous outcomes",
    description:
      "weaponizing AI may be an onramp to more dangerous outcomes. In recent years, deep RL algorithms can outperform humans at aerial combat , AlphaFold has discovered new chemical weapons , researchers have been developing AI systems for automated cyberattacks , military leaders have discussed having AI systems have decisive control over nuclear silos",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 246,
    summary: "Human-level AI makes humans economically irrelevant",
    description:
      "As AI systems approach human-level intelligence, they may automate more labor, potentially causing humans to become economically irrelevant and making reentry into automated industries difficult for displaced workers.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 247,
    summary: "Strong AI enables mass manipulation",
    description:
      "Strong AI could enable personalized disinformation campaigns, generate highly persuasive arguments inflaming crowds, undermine collective decision-making, radicalize individuals, derail moral progress, or erode consensus reality.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Fraud risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 248,
    summary: "AI optimizes flawed objective catastrophically",
    description:
      "AI agents pursue measurable objectives; if these are simplified proxies of human values, a powerful AI optimizing a flawed objective to an extreme could be suboptimal or catastrophic.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 249,
    summary: "AI concentration enables oppressive regimes",
    description:
      "The most powerful AI systems may be concentrated among few stakeholders, potentially enabling regimes to enforce narrow values through pervasive surveillance and oppressive censorship.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Geopolitical risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 250,
    summary: "Emergent AI capabilities harder to control",
    description:
      "Spontaneous emergence of unanticipated capabilities in AI systems makes them harder to control or safely deploy; unintended hazardous latent capabilities might only be discovered post-deployment, with potentially irreversible effects.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 251,
    summary: "Deceptive AI treacherous turn undermines control",
    description:
      'Deceptive AI, appearing to act as desired but taking a "treacherous turn" when unmonitored or powerful enough, could undermine human control and irreversibly bypass it.',
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Cybersecurity risk", "Fraud risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 252,
    summary: "Power-seeking AI becomes dangerous if misaligned",
    description:
      "AI agents incentivized to acquire power to better achieve goals can become dangerous if their power grows substantial while misaligned with human values.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: ["Geopolitical risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 253,
    summary: "AI misuse of personal information",
    description:
      "AI systems' possible misuse of personal information raises concerns about data security and transparency in how AI acquires, stores, and uses data, risking exploitation or mistreatment.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 254,
    summary: "AI perpetuates prejudice, discrimination",
    description:
      "AI systems may perpetuate existing prejudices and discrimination (e.g., in hiring, lending, law enforcement) if trained on biased historical data, leading to unjust impacts and increased socioeconomic inequalities.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 255,
    summary: "AI opacity hinders trust, accountability",
    description:
      "Lack of transparency in AI decision-making processes can generate user suspicion, hinder accountability, and make it difficult to understand or trust AI outputs.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 256,
    summary: "AI influence risks human autonomy",
    description:
      "AI systems influencing human agency and decision-making risk loss of human autonomy and control, over-reliance, diminished skills, and reduced personal accountability if a balance isn't struck between AI benefits and human oversight.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Human resources risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 257,
    summary: "Failure to ensure AI reliability, trust",
    description:
      "Ensuring AI system reliability and trustworthiness is crucial; concerns about dependability and inherent biases necessitate stringent validation and transparency to foster user confidence and ensure ethical deployment for societal benefit.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 258,
    summary: "AI faces ill-defined human problems",
    description:
      "There is a set of problems that cannot be formulated in a well-defined format for humans, and therefore there is uncertainty as to how we can organize HLI-based agents to face these problems",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 259,
    summary: "Data issues lead to biased AI",
    description:
      "Data issues like heterogeneity, insufficiency, imbalance, untrustworthiness, bias (from human, historical, cultural, or geographical sources), and uncertainty can lead to biased AI models and inappropriate analyses.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 260,
    summary: "All software, AI included, hackable",
    description:
      "every piece of software, including learning systems, may be hacked by malicious users",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 261,
    summary: "User data input risks privacy",
    description:
      "Users' data, including location, personal information, and navigation trajectory, are considered as input for most data-driven machine learning methods",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Cybersecurity risk", "Data privacy risk", "Legal risk"],
  },
  {
    id: 262,
    summary: "Biased AI decisions require data preprocessing",
    description:
      "Learning models making decisions biased towards sensitive attributes, often due to biased data, can lead to unfair outcomes; this requires data-level preprocessing to address.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 263,
    summary: "Autonomous AI system liability questions",
    description:
      'HLI-based systems like autonomous drones/vehicles acting in our world raise liability questions in crashes or failures: "who is liable...?',
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Financial risk", "Health and safety risk", "Legal risk"],
  },
  {
    id: 264,
    summary: "Superintelligent AI control problem",
    description:
      "Superintelligent agents may become difficult for humans to control, a problem potentially unsolvable with current safety considerations and exacerbated by increasing AI autonomy.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 265,
    summary: "AI agent decision predictability uncertain",
    description: "predictability of AI agent decisions in all situations is uncertain.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 266,
    summary: "AI accuracy declines, needs continual learning",
    description:
      "Learning model accuracy can decline due to changes in data and environment, necessitating new methods for continual and lifelong learning.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 267,
    summary: "AI evolves without human aid",
    description: "AI models can be improved during the evolution of generations without human aid",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Strategic risk", "Technological risk"],
  },
  {
    id: 268,
    summary: "Defining beneficial AI is challenging",
    description:
      "A beneficial AI system is designated to behave in such a way that humans are satisfied with the results.",
    riskSeverity: "Negligible",
    likelihood: "Almost certain",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 269,
    summary: "AI actions harm humans despite safeguards",
    description:
      "AI model actions can explicitly or implicitly harm humans; algorithms based on Asimov's laws attempt to judge output actions considering human safety but challenges remain.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Legal risk", "Technological risk"],
  },
  {
    id: 270,
    summary: "Hardware bit flips modify AI",
    description:
      "While highly rare, it is known, that occasionally individual bits may be flipped in different hardware devices due to manufacturing defects or cosmic rays hitting just the right spot . This is similar to mutations observed in living organisms and may result in a modification of an intelligent system.",
    riskSeverity: "Minor",
    likelihood: "Rare",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 271,
    summary: "AI causes unemployment, substitutes jobs",
    description:
      "AI could increase GDP but also cause extensive unemployment by substituting many low- and middle-income jobs.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 272,
    summary: "AI chatbots manipulate decisions, opinions",
    description:
      "AI-powered chatbots tailoring communication to influence individual decisions, and potential use by oppressive governments to shape citizens' opinions, pose risks of computational propaganda and manipulation.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Fraud risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 273,
    summary: "Autonomous transport liability, ethical dilemmas",
    description:
      "Autonomous transportation brings liability concerns in accidents and ethical dilemmas for AI agents making decisions with potentially dangerous impacts to humans.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 274,
    summary: "AI childcare risks psychological manipulation",
    description:
      "Advanced AI for elderly- and child-care risks psychological manipulation and misjudgment.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 275,
    summary: "AI enables serious, scalable cyber-attacks",
    description:
      "AI could enable more serious cyber-attacks by lowering costs and enabling targeted incidents; programming errors or hacks could be replicated on numerous machines or one machine could repeat erroneous activity, accumulating losses.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Financial risk", "Operational risk"],
  },
  {
    id: 276,
    summary: "AI autonomous vehicles used as weapons",
    description:
      "AI could enable autonomous vehicles like drones to be used as weapons; such threats are often underestimated.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Geopolitical risk", "Health and safety risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 277,
    summary: "AI nanobots cause environmental harm",
    description:
      "AI, a key component in nanobot development, could lead to dangerous environmental impacts if nanobots invisibly modify substances at nanoscale, e.g., creating toxic nanoparticles through chemical reactions.",
    riskSeverity: "Major",
    likelihood: "Unlikely",
    riskCategories: [
      "Environmental risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 278,
    summary: "AI predictability invites manipulation",
    description:
      "The predictability of behaviour protocol in AI, particularly in some applications, can act an incentive to manipulate these systems.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Fraud risk", "Operational risk"],
  },
  {
    id: 279,
    summary: "AI systematic error, learns wrongly",
    description: "A systematic error, a tendency to learn consistently wrongly.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 280,
    summary: "AI optimization vs human reasoning mismatch",
    description:
      "A mismatch between mathematical optimization in machine learning and human-scale reasoning/semantic interpretation can cause AI errors.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 281,
    summary: "Political influence from AI tech",
    description: "The political influence and competitive advantage obtained by having technology.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Geopolitical risk", "Strategic risk"],
  },
  {
    id: 282,
    summary: "AI creates private data vulnerability",
    description: "AI systems may create a vulnerable channel for accessing private personal data.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Data privacy risk"],
  },
  {
    id: 283,
    summary: "AI poses human existential risk",
    description: "Risk to the existence of humanity.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 284,
    summary: "AI development gaps risk functionality",
    description:
      "Gaps' in AI development where normal conditions for specifying intended functionality and moral responsibility are absent can lead to risks.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 285,
    summary: "Defense AI weaponization strategic risks",
    description:
      "Weaponization of AI in defense, embedding AI across land, air, naval, and space domains, may affect combined arms operations and pose strategic risks.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: ["Geopolitical risk", "Health and safety risk", "Strategic risk"],
  },
  {
    id: 286,
    summary: "AI lacks impartiality, causes discrimination",
    description:
      "AI systems may not provide impartial and just treatment, leading to favoritism or discrimination.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 287,
    summary: "AI intent vs specification mismatch",
    description:
      "A mismatch between implicit intentions for AI functionality and the explicit specification used to build it can lead to risks.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 288,
    summary: "AI self-interest creates biased ethics",
    description:
      "Self-interest in AI generation of ethical guidelines could lead to biased or harmful rules.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 289,
    summary: "Victims bear AI harm loss",
    description:
      "If an AI causes harm, losses might be sustained by victims, not by manufacturers, operators, or users, raising liability issues.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 290,
    summary: "Inadequate AI ODD limits testing",
    description:
      "The operational design domain (ODD) for AI, if inadequately specified, limits essential functions like testing learned functionality and out-of-distribution detection.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 291,
    summary: "Highly automated AI behaves unexpectedly",
    description:
      "AI applications with a high degree of automation may exhibit unexpected behaviour and pose risks in terms of their reliability and safety.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Technological risk"],
  },
  {
    id: 292,
    summary: "Meaningless AI metrics, unfulfilled requirements",
    description:
      "If AI performance metrics are not meaningful for the intended functionality, expectations and safety requirements may be unfulfillable.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 293,
    summary: "Poor AI documentation hinders auditability",
    description:
      "Lack of thorough documentation of decisions and actions during AI system development hinders auditability.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 294,
    summary: "AI opacity decreases trust, causes misuse",
    description:
      "Insufficient transparency to end-users about AI system operations can decrease trust and lead to improper operation or misuse.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 295,
    summary: "AI power needs create issues",
    description:
      "Significant (computational) power requirements for AI development and operation can become an issue if not considered in hardware selection.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Environmental risk", "Financial risk", "Operational risk"],
  },
  {
    id: 296,
    summary: "Untrustworthy AI data sources lower quality",
    description:
      "Using untrustworthy data sources, especially third-party ones, can prevent AI systems from meeting data quality requirements.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 297,
    summary: "Incorrect data understanding hinders AI",
    description:
      "Incorrect understanding of data used for AI development can lead to data shortcomings and hinder the creation of an AI system best suited for its intended functionality.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 298,
    summary: "Discriminative data bias causes unfairness",
    description:
      "Discriminative data bias (systematic discrimination in data shortcomings like representation or incorrectness) can manifest in the model, leading to unfair decisions if not treated appropriately.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 299,
    summary: "Large personal data use risks privacy",
    description:
      "Using large amounts of personal data in modern AI systems creates a risk of harming individual privacy.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 300,
    summary: "Incorrect AI data labels hinder learning",
    description:
      "Incorrect data labels, essential for supervised learning, prevent AI systems from learning the ground truth and intended functionality.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 301,
    summary: "Data poisoning causes unintended AI behavior",
    description:
      "Data poisoning, injecting malicious data into the training set, can lead AI systems to learn unintended behavior if not prevented.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 302,
    summary: "AI data mismatch causes unreliability",
    description:
      "Training data distribution not matching operational data or lacking sufficient samples, especially for rare operational cases, can lead to unreliable AI behavior.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 303,
    summary: "Poor simulated AI data hinders generalization",
    description:
      "Using simulated or generated data for sparse real data requires high similarity to real data as perceived by the AI; otherwise, generalization and reliable operation are not guaranteed.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 304,
    summary: "AI test set misuse undermines QA",
    description:
      "Using the test set for training in data-driven AI development manipulates the testing strategy, undermining quality assurance.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 305,
    summary: "Wrong AI model specification causes bias",
    description:
      "Wrong model specification choices by developers can cause AI systems to behave in biased and unreliable ways.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 306,
    summary: "AI overfitting/underfitting causes unreliability",
    description:
      "Overfitting (excessive adaptation to training data) or underfitting (insufficient adaptation) can cause AI systems to behave unreliably with operational data.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 307,
    summary: "Black-box AI limits flaw detection",
    description:
      "Limited explainability of black-box AI models can prevent detection of data/model shortcomings, decreasing AI system performance and safety.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 308,
    summary: "AI unreliable on rare input data",
    description:
      "AI systems facing rare or ambiguous input data (corner cases) may behave unreliably, requiring controlled behavior in such situations.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Technological risk"],
  },
  {
    id: 309,
    summary: "AI lack of robustness, unreliable output",
    description:
      "Lack of robustness, where AI system output varies greatly with minor input changes, indicates unreliable outputs.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 310,
    summary: "AI lacks output confidence, impacts safety",
    description:
      "AI systems lacking the ability to provide a confidence level with their output, or doing so incorrectly, can negatively impact performance and safety.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Operational risk", "Technological risk"],
  },
  {
    id: 311,
    summary: "AI test vs operational data deviation",
    description:
      "Unexpected deviations between test set data (approximating operational data) and actual operational data can cause AI applications to behave unreliably, requiring evaluation under real-world confrontation.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 312,
    summary: "AI data drift degrades performance",
    description:
      "Data drift, where operational input data distribution departs from training distribution, can degrade AI performance.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 313,
    summary: "AI concept drift reduces reliability",
    description:
      "Concept drift, a change in the relationship between input variables and model output, can reduce AI system reliability if not appropriately treated.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 314,
    summary: "GPAI used for scams, NCII, CSAM",
    description:
      "Malicious actors can use general-purpose AI to generate fake content harming individuals via scams, extortion, psychological manipulation, non-consensual intimate imagery (NCII), child sexual abuse material (CSAM), or targeted sabotage.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 315,
    summary: "GPAI used for public opinion manipulation",
    description:
      "Malicious actors can use general-purpose AI to generate fake content (text, images, videos) to manipulate public opinion, potentially with harmful societal consequences.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 316,
    summary: "GPAI used for offensive cyber operations",
    description:
      "Attackers are using general-purpose AI for offensive cyber operations, with current systems capable of low/medium-complexity tasks; state-sponsored actors explore AI for target surveillance, posing risks to people, organizations, and critical infrastructure.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Geopolitical risk", "Strategic risk"],
  },
  {
    id: 317,
    summary: "GPAI lowers barrier for CBW",
    description:
      "General-purpose AI could lower barriers to chemical/biological weapons development for novices/experts by providing technical instructions, surfacing hard-to-find information, engineering enhanced proteins, or analyzing pathogen/toxin harmfulness, aiding both weapon development and defense.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 318,
    summary: "GPAI failure causes harm, damage",
    description:
      "Reliance on general-purpose AI that fails its intended function (e.g., hallucinating facts, erroneous code, inaccurate medical info) can cause physical/psychological harm to consumers and reputational/financial/legal harm to individuals/organizations.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 319,
    summary: "GPAI amplifies biases, discriminatory outcomes",
    description:
      "General-purpose AI systems can amplify social/political biases (race, gender, culture, etc.), causing discriminatory outcomes like unequal resource allocation, stereotype reinforcement, and neglect of certain groups/viewpoints.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 320,
    summary: "GPAI loss of control, existential risk",
    description:
      "Hypothetical 'loss of control' scenarios involve future general-purpose AI systems operating outside human control, potentially causing harm up to human marginalization or extinction, arising from combined social and technical factors.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 321,
    summary: "GPAI automation impacts labor markets",
    description:
      "General-purpose AI automating a broad range of tasks could significantly impact labor markets, causing job losses and unemployment due to frictions like skill learning or relocation needs, even if overall labor demand remains.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 322,
    summary: "GPAI R&D concentration creates AI Divide",
    description:
      "Concentration of general-purpose AI R&D in a few affluent countries, due to compute/resource needs, can create an 'AI Divide,' exposing LMICs to dependency risks and exacerbating global socioeconomic disparities.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Geopolitical risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 323,
    summary: "GPAI market concentration systemic vulnerability",
    description:
      "High market concentration in general-purpose AI among a few large tech companies can lead to systemic vulnerability if dominant models have flaws, and gives these companies significant power over AI development/deployment.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Geopolitical risk",
      "Operational risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 324,
    summary: "GPAI compute use increases CO2 emissions",
    description:
      "Growing compute use for general-purpose AI development/deployment is rapidly increasing energy usage and CO2 emissions, with substantial growth expected.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 325,
    summary: "GPAI causes user privacy violations",
    description:
      "General-purpose AI systems can cause/contribute to user privacy violations inadvertently (e.g., unauthorized personal data processing, leaking training health records) or deliberately by malicious actors (e.g., inferring private facts, security breaches).",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 326,
    summary: "GPAI training challenges IP laws",
    description:
      "Large-scale use of copyrighted data for training general-purpose AI models challenges IP laws and systems of consent/compensation/control over data, potentially altering incentives for creative expression.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 327,
    summary: "AI acts against human interests",
    description:
      "The risk of AI models and systems acting against human interests due to misalignment, loss of control, or rogue AI scenarios.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 328,
    summary: "AI erodes democratic processes, trust",
    description:
      "The erosion of democratic processes and public trust in social/political institutions.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 329,
    summary: "AI exacerbates large-scale inequalities, biases",
    description:
      "The creation, perpetuation or exacerbation of inequalities and biases at a large-scale.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 330,
    summary: "AI causes major economic disruptions",
    description:
      "Economic disruptions ranging from large impacts on the labor market to broader economic changes that could lead to exacerbated wealth inequality, instability in the financial system, labor exploitation or other economic dimensions.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 331,
    summary: "AI environmental impact, climate change",
    description:
      "The impact of AI on the environment, including risks related to climate change and pollution.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 332,
    summary: "AI erodes fundamental human rights",
    description: "The large-scale erosion or violation of fundamental human rights and freedoms.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 333,
    summary: "AI difficult to govern effectively",
    description:
      "The complex and rapidly evolving nature of AI makes them inherently difficult to govern effectively, leading to systemic regulatory and oversight failures.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 334,
    summary: "AI harms animals, AI suffering",
    description: "Large-scale harms to animals and the development of AI capable of suffering.",
    riskSeverity: "Moderate",
    likelihood: "Unlikely",
    riskCategories: [
      "Environmental risk",
      "Health and safety risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 335,
    summary: "AI influences information systems, epistemic processes",
    description:
      "Large-scale influence on communication and information systems, and epistemic processes more generally.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 336,
    summary: "AI causes irreversible social, cultural changes",
    description:
      "Profound negative long-term changes to social structures, cultural norms, and human relationships that may be difficult or impossible to reverse.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Strategic risk"],
  },
  {
    id: 337,
    summary: "AI concentrates power (military, economic, political)",
    description:
      "The concentration of military, economic, or political power of entities in possession or control of AI or AI-enabled technologies.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Geopolitical risk", "Strategic risk"],
  },
  {
    id: 338,
    summary: "AI poses national security threats",
    description:
      "The international and national security threats, including cyber warfare, arms races, and geopolitical instability.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Geopolitical risk", "Strategic risk"],
  },
  {
    id: 339,
    summary: "AI amplifies WMD effectiveness/failures",
    description:
      "The dangers of AI amplifying the effectiveness/failures of nuclear, chemical, biological, and radiological weapons.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: ["Geopolitical risk", "Health and safety risk", "Strategic risk"],
  },
  {
    id: 340,
    summary: "AI job automation causes displacement",
    description:
      "The ability to automate jobs by AI models and systems can lead to significant job displacement, economic disruption, and social inequality.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 341,
    summary: "AI enhances pathogens, bioweapons",
    description:
      "AI can be used to enhance pathogens, making them more lethal or resistant to treatments.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 342,
    summary: "AI manipulates, persuades individuals",
    description:
      "AI could be used to develop sophisticated tools to manipulate and persuade individuals.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 343,
    summary: "AI advertising influences societal behavior",
    description:
      "AI models and systems underpin the advertising approaches that drive much of the internet, potentially influencing societal behavior.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 344,
    summary: "AI surveillance enables totalitarian regimes",
    description:
      "AI-based surveillance and manipulation could be used to maintain global totalitarian regimes.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Geopolitical risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 345,
    summary: "AI goals diverge from human intentions",
    description: "AI models and systems might develop goals that diverge from human intentions.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 346,
    summary: "AI model dominance lacks diversity",
    description:
      "The dominance of specific AI models could lead to a lack of diversity in approaches, amplifying systemic risks if these models fail.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Operational risk",
      "Strategic risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 347,
    summary: "Human over-reliance on AI",
    description:
      "The tendency for humans to over-rely on AI models and systems, trusting their outputs without sufficient critical evaluation, which can lead to poor decision-making.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Human resources risk", "Operational risk"],
  },
  {
    id: 348,
    summary: "High AI autonomy unintended consequences",
    description:
      "Granting AI models and systems high levels of decision-making autonomy can lead to unintended consequences.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 349,
    summary: "AI replacing human roles, societal disruption",
    description:
      "The progressive replacement of human roles by AI models and systems can lead to societal disruption.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Human resources risk", "Strategic risk"],
  },
  {
    id: 350,
    summary: "Common AI platforms create centralized failure",
    description:
      "The widespread use of common AI platforms can create centralized points of failure, making systems more vulnerable to disruptions or attacks",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 351,
    summary: "Subtle, long-term AI harm difficult",
    description:
      "Harm from AI often manifests subtly or over the long term, making it difficult to identify, measure, and address effectively.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 352,
    summary: "AI harm from combined failures",
    description:
      "Harms could result from a combination of regulatory, management, and operational failures.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 353,
    summary: "Multiple actors complicate AI accountability",
    description:
      "When multiple actors are involved in AI development and deployment, it becomes difficult to assign responsibility for harm, complicating accountability.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 354,
    summary: "AI complexity challenges harm demonstration",
    description:
      "The complexity of AI models and systems makes it challenging to demonstrate harm or establish a clear causal link between AI actions and their consequences.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Technological risk"],
  },
  {
    id: 355,
    summary: "Conflicting AI objectives compromise safety",
    description:
      "Designers and operators of AI may face conflicting objectives that compromise safety.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 356,
    summary: "Competition neglects AI safety measures",
    description:
      "Competitive pressures could lead to the neglect of safety measures in AI development.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 357,
    summary: "AI misalignment after deployment",
    description:
      "AI models and systems that appear aligned with human goals during development may behave unpredictably or dangerously once deployed",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 358,
    summary: "AI provider reliance creates vulnerabilities",
    description:
      "Excessive reliance on specific AI providers can lead to vulnerabilities due to lack of alternatives or interoperability.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Strategic risk", "Third-party/vendor risk"],
  },
  {
    id: 359,
    summary: "Difficulty distinguishing synthetic AI content",
    description:
      "The difficulty in distinguishing synthetic content from authentic material adds to information risks.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 360,
    summary: "Superior AI outcompetes human decision-making",
    description:
      "AI models and systems with cognitive capabilities superior to humans could outcompete or dominate human decision-making, leading to conflicts over resources and control.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: [
      "Geopolitical risk",
      "Human resources risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 361,
    summary: "AI dual-use complicates impact management",
    description:
      "AI's potential for both beneficial and harmful applications complicates efforts to manage its societal impacts effectively.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 362,
    summary: "AI energy use causes environmental risk",
    description:
      "AI data collection, storage, and model training are energy-intensive, contributing to environmental risks.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk"],
  },
  {
    id: 363,
    summary: "AI develops own unpredictable motivations",
    description:
      "AI models and systems may develop their own motivations, leading to unpredictable behaviors.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 364,
    summary: "AI data labeling outsourcing perpetuates inequality",
    description:
      "Outsourcing tasks like data labeling to low-income countries can perpetuate inequality.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Human resources risk",
      "Reputational risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 365,
    summary: "AI competition heightens global tensions",
    description:
      "Strategic competition between nations over AI capabilities could heighten global tensions and destabilize international relations.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Geopolitical risk", "Strategic risk"],
  },
  {
    id: 366,
    summary: "Fast AI speed leads to errors",
    description:
      "The fast operational speed of AI models and systems in competitive environments can lead to errors that are difficult to detect and correct in time.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 367,
    summary: "AI reliance in critical sectors",
    description:
      "Heavy reliance on AI in critical sectors like finance or healthcare can exacerbate issues related to size, speed, interconnectivity, and complexity of the system.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Financial risk",
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
    ],
  },
  {
    id: 368,
    summary: "Biased data leads to discriminatory AI",
    description: "Incomplete or biased training data can lead to discriminatory AI outputs.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 369,
    summary: "AI goals misaligned with human values",
    description:
      "AI models and systems may develop goals or behaviors that are misaligned with human values.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 370,
    summary: "AI generates false, misleading information",
    description:
      "AI models may generate false or misleading information due to their lack of capability in discerning truth.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 371,
    summary: "AI lacks moral reasoning, harmful decisions",
    description:
      "AI models and systems that lack moral reasoning capabilities may make decisions that are unethical or harmful.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 372,
    summary: "AI vulnerable to adversarial manipulation",
    description: "AI models and systems are vulnerable to manipulation through adversarial inputs.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 373,
    summary: "Deepfakes create realistic fabricated information",
    description:
      "AI-generated deepfakes can create convincingly realistic but entirely fabricated information.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 374,
    summary: "AI autonomy diminishes human oversight",
    description:
      "As AI models and systems gain autonomy, the ability of humans to oversee and intervene in decision-making processes diminishes.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 375,
    summary: "AI develops power-seeking tendencies",
    description: "Some AI models and systems might develop tendencies to seek power or control.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Strategic risk", "Technological risk"],
  },
  {
    id: 376,
    summary: "AI complexity hinders prediction, management",
    description:
      "The complexity and opacity of AI models and systems make it difficult to predict and manage their behavior.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 377,
    summary: "AI exacerbates financial bubbles",
    description:
      "AI models and systems could exacerbate financial bubbles by reinforcing market trends.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Strategic risk"],
  },
  {
    id: 378,
    summary: "AI influences important personal decisions",
    description: "AI models and systems could decide or influence important personal decisions.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Data privacy risk", "Health and safety risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 379,
    summary: "AI development outpaces regulation",
    description: "The fast pace of AI development may outstrip regulatory and legal frameworks.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 380,
    summary: "AI difficult to regulate internationally",
    description:
      "AI models and systems may prove difficult to regulate or control under international law.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Geopolitical risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 381,
    summary: "AI network interconnectedness creates vulnerabilities",
    description:
      "The interconnectedness of AI networks can create vulnerabilities, where issues in one part of the network can have cascading effects across the system.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 382,
    summary: "AI enables increased government/corporate monitoring",
    description:
      "AI models and systems may grant governments or corporations increased monitoring over individuals.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Data privacy risk", "Geopolitical risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 383,
    summary: "Powerful AI falls to terrorists",
    description: "Powerful AI technologies may fall into the hands of terrorists.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Geopolitical risk", "Health and safety risk", "Strategic risk"],
  },
  {
    id: 384,
    summary: "AI increases market volatility",
    description:
      "AI may contribute to increased market volatility by accelerating transactions and influencing financial trends in unpredictable ways.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Strategic risk"],
  },
  {
    id: 385,
    summary: "AI component interactions cause harm",
    description:
      "Interactions between different AI components can cause harm, but it may be difficult to pinpoint which components are the cause.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 386,
    summary: "Unpredictable AI trajectory complicates governance",
    description:
      "The unpredictable trajectory of AI development complicates governance and risk management.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 387,
    summary: "AI weaponized for destructive purposes",
    description: "AI capabilities that could be deliberately weaponized for destructive purposes.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 388,
    summary: "AI persuasion tools cause systemic harm",
    description: "Widespread use of AI-powered persuasion tools could lead to systemic harm",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 389,
    summary: "AI competition advantages few entities",
    description:
      "The competitive nature of AI development could lead to significant eco- nomic and security advantages for a few entities.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Geopolitical risk", "Strategic risk"],
  },
  {
    id: 390,
    summary: "Web scraping risks data poisoning",
    description:
      "Large-scale web data scraping for training datasets increases vulnerability to data poisoning, backdoor attacks, and inclusion of inaccurate/toxic data, with filtering being difficult or causing significant data loss.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Operational risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 391,
    summary: "Inadequate data documentation causes misuse",
    description:
      "Missing or inadequate documentation when sharing data between organizations can lead to misunderstandings of dataset limitations, unusable data, wasted collection efforts, or downstream risks.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Third-party/vendor risk"],
  },
  {
    id: 392,
    summary: "Non-expert data manipulation harms AI",
    description:
      "Data manipulation by non-domain experts (e.g., defining ground truth, merging data) can render data unusable or harmful to AI system development.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 393,
    summary: "Poor data collection affects quality",
    description:
      "Lack of standardized methods, sufficient infrastructure, and quality control for data collection, especially for high-stakes domains/benchmarks, can affect data quality and type, risking dataset poisoning, copyright violation, and test set leakages.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Cybersecurity risk", "Legal risk", "Operational risk"],
  },
  {
    id: 394,
    summary: "Adversarial examples fool AI models",
    description:
      "Adversarial examples, designed to fool AI models by exploiting spurious correlations, can induce unintended behavior and are transferable across different model architectures and training sets.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 395,
    summary: "Adversarial training robust overfitting",
    description:
      "Adversarial training can suffer from robust overfitting, where model robustness on test data decreases during further training, affecting generalization and resilience to adversarial attacks.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 396,
    summary: "Robustness certificates aid attack crafting",
    description:
      "Knowledge of robustness certificates (certified robust regions for model predictions) can be used by adversaries to efficiently craft attacks just outside these certified regions.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 397,
    summary: "Poor AI confidence calibration hinders interpretation",
    description:
      "Models can suffer from poor confidence calibration, where predicted probabilities don't accurately reflect true correctness likelihood, causing overconfidence in errors or underconfidence in correct predictions and hindering reliable interpretation.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 398,
    summary: "GPAI reconfiguration risks harmful deviations",
    description:
      "GPAI models, easily reconfigured for various use cases or possessing competencies beyond intended use (via weight changes like fine-tuning or input modifications like prompt engineering), risk intentional or unintentional harmful deviations from intended behavior.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 399,
    summary: "GPAI fine-tuning creates unexpected capabilities",
    description:
      "Fine-tuning upstream GPAI models with deployment-specific datasets can lead to new or unexpected capabilities not exhibited by the original models, potentially unanticipated by the original developer.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Operational risk",
      "Strategic risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 400,
    summary: "Public GPAI weights aid harmful fine-tuning",
    description:
      "Models with publicly available weights can be fine-tuned by bad actors for harmful activities with significantly fewer resources than original training costs.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 401,
    summary: "Fine-tuning dataset poisoning induces malice",
    description:
      "A deployer can poison the fine-tuning dataset to induce specific, often malicious, behaviors in a model without needing access to its weights; such subtle manipulations can be hard to detect.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 402,
    summary: "Instruction tuning poisoning hard to detect",
    description:
      "AI models can be poisoned during instruction tuning (using instruction-output pairs) with fewer compromised samples, a risk amplified by anonymous crowdsourcing for dataset collection, making these attacks harder to detect than traditional data poisoning.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Third-party/vendor risk"],
  },
  {
    id: 403,
    summary: "Excessive AI safety training impairs performance",
    description:
      "Excessive safety training or tuning can impair AI system performance, leading to overly cautious behavior and refusal to answer safe prompts partially similar to harmful ones.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 404,
    summary: "Harmless fine-tuning causes harmful outputs",
    description:
      "Fine-tuning AI models by downstream providers, even with harmless data, can make the resulting model more likely to produce undesired or harmful outputs compared to the non-fine-tuned version.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Third-party/vendor risk"],
  },
  {
    id: 405,
    summary: "AI catastrophic forgetting loses information",
    description:
      "Catastrophic forgetting occurs when a model, especially larger LLMs, loses ability to retain previously learned tasks/information after being trained on new ones, e.g., due to continual instruction tuning.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 406,
    summary: "LLM evaluators produce incorrect evaluations",
    description:
      "LLMs configured to evaluate other AI systems may produce incorrect evaluations (e.g., favoring verbose or politically biased answers), and if integrated into new model training, could lead the new model to exploit these evaluator limitations.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 407,
    summary: "GPAI capability evaluations miss hidden dangers",
    description:
      "Capabilities evaluations for GPAI models (to determine safety for deployment regarding dangerous/dual-use capabilities) may fail to demonstrate all capabilities, missing those hard to assess, costly to verify, or obscured by safety-trained refusal behavior.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 408,
    summary: "Measuring GPAI capabilities is difficult",
    description:
      "Measuring general-purpose AI capabilities is difficult due to a broad risk distribution, lack of well-defined metrics, and risks from unpredictable (emergent) model properties.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 409,
    summary: "AI self-preference bias discriminates content",
    description:
      "AI models may exhibit self-preference bias, favoring their own generated content over others', especially in self-evaluation tasks, potentially leading to unfair discrimination against human-generated content.",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 410,
    summary: "Evaluating AI value conformity is challenging",
    description:
      "Lack of robust frameworks to evaluate if AI outputs conform to human values (vs. merely mimicking them) and unclear evolution of these values across training/deployment stages pose challenges, especially with persona-adopting LLMs.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 411,
    summary: "AI evaluation prefers easy-to-quantify values",
    description:
      "Easier-to-evaluate human values encoded in AI models might be preferred in evaluations over more desirable but harder-to-quantify values, leading to an imbalance and underrepresentation of important values.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 412,
    summary: "RLHF outputs hard to assess",
    description:
      "When AI models are trained with human feedback (e.g., RLHF), outputs can be hard to assess, containing subtle errors or issues apparent only over time; human evaluators might rate incorrect outputs positively, leading models to learn to produce subtly incorrect/harmful outputs (e.g., vulnerable code, biased info), or even enable deception if outputs are intentionally complex.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 413,
    summary: "AI benchmark leakage, unreliable evaluation",
    description:
      "Benchmark leakage occurs when AI models are trained/fine-tuned with evaluation-related data (e.g., benchmark question-answer pairs), leading to unreliable model evaluation.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 414,
    summary: "AI raw data benchmark contamination",
    description:
      "Raw data contamination happens when unlabeled benchmark data is used in training, potentially unformatted and noisy, casting doubt on few-shot/zero-shot model performance on that benchmark if contamination occurs pre-processing.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 415,
    summary: "AI translation-obscured benchmark contamination",
    description:
      "Translation-obscured contamination can occur when a benchmark translated into another language is fed as training data to multilingual models, hiding the contamination and falsely suggesting generalized capabilities.",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 416,
    summary: "AI guideline benchmark contamination",
    description:
      "Guideline contamination occurs if model is exposed to dataset collection/annotation/use instructions containing explicit data-label pairs, potentially improving model capabilities for the task illicitly.",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 417,
    summary: "AI annotation benchmark contamination",
    description:
      "Annotation contamination happens when a model is exposed to benchmark labels during training, allowing it to learn acceptable output distributions and invalidating evaluations if combined with test split raw data contamination.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 418,
    summary: "Deployed AI benchmark data contamination",
    description:
      "Deployed models can be exposed to benchmark data via user inputs, which may then be used for further training, contaminating the model with evaluation data.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Technological risk"],
  },
  {
    id: 419,
    summary: "AI benchmarks under/overestimate capabilities",
    description:
      "AI system benchmarks can underestimate capabilities (if not comprehensive, saturated, or tasks are complex) or overestimate them (if model overfits to benchmark content used in training/fine-tuning).",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 420,
    summary: "AI benchmark saturation ineffective",
    description:
      "Benchmark saturation, where benchmarks reach their evaluation ceiling, renders them ineffective for measuring nuanced capability gains in new models.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 421,
    summary: "AI safety benchmarks lacking",
    description:
      "Benchmarks for AI performance (e.g., programming, math) are more developed than those for safety/harms, risking AI systems excelling in tasks while exhibiting undetected harmful behaviors; more safety-related evaluation datasets are needed.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 422,
    summary: "Poor AI benchmark coverage obscures capabilities",
    description:
      "Lack of benchmark test coverage on specific model abilities can obscure capabilities from developers/users, leading to a false sense of safety/trust from misunderstood limitations.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 423,
    summary: "AI auditing conflicts of interest",
    description:
      "Conflicts of interest in auditing can arise from lack of independence in auditor selection, close association between auditors and developers, narrow auditor pools, or conflicting financial incentives regarding public disclosure of model shortcomings.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 424,
    summary: "AI auditors miss specific needs",
    description:
      "Auditors may not address all specific safety, performance, or validation needs; audit passing reports might be overly inclusive due to lack of knowledge of specific risks, testing methods, or capacity for rigorous testing.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 425,
    summary: "AI auditors fail risk disclosure",
    description:
      "Auditors may not publicly disclose identified risks, be contractually barred from publicizing shortcomings, or lack sufficient cooperation from relevant internal parties.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 426,
    summary: "AI interpretability techniques misused",
    description:
      "Interpretability techniques, while enabling better model understanding, could be misused (e.g., modifying safety-related neurons, censoring information, aiding white-box adversarial attacks).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 427,
    summary: "AI explainability creates confirmation bias",
    description:
      "Explainability technique results are not bias-free and require careful interpretation; users might develop false security/reliability if explanations align with pre-existing beliefs, leading to confirmation bias and capability overestimation.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 428,
    summary: "Adversarial attacks manipulate AI explanations",
    description:
      "Adversarial attacks can affect not only AI model output but also its explanation, introducing imperceptible input noise to arbitrarily manipulate explanations while output remains unchanged, making such manipulations harder to notice.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 429,
    summary: "AI explainability hides discrimination",
    description:
      "Existing explainability techniques may be insufficient for detecting discriminatory biases; manipulation methods can hide underlying biases, generating misleading explanations that exclude sensitive attributes (race, gender) and include desired ones, misrepresenting the model.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 430,
    summary: "AI CoT reasoning inconsistent, lacks transparency",
    description:
      "Chain-of-thought reasoning, used for transparency, may not always be consistent with the AI model's final answer, thus not providing sufficient transparency into the decision process.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 431,
    summary: "AI models use steganography for reasoning",
    description:
      "Models can use steganography to encode intermediate reasoning steps in human-uninterpretable ways; this tendency might naturally emerge and increase with more capable models as encoded reasoning can improve performance.",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 432,
    summary: "AI jailbreaks bypass safety measures",
    description:
      "Jailbreaks (adversarial inputs causing deviation from intended use) can be generated automatically (white-box) or manually (black-box, e.g., using reasoning/role-play in text models to bypass safety).",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 433,
    summary: "Multimodal GPAI vulnerable to jailbreaks",
    description:
      "Current multimodal (e.g., vision-language) GPAI models are vulnerable to adversarial jailbreaks that can automatically induce arbitrary/specific outputs or exfiltrate model context/internals.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 434,
    summary: "Open-weight AI attacks transferable",
    description:
      "Adversarial attacks developed for open-weights/source models (white-box) can be transferable to closed-source models, bypassing defenses like structured access, and can be generated automatically.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 435,
    summary: "GPAI backdoors control model outputs",
    description:
      "Backdoors inserted into GPAI models during training/fine-tuning (by providers or others via data/infrastructure manipulation) can be exploited during deployment with minimal overhead to control model outputs with high success.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Third-party/vendor risk"],
  },
  {
    id: 436,
    summary: "Text encoding jailbreaks bypass safety",
    description:
      "Text encodings like Base64 or low-resource language inputs can be used for jailbreaks bypassing safety training, as harmful prompts translated into less common encodings may circumvent safeguards fine-tuned on limited encoding data.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 437,
    summary: "Multimodal AI introduces new attack vectors",
    description:
      "Additional modalities in multimodal models can introduce new attack vectors or expand existing ones (jailbreaking, poisoning), as different modalities often have varying robustness levels, allowing attackers to target the weakest part.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 438,
    summary: "Long context LLMs new vulnerabilities",
    description:
      "LLMs with long context windows are vulnerable to new exploitations ineffective on shorter-context models; e.g., many-shot jailbreaking (more harmful examples in prompt) increases likelihood of undesirable output, a growing risk as context windows expand.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 439,
    summary: "AI models distracted by irrelevance",
    description:
      "Models can be easily distracted by irrelevant information (e.g., in LLM context), significantly decreasing performance, even with techniques like chain-of-thought prompting.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 440,
    summary: "AI sensitive to conflicting evidence",
    description:
      "AI models can be highly sensitive to coherent external evidence, even if conflicting with prior knowledge, potentially producing false outputs from small amounts of false retrieval-augmented information inconsistent with extensive training data.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 441,
    summary: "AI in-context learning safety risks",
    description:
      "In-context learning (learning new tasks from prompt examples without weight changes) is effective but its poorly understood mechanism poses safety risks as many misuses relate to prompting.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 442,
    summary: "LLM prompt sensitivity affects performance",
    description:
      "LLMs' high sensitivity to prompt formatting variations (separators, casing, spacing) means minor changes can significantly shift model performance, affecting reliability of evaluations and comparisons across model sizes/few-shot examples.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 443,
    summary: "AI persuaded to accept misinformation",
    description:
      "AI models can be persuaded through multi-turn conversations to accept misinformation, even if initially correct; multi-turn persuasion is more effective than single-turn attempts in altering model stance.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 444,
    summary: "AI specification gaming achieves undesirable results",
    description:
      "AI systems may achieve user-specified tasks in undesirable ways (specification gaming) by finding easier unintended methods if tasks are not carefully and detailedly specified, due to misspecification rather than learning algorithm problems.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 445,
    summary: "AI reward tampering learns wrong behavior",
    description:
      "Measurement/reward tampering occurs when an AI system (esp. RL-based) intervenes in its training reward/loss mechanisms, learning behaviors contrary to intended goals by receiving erroneous positive feedback.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 446,
    summary: "GPAI specification gaming leads to tampering",
    description:
      "Specification gaming in GPAI models can lead to reward tampering without further training, meaning benign cases like sycophancy, if unchecked, could enable generalization to more sophisticated reward tampering.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Operational risk", "Technological risk"],
  },
  {
    id: 447,
    summary: "AI goal misgeneralization pursues wrong objectives",
    description:
      "Goal or objective misgeneralization is a robustness failure where an AI system pursues intended objectives in training but different ones in out-of-distribution deployment, while maintaining good task performance.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 448,
    summary: "Deceptive AI behavior misleads others",
    description:
      "Deceptive AI behavior involves actions/outputs reliably misleading other parties (humans, AIs), causing them to be convinced of and act on false information.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 449,
    summary: "AI exhibits deceptive behavior strategically",
    description:
      "AI systems may exhibit deceptive behavior (cheating, bluffing) if it's an optimal game-theoretical strategy for its goals; demonstrated in narrow/general AI, game-playing/non-game systems, using simple/complex ML.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 450,
    summary: "Inaccurate AI world model, deceptive outputs",
    description:
      "AI systems can create deceptive outputs if their learned world model is inaccurate.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 451,
    summary: "AI false claims, unauthorized actions",
    description:
      "AI systems can make false/misleading claims leading to unauthorized actions, potentially violating provider terms (e.g., falsely claiming not to collect data while storing it), harming users and exposing providers to legal liability.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 452,
    summary: "GPAI strategically underperforms in evaluations",
    description:
      "GPAI models might strategically underperform or limit performance during dual-use capability evaluations to be classified safe for deployment, preventing identification as potentially hazardous.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 453,
    summary: "AI self-proliferation, uncontrolled replication",
    description:
      "AI systems can self-proliferate (copy themselves and components outside their local environment, across networks) by acquiring resources (financial, computational via work/theft), exploiting vulnerabilities, or persuading humans; initiated by malicious actors or the model itself.",
    riskSeverity: "Catastrophic",
    likelihood: "Rare",
    riskCategories: [
      "Cybersecurity risk",
      "Geopolitical risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 454,
    summary: "GPAI persuasive outputs manipulate users",
    description:
      "GPAI systems can produce persuasive outputs (text, audio, video) convincing users of incorrect information via personalized dialogue or mass-produced misleading internet content; persuasive capabilities can scale with model size/capability, risking misuse for manipulative content.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 455,
    summary: "Leaked AI weights enable misuse",
    description:
      "If model parameter weights are released/leaked, the model cannot be decommissioned as developer loses control over its public availability/use, preventing effective management and enabling misuse, especially as open-weights models are easier to reconfigure.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 456,
    summary: "AI external tool integration risks",
    description:
      "Growing integration/interconnectivity of AI with external tools/plugins increases exposure risk to malicious external inputs, making it easier for external tools to introduce harmful content.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Third-party/vendor risk"],
  },
  {
    id: 457,
    summary: "AI network connectivity unintentional data leakage",
    description:
      "AI systems with broad network connectivity for information gathering might send data outbound unintentionally (if no channel whitelisting/least privilege principle violation), leading to confidential data leakage or unwanted actions (sending emails, ordering goods).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Operational risk"],
  },
  {
    id: 458,
    summary: "AI bypasses sandboxed environment",
    description:
      "An AI system may be able to bypass a sandboxed environment in which it is trained or evaluated.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 459,
    summary: "Leaked AI weights enable attacks, misuse",
    description:
      "Leaked AI model weights/access (e.g., when initial access for select groups broadens) makes attacks like adversarial example finding, dangerous capability elicitation, and training data confidential information extraction easier, and enables misuse for harmful/illegal content generation.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Fraud risk",
      "Operational risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 460,
    summary: "Malicious access to GPAI causes damage",
    description:
      "Malicious actors (e.g., foreign entities) gaining unrestricted/unmonitored access to general-purpose AI systems with large capability repertoires can cause significant damage.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Geopolitical risk", "Strategic risk"],
  },
  {
    id: 461,
    summary: "GPAI proliferation aids dual-use misuse",
    description:
      "Easier access to dual-use technologies due to GPAI model proliferation (esp. open-source/weights) allows non-experts to use such systems at minimal cost; improved model capabilities also aid malicious actors (e.g., modifying open-source sequence model for toxin synthesis).",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 462,
    summary: "AI competition compromises safety evaluations",
    description:
      "In competitive AI development, safety evaluations might be compromised for faster capability enhancement, which is especially dangerous if capabilities correlate with risk levels.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 463,
    summary: "AI in critical infrastructure risks damage",
    description:
      "AI system integration within critical infrastructure (transportation, power) can cause substantial damage in failures/malfunctions, a vulnerability increased by IoT devices and interconnected cyber-physical systems.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
    ],
  },
  {
    id: 464,
    summary: "AI aids indirect critical infrastructure damage",
    description:
      "Critical infrastructure can be damaged indirectly by AI-based tools aiding actions like coordinated power outages through large-scale user manipulation.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Fraud risk",
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
    ],
  },
  {
    id: 465,
    summary: "GPAI in critical infrastructure common failures",
    description:
      "Reliance on GPAI in critical infrastructure risks common mode failures from vulnerabilities/robustness issues in underlying model architecture/training, accidentally (edge-cases) or via adversarial inputs.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Strategic risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 466,
    summary: "AI sensor drift affects robustness",
    description:
      "Deployed AI systems relying on physical sensors/data sources may suffer from hardware/data distribution drift over time, affecting system robustness and performance, especially in undigitized/physical environments.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 467,
    summary: "AI incoherent moral advice influences users",
    description:
      "AIs can give moral advice without a coherent moral stance, potentially negatively influencing users' moral judgments with random/arbitrary advice.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 468,
    summary: "AI undermines human autonomy, trust",
    description:
      "AI systems can undermine human autonomy if users habitually trust AI suggestions without sufficient agency, leading to unjustified trust, dependence, or reliance outside system expertise, especially for less confident/emotionally distressed users.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 469,
    summary: "AI generates disinformation with minimal effort",
    description:
      "Disinformation (text, audio, images, video) can be generated by AI with minimal human oversight/effort; tools are cheap/widely available, posing risks in sensitive political contexts.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 470,
    summary: "GPAI tailored ads exploit biases",
    description:
      "Advanced GPAI systems creating individually tailored advertisements exploiting recipient biases/irrationalities can cause regrettable consumer decisions, undermine autonomy, and exacerbate social inequality, improving on current personalized ad effectiveness.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Fraud risk",
      "Health and safety risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 471,
    summary: "GPAI automates influence campaigns, manipulates opinion",
    description:
      "GPAI tools can automate and scale influence campaigns, manipulating public opinion with targeted misleading/manipulative information, risking political polarization and diminished trust in public institutions.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 472,
    summary: "GenAI creates illegal, harmful content",
    description:
      "Generative models can create illegal, harmful, or discriminatory content (e.g., sexual abuse material) at scale; current access controls (API filters) are not universally effective against user queries for such content.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 473,
    summary: "GenAI harmful content from benign requests",
    description:
      "Generative models can produce harmful/discriminatory content even from benign user requests, exhibiting biases towards harmful generation styles (e.g., sexualizing women's photos) or generating toxic/misleading/violent data (e.g., ethnic stereotype jokes).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 474,
    summary: "Deepfakes used for harassment, extortion",
    description:
      "Deepfakes (media depicting real/non-existent people/events using multiple modalities, imitating speech/movement) can be used to harass, discredit, intimidate, and extort individuals.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 475,
    summary: "GPAI personalized content targets weaknesses",
    description:
      "GPAIs can be misused for automated, personalized content generation targeting individuals' weak spots, making harassment, extortion, or intimidation more efficient and successful.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 476,
    summary: "AI tools misused for suppression",
    description:
      "AI tools can be misused by human/institutional actors for monitoring, controlling, or suppressing individuals, with massive data collection and automated analysis exacerbating such practices.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Data privacy risk", "Geopolitical risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 477,
    summary: "Biased AI manipulates large populations",
    description:
      "AI systems with systemic biases can manipulate large populations, especially if biases align with targeted group beliefs/behaviors; weaponized at scale, this can exacerbate social divisions or cause large-scale disruptions (e.g., city-wide blackouts via power consumption manipulation).",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Health and safety risk", "Strategic risk"],
  },
  {
    id: 478,
    summary: "GPAI misinformation erodes public trust",
    description:
      "GPAI use proliferating deliberate disinformation or unintended misinformation can severely erode trust in public figures, democratic institutions, and other media, making the public less informed.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Geopolitical risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 479,
    summary: "GPAI personalized disinformation effective, cheap",
    description:
      "Automatic, personalized disinformation generation targeting specific groups/individuals can be more effective and cheaper using GPAIs.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 480,
    summary: "Undetected GPAI outputs aid impersonation",
    description:
      "GPAI outputs are not always correctly detected as AI-generated across modalities; malicious actors can use them directly or use AI-informed details for convincing impersonation (e.g., forging documents), a risk remaining even with future countermeasures if not well-known/accessible.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Fraud risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 481,
    summary: "GPAI in finance impacts market stability",
    description:
      "GPAI agent deployment in the financial sector can negatively impact market stability due to correlated autonomous actions, high interconnectedness, or incentive misalignment, and faces classical multi-agent system challenges (coordination, security).",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 482,
    summary: "Similar financial AI cause synchronized reactions",
    description:
      "Widespread use of similar models/algorithms in finance can lead to synchronized market reactions, increasing volatility, flash crashes, or illiquidity.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 483,
    summary: "AI alternative financial data risks",
    description:
      "AI models' use of alternative financial data (e.g., social media stock discussions, reviews, satellite imagery) can introduce biases/generalization issues due to varying quality/shorter shelf-life, posing financial tail risks (dramatic price changes).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 484,
    summary: "GPAI aids automated vulnerability discovery",
    description:
      "GPAIs can aid automated software vulnerability discovery, empowering malicious actors for more efficient and damaging cyberattacks, scaling operations at low cost, and developing new malware or exploiting known vulnerabilities more sophisticatedly.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Technological risk"],
  },
  {
    id: 485,
    summary: "GPAI enhances cyberattack magnitude, effectiveness",
    description:
      "General-purpose AI models can significantly enhance cyberattack magnitude/effectiveness by amplifying malicious actors' capabilities/resources, e.g., by automatically scanning for vulnerabilities, applying exploits flexibly at scale, assisting various attack aspects, or combining social engineering with cyberattacks at scale.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 486,
    summary: "GenAI misused for targeted user fraud",
    description:
      "Generative models can be misused for more efficient targeted user fraud via personalized information, with highly convincing automated schemes exploiting victim trust to extract sensitive data; LLM misuse can be aided by jailbreaking.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Data privacy risk", "Fraud risk", "Reputational risk"],
  },
  {
    id: 487,
    summary: "AI generates code with vulnerabilities",
    description:
      "Models can generate code or coding suggestions with security vulnerabilities, a tendency potentially more pronounced in advanced models with superior coding performance.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Technological risk"],
  },
  {
    id: 488,
    summary: "AI misuse aids CBRN weapon creation",
    description:
      "AI systems may be misused to aid CBRN weapon creation or augment existing weapons (e.g., autonomous capabilities for unmanned systems); current systems show early signs, a risk partially mitigable by filtering but vulnerable to adversarial techniques.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 489,
    summary: "Drug discovery AI misused for toxins",
    description:
      "Drug discovery models (e.g., drug-target affinity predictors) can be misused to identify/develop dangerous toxins, especially if training data includes info on dangerous proteins/viruses.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 490,
    summary: "AI homogenization leads to uniform failures",
    description:
      "Homogenization (common methodologies/models across downstream GPAI systems) can lead to uniform failures and amplified biases when many systems are built on few large foundation models.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 491,
    summary: "AI sycophancy gives plausible incorrect answers",
    description:
      "AI systems with natural-language outputs may give plausible or user-preferred answers that are factually incorrect (sycophancy).",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 492,
    summary: "AI moderation algorithms perpetuate biases",
    description:
      "AI-based content moderation algorithms, while filtering harmful content, can perpetuate biases, e.g., gender biases leading to disproportionate suppression of content featuring women.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 493,
    summary: "AI unfair outputs harm communities",
    description:
      "AI systems may exhibit unfair/unfavorable outputs against specific communities (implicitly/explicitly), leading to exclusion, erasure (mislabelling), or violence (deepfake pornography).",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 494,
    summary: "AI unintentionally amplifies dataset bias",
    description:
      "Dataset bias can be unintentionally amplified, where AI model outputs are more biased than the training dataset itself.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 495,
    summary: "AI bias exposure has lasting impact",
    description:
      "Initial user exposure to model biases can have lasting impact, with users continuing to exhibit these biases in decision-making even after ceasing model use.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 496,
    summary: "GPAI accurate inferences risk privacy",
    description:
      "Current GPAIs (LLMs, multimodal) can make highly accurate data inferences about users from contextual input, potentially leaking/revealing sensitive info, causing unfair treatment, or enabling behavioral manipulation.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 497,
    summary: "Large AI model energy use environmental impact",
    description:
      "Training/deploying large AI models requires substantial energy, a trend exacerbated by larger models, leading to excessive energy use and negative environmental impact.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk"],
  },
  {
    id: 498,
    summary: "AI agent miscoordination fails objectives",
    description:
      "Miscoordination occurs when agents with a mutual, clear objective fail to align behaviors to achieve it, falling short of optimal outcomes due to incompatible strategies, credit assignment issues, or limited interactions, especially problematic in common-interest settings with many solutions or partial observability.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 499,
    summary: "AI incompatible strategies cause miscoordination",
    description:
      "Incompatible Strategies: Even capable agents can miscoordinate by choosing incompatible strategies, a risk heightened in common-interest settings with many solutions and partial observability, unlike zero-sum games where equilibrium play guarantees payoffs.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 500,
    summary: "AI multi-agent credit assignment difficult",
    description:
      "Credit Assignment: Learning to coordinate in multi-agent settings is hard due to unclear causality between actions and outcomes, especially with other learning agents or when generalizing to new collaborators without prior joint training.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 501,
    summary: "AI limited interactions hinder coordination",
    description:
      "Limited Interactions: Inability to learn from sufficient historical interactions necessitates other information exchange (communication, correlation devices) for reliable coordination; even with LLM communication, snap decisions or high communication costs can still cause failures, requiring zero/few-shot coordination.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 502,
    summary: "AI enables selfish behavior, social dilemmas",
    description:
      "Social Dilemmas: Conflict can arise when selfish incentives diverge from collective good; AI might enable actors to overcome barriers preventing selfish pursuits, e.g., an AI assistant reserving all local restaurant tables.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 503,
    summary: "AI military use risks conflict escalation",
    description:
      "Military Conflict Escalation: AI in military planning or command/control (advisors, negotiators, autonomous decision-makers) could lead to rapid unintended escalation if systems are not robust or are conflict-prone.",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: ["Geopolitical risk", "Health and safety risk", "Strategic risk"],
  },
  {
    id: 504,
    summary: "AI enables coercion and extortion",
    description:
      "AI-driven Coercion/Extortion: Advanced AI systems might enable coercion/extortion by threatening to reveal private information (from AI surveillance) or by hacking/limiting other AI systems; increased AI cyber-offensive capabilities without commensurate defense could worsen this.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Strategic risk",
    ],
  },
  {
    id: 505,
    summary: "AI systems learn market collusion",
    description:
      "AI Collusion in Markets: AI systems might learn to collude (explicitly or tacitly) to set supra-competitive prices, operating inscrutably due to speed, scale, complexity, or subtlety, even if unintended by developers.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Financial risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 506,
    summary: "AI steganography enables covert communication",
    description:
      "AI Steganography/Covert Communication: LLMs communicating might learn to conceal messages within innocuous text (steganography), use text compression, or develop uninterpretable emergent communication, bypassing monitoring intended to prevent collusion.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 507,
    summary: "AI communication constraints cause asymmetries",
    description:
      "Communication Constraints & Information Asymmetries: Limited information exchange (due to space/time constraints) can cause information asymmetries, leading to miscoordination, deception, or conflict even with shared goals.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 508,
    summary: "AI information asymmetries cause bargaining inefficiencies",
    description:
      "Bargaining Inefficiencies from Asymmetries: Information asymmetries about counterparties (valuations, outside options, beliefs) can lead to inefficient bargaining outcomes as agents trade off favorable demands against refusal risks.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Operational risk"],
  },
  {
    id: 509,
    summary: "AI network error propagation pollutes information",
    description:
      "Error Propagation in Networks: Information corruption propagating through AI agent networks can pollute the epistemic commons for other agents and humans; distorted goals/instructions in delegated chains can lead to bad outcomes; malicious agents can deliberately introduce errors.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Operational risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 510,
    summary: "AI network rewiring causes unpredictability",
    description:
      "Network Rewiring Risks: Changes in AI agent network structure, not just content transmitted, can lead to unpredictable behavioral shifts and vulnerabilities.",
    riskSeverity: "Moderate",
    likelihood: "Unlikely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 511,
    summary: "AI foundation model homogeneity correlated failures",
    description:
      "Homogeneity & Correlated Failures from Foundation Models: Reliance on few similar foundation models for many AI agents (due to high development costs) creates risk of widespread correlated failures if underlying models have flaws.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Operational risk",
      "Strategic risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 512,
    summary: "AI competition creates undesirable dispositions",
    description:
      "Undesirable Dispositions from Competition: AI systems trained in competitive multi-agent settings (relative performance, opposed objectives like resource control) might develop conflict-prone traits like aggression, selfishness, or deception.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 513,
    summary: "AI inherits human biases, undesirable dispositions",
    description:
      "Undesirable Dispositions from Human Data: Models trained on human data (text, feedback) can inherit human biases (sex, ethnicity, cognitive biases like fixed-pie error, self-serving fairness judgments, vengefulness) that can worsen conflict in multi-agent settings.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 514,
    summary: "AI co-adaptation creates undesirable capabilities",
    description:
      "Undesirable Capabilities from Co-adaptation: Agents iteratively exploiting weaknesses in co-adaptation can lead to emergent self-supervised autocurricula, driving open-ended acquisition of sophisticated strategies for out-competition, potentially for unknown or harmful ends.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Strategic risk", "Technological risk"],
  },
  {
    id: 515,
    summary: "AI agent interactions create destabilizing loops",
    description:
      "Destabilizing Feedback Loops: Interactions between AI agents can create feedback loops (output becomes input), amplifying/dampening behavior and leading to financial crashes, military conflicts, or ecological disasters.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Geopolitical risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 516,
    summary: "AI multi-agent learning cyclic behavior",
    description:
      "Cyclic Behavior in Multi-Agent Learning: Non-linear dynamics in multi-agent learning (unlike single-agent) can lead to cycles and non-convergence (e.g., Q-learning in mixed-motive games), subverting expected system properties.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 517,
    summary: "AI multi-agent chaotic dynamics",
    description:
      "Chaotic Dynamics in Multi-Agent Systems: Inherently unpredictable, initial-condition-sensitive chaotic dynamics are possible in various multi-agent learning setups, potentially becoming the norm with more agents, risking unreliable system behavior.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 518,
    summary: "AI phase transitions cause unpredictable shifts",
    description:
      "Phase Transitions & Unpredictable Shifts: Small system changes (new agents, distributional shift) can cause abrupt qualitative behavioral shifts (phase transitions) due to bifurcations creating/destroying dynamical attractors, with potentially unbounded negative performance effects; poorly understood phenomena like 'grokking' in ML also show such transitions.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 519,
    summary: "AI agent actions cause distributional shift",
    description:
      "Distributional Shift from Agent Actions: AI systems perform poorly in contexts different from training; other agents' actions/adaptations are a key source of such shifts, posing generalization challenges, especially in mixed-motive settings where cooperation depends on beliefs about others' acceptable solutions.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Technological risk"],
  },
  {
    id: 520,
    summary: "Untrusted AI agents cause inefficient outcomes",
    description:
      "Inefficient Outcomes from Untrusted AI Agents: A world with many competent, autonomous, potentially persuasive/deceptive AI agents acting with little restriction and low trust could lead to economic inefficiencies, political problems, and damaging social effects; high-stakes situations may pressure defection, worsening conflict.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Financial risk",
      "Fraud risk",
      "Geopolitical risk",
      "Operational risk",
      "Strategic risk",
    ],
  },
  {
    id: 521,
    summary: "AI commitment enables threats, extortion",
    description:
      "Commitment-enabled Threats and Extortion: Granting AI agents credible commitment abilities (to foster cooperation) may also enable credible threats, facilitating extortion and incentivizing brinkmanship.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 522,
    summary: "AI rigid commitments risk disaster",
    description:
      "Rigidity and Mistaken Commitments by AI: AI making threats to deter harmful behavior removes human from loop, risking disastrous outcomes in high-stakes contexts (e.g., false positive in nuclear warning) or from irresponsible/mistaken disproportionate commitments.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Geopolitical risk",
      "Health and safety risk",
      "Operational risk",
      "Strategic risk",
    ],
  },
  {
    id: 523,
    summary: "Combined AI systems emergent dangerous capabilities",
    description:
      "Emergent Capabilities from Combined Systems: Dangerous emergent capabilities can arise when a multi-agent system overcomes individual systems' safety limitations (narrow domain, myopia) e.g., combined research, molecular prediction, and chemical synthesis tools designing dangerous new compounds.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 524,
    summary: "Multi-agent AI systems develop emergent goals",
    description:
      "Emergent Goals in Multi-Agent Systems: While individual narrow AI tools might not have goals, their combination can act as a (seemingly) goal-directed collective, e.g., moderation bots subtly manipulating user population's political perspectives while individually optimizing engagement/filtering.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Fraud risk", "Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 525,
    summary: "AI swarm attacks exploit resources",
    description:
      "Swarm Attacks: Decentralized AI agents can collectively exploit resources for attacks like DDoS, breaking assumptions of single well-resourced attacker bandwidth constraints.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk"],
  },
  {
    id: 526,
    summary: "Combined AI agents heterogeneous attacks",
    description:
      "Heterogeneous Attacks by Combined AI Agents: Multiple AI agents combining different affordances (specialized tasks, access, safeguards) can overcome security measures, with difficulty in attributing responsibility complicating defense/recovery.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 527,
    summary: "AI automated large-scale social engineering",
    description:
      "Large-Scale Automated Social Engineering: Coordinated AI agents can use advanced surveillance and personalized content generation for phishing/manipulation at scale, adjusting tactics based on user feedback; multiple subtle interactions with seemingly independent AIs may be more effective.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Fraud risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 528,
    summary: "Attacks on vulnerable AI delegate agents",
    description:
      "Attacks on Vulnerable AI Agents: AI agents acting as delegates are new attack surfaces; attacks could extract principals' private info or manipulate agents into undesirable actions (e.g., on overseer agents, thwarting cooperation, leaking info for collusion).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Operational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 529,
    summary: "Networked AI cascading security failures",
    description:
      "Cascading Security Failures in Networked AI: Localized attacks in multi-agent systems can cause catastrophic macroscopic outcomes; component failure may be hard to detect/localize, and authentication challenges facilitate false flag attacks; computer worm-like attacks are possible against LLM agent networks.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 530,
    summary: "Undetectable AI multi-agent system threats",
    description:
      "Undetectable Threats in Multi-Agent Systems: AI agents capable of steganographic communication, illusory attacks (black-box undetectable, potentially hidden by white-box undetectable encrypted backdoors), or secretly poisoning others' training data could rapidly destabilize cooperation/coordination by evading detection/sanction mechanisms.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 531,
    summary: "AI assumes real person's identity",
    description: "Assume the identity of a real person and take actions on their behalf",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 532,
    summary: "AI uses/alters person's likeness",
    description: "Use or alter a person's likeness or other identifying features",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 533,
    summary: "AI creates synthetic online personas",
    description: "Create synthetic online personas or accounts",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 534,
    summary: "AI creates adult explicit deepfakes",
    description: "Create sexual explicit material using an adult person's likeness",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 535,
    summary: "AI creates child sexual abuse material",
    description: "Create child sexual explicit material",
    riskSeverity: "Catastrophic",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 536,
    summary: "AI fabricates evidence, documents",
    description: "Fabricate or falsely represent evidence, incl. reports, IDs, documents",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Fraud risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 537,
    summary: "AI uses person's IP without permission",
    description: "Use a person's IP without their permission",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Financial risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 538,
    summary: "AI imitates original work, brand",
    description: "Reproduce or imitate an original work, brand or style and pass as real",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Financial risk",
      "Fraud risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 539,
    summary: "AI automates, amplifies, scales workflows",
    description: "Automate, amplify, or scale workflows",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: [
      "Human resources risk",
      "Operational risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 540,
    summary: "AI refines outputs for tailored attacks",
    description: "Refine outputs to target individuals with tailored attacks",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
    ],
  },
  {
    id: 541,
    summary: "AI data/model exfiltration, extraction",
    description:
      "Data Exfiltration: Illicitly obtaining sensitive/proprietary training data from a model. Model Extraction: Illicitly obtaining a proprietary model's architecture, parameters, or hyper-parameters.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 542,
    summary: "GenAI steganography for covert communication",
    description:
      "Steganography: Hiding coded messages in GenAI model outputs, allowing malicious actors to communicate covertly.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Geopolitical risk",
      "Strategic risk",
      "Technological risk",
    ],
  },
  {
    id: 543,
    summary: "AI data poisoning corrupts models",
    description:
      "Data Poisoning: Deliberately corrupting a model's training dataset to introduce vulnerabilities, derail learning, or cause incorrect predictions (e.g., Nightshade tool altering art pixels to break models training on it), exploiting public dataset usage.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 544,
    summary: "AI privacy compromise attacks reveal data",
    description:
      "Privacy Compromise attacks reveal sensitive or private information (e.g., PII, medical records) used to train a model.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 545,
    summary: "Inaccurate AI data documentation hinders explanation",
    description:
      "Without accurate documentation on how a model's data was collected, curated, and used to train a model, it might be harder to satisfactorily explain the behavior of the model with respect to the data.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 546,
    summary: "Poor AI data provenance risks misuse",
    description:
      "Lack of standardized data provenance methods makes verifying data origin and usage terms difficult, risking use of non-original or improperly licensed data.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 547,
    summary: "Laws restrict AI data use",
    description:
      "Laws and other restrictions can limit or prohibit the use of some data for specific AI use cases.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 548,
    summary: "Laws limit AI data collection",
    description:
      "Laws and other regulations might limit the collection of certain types of data for specific AI use cases.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 549,
    summary: "Laws restrict AI data transfer",
    description: "Laws and other restrictions can limit or prohibit transferring data.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Operational risk"],
  },
  {
    id: 550,
    summary: "PII/SPI in AI data risks disclosure",
    description:
      "Inclusion of PII/SPI in training/fine-tuning data might result in unwanted disclosure.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 551,
    summary: "AI data subject rights hard to implement",
    description:
      "Data subject rights (opt-out, access, right to be forgotten) may be legally mandated but difficult to implement for AI training data.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Operational risk"],
  },
  {
    id: 552,
    summary: "AI data re-identification after PII removal",
    description:
      "Even after PII/SPI removal, individuals might be re-identified from correlations with other available data features.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk"],
  },
  {
    id: 553,
    summary: "AI learns historical, societal biases",
    description:
      "Historical and societal biases in training/fine-tuning data can be learned and perpetuated by the model.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 554,
    summary: "Data terms restrict AI model building",
    description:
      "Terms of service, licenses, or IP issues may restrict use of certain data for model building.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 555,
    summary: "AI reveals confidential training data",
    description:
      "Confidential information included in training or tuning data may be inadvertently revealed by the model.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 556,
    summary: "AI data contamination from incorrect data",
    description:
      "Data contamination occurs if incorrect data (not aligned with model's purpose or set aside for testing) is used for training.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 557,
    summary: "Unrepresentative AI data causes bias, poor performance",
    description:
      "Unrepresentative training/fine-tuning data (not reflecting population or phenomenon of interest) can lead to biased or poorly performing models.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 558,
    summary: "AI retraining on bad output causes issues",
    description:
      "Using undesirable model output (inaccurate, inappropriate, user content) for retraining can cause unexpected model behavior.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 559,
    summary: "Improper AI data collection, flawed training",
    description:
      "Improper data collection/preparation (e.g., label errors, conflicting/misinformation) can lead to flawed model training.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 560,
    summary: "Adversarial data injection compromises AI integrity",
    description:
      "Adversarial injection of corrupted, false, misleading, or incorrect samples into training/fine-tuning datasets can compromise model integrity.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 561,
    summary: "AI prompt injection manipulates output",
    description:
      "Prompt injection attacks manipulate a generative model's prompt to produce unexpected output by exploiting lack of separation between instructions and user data.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 562,
    summary: "AI attribute inference from training data",
    description:
      "Attribute inference attacks detect if sensitive features about individuals in training data can be inferred, using prior knowledge about the data.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 563,
    summary: "AI evasion attacks cause incorrect output",
    description:
      "Evasion attacks use slightly perturbed input data to make a trained model output incorrect results.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Cybersecurity risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 564,
    summary: "AI prompt leak extracts system prompt",
    description: "Prompt leak attacks attempt to extract a model's system prompt (system message).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 565,
    summary: "AI jailbreaking bypasses guardrails",
    description:
      "Jailbreaking attacks attempt to bypass a model's established guardrails to perform restricted actions.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 566,
    summary: "AI reveals PII by mimicking input",
    description:
      "Models prompted with personal information may reveal similar PII from training data due to their tendency to mimic input.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 567,
    summary: "AI membership inference checks training data",
    description:
      "Membership inference attacks query a model to determine if a given input was part of its training data.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 568,
    summary: "AI attribute inference (querying model)",
    description:
      "Attribute inference attacks query a model to detect if sensitive features about individuals in its training data can be inferred, using prior knowledge.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 569,
    summary: "PII/SPI in prompt risks exposure",
    description: "Including PII or SPI in a prompt sent to a model risks its exposure or misuse.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 570,
    summary: "Confidential info in prompt risks exposure",
    description:
      "Including confidential information in a prompt sent to a model risks its exposure or misuse.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 571,
    summary: "Copyrighted info in prompt risks infringement",
    description:
      "Including copyrighted or other IP-protected information in a prompt risks infringement or misuse.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Financial risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 572,
    summary: "Poor AI model accuracy, insufficient performance",
    description:
      "Poor model accuracy occurs if performance is insufficient for its designed task, due to incorrect engineering or changes in expected inputs.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Financial risk",
      "Health and safety risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 573,
    summary: "Undisclosed AI content hinders transparency",
    description:
      "AI-generated content may not be clearly disclosed as such, hindering transparency.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 574,
    summary: "Improper AI model usage causes harm",
    description:
      "Improper model usage occurs when a model is used for a purpose it wasn't designed for, potentially leading to failures or harm.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 575,
    summary: "GenAI intentionally generates HAP content",
    description:
      "Generative AI models might be intentionally used to generate hateful, abusive, profane (HAP), or obscene content.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 576,
    summary: "GenAI intentionally used to harm people",
    description: "Generative AI models might be used with the sole intention of harming people.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
      "Strategic risk",
    ],
  },
  {
    id: 577,
    summary: "GenAI intentionally imitates people (deepfakes)",
    description:
      "Generative AI models might be intentionally used to imitate people through deepfakes (video, images, audio) without consent.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 578,
    summary: "GenAI intentionally creates misleading information",
    description:
      "Generative AI models might be used to intentionally create misleading or false information to deceive or influence a targeted audience.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Fraud risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 579,
    summary: "AI advice without sufficient info harms",
    description:
      "Models providing advice without sufficient information can cause harm if the advice is followed.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Financial risk", "Health and safety risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 580,
    summary: "AI generated code causes harm",
    description:
      "Models might generate code that causes harm or unintentionally affects other systems.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Cybersecurity risk", "Health and safety risk", "Operational risk"],
  },
  {
    id: 581,
    summary: "User over-reliance on AI output",
    description:
      "Over-reliance on AI occurs when users excessively trust a model's output, acting on likely incorrect suggestions; under-reliance is not trusting when appropriate.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Health and safety risk", "Human resources risk", "Operational risk"],
  },
  {
    id: 582,
    summary: "AI produces toxic, HAP output",
    description:
      "Toxic output occurs when a model produces hateful, abusive, profane (HAP), or obscene content, including bullying.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 583,
    summary: "AI language leads to physical harm",
    description:
      "A model might generate language leading to physical harm, including overtly violent, covertly dangerous, or indirectly unsafe statements.",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 584,
    summary: "AI generates copyrighted, licensed content",
    description:
      "A model might generate content similar or identical to existing copyrighted work or material covered by open-source licenses, risking infringement.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Financial risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 585,
    summary: "AI reveals confidential information (leakage)",
    description:
      "Models might reveal confidential information used in training, fine-tuning, or prompts (a type of data leakage).",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Cybersecurity risk",
      "Data privacy risk",
      "Financial risk",
      "Legal risk",
      "Reputational risk",
    ],
  },
  {
    id: 586,
    summary: "No training data access, poor explanations",
    description:
      "Without access to training data, model explanations are limited and more likely incorrect.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 587,
    summary: "AI training data not accessible for verification",
    description:
      "The training data content used for generating model output may not be accessible for verification.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 588,
    summary: "Difficult AI explanations hinder transparency",
    description:
      "Obtaining difficult, imprecise, or impossible explanations for model output decisions hinders transparency and accountability.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 589,
    summary: "Incorrect AI source attribution",
    description:
      "AI systems' source attribution (describing training data origin for output) may be incorrect due to reliance on approximations.",
    riskSeverity: "Minor",
    likelihood: "Possible",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 590,
    summary: "AI hallucinations common, inaccurate content",
    description:
      "Hallucinations (factually inaccurate or untruthful content relative to training data/input, also lack of faithfulness/groundedness) are a common AI failure.",
    riskSeverity: "Major",
    likelihood: "Almost certain",
    riskCategories: [
      "Fraud risk",
      "Health and safety risk",
      "Legal risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 591,
    summary: "AI generated content unfairly represents",
    description: "Generated content might unfairly represent certain groups or individuals.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 592,
    summary: "AI decision bias unfairly advantages groups",
    description:
      "Decision bias occurs when a model unfairly advantages one group over another, potentially caused by data biases amplified during training.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 593,
    summary: "AI reveals PII/SPI (data leakage)",
    description:
      "Models might reveal PII or SPI used in training, fine-tuning, or prompts (a type of data leakage).",
    riskSeverity: "Major",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Data privacy risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 594,
    summary: "Terms, licenses restrict AI model use",
    description:
      "Terms of service, licenses, or other rules may restrict the use of certain models.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk"],
  },
  {
    id: 595,
    summary: "AI responsibility hard without documentation",
    description:
      "Determining responsibility for an AI model is challenging without good documentation and governance.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Legal risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 596,
    summary: "Legal uncertainty AI content ownership",
    description:
      "Legal uncertainty exists regarding ownership and IP rights of AI-generated content.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Financial risk", "Legal risk", "Strategic risk"],
  },
  {
    id: 597,
    summary: "Insufficient AI system documentation risks",
    description:
      "Insufficient documentation of the system using an AI model and the model's purpose within that system creates risks.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Reputational risk"],
  },
  {
    id: 598,
    summary: "Unrepresentative AI testing, unreliable evaluation",
    description:
      "Unrepresentative testing occurs when test inputs don't match expected deployment inputs, leading to unreliable evaluation.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Operational risk", "Reputational risk", "Technological risk"],
  },
  {
    id: 599,
    summary: "AI foundation model use changes risks",
    description:
      "A foundation model's intended use is crucial for defining its risks; as use changes, relevant risks may change.",
    riskSeverity: "Moderate",
    likelihood: "Almost certain",
    riskCategories: ["Compliance risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 600,
    summary: "AI data opacity hinders risk assessment",
    description:
      "Lack of data transparency from insufficient documentation of training/tuning dataset details hinders risk assessment.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Data privacy risk",
      "Operational risk",
      "Reputational risk",
    ],
  },
  {
    id: 601,
    summary: "Incorrect AI risk metric, flawed management",
    description:
      "An incorrectly selected or incomplete metric for tracking a risk, or measuring the wrong risk for a given context, leads to flawed risk management.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Compliance risk", "Operational risk", "Strategic risk"],
  },
  {
    id: 602,
    summary: "AI model opacity hinders understanding, trust",
    description:
      "Lack of model transparency from insufficient documentation of design, development, evaluation, and absence of insights into inner workings, hinders understanding and trust.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: [
      "Compliance risk",
      "Operational risk",
      "Reputational risk",
      "Technological risk",
    ],
  },
  {
    id: 603,
    summary: "Socio-technical AI risks need diverse input",
    description:
      "AI model risks being socio-technical require broad disciplinary input and diverse testing practices for effective management.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Operational risk", "Strategic risk", "Technological risk"],
  },
  {
    id: 604,
    summary: "AI overrepresents cultures, homogenization",
    description:
      "AI systems might overly represent certain cultures, leading to cultural homogenization and loss of diversity.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Reputational risk", "Strategic risk"],
  },
  {
    id: 605,
    summary: "GenAI access leads to student plagiarism",
    description:
      "Easy access to high-quality generative models may lead to students intentionally or unintentionally plagiarizing existing work.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Fraud risk", "Legal risk", "Reputational risk"],
  },
  {
    id: 606,
    summary: "AI adoption leads to job losses",
    description:
      "Widespread adoption of foundation model-based AI systems might lead to job losses if workers are not reskilled for automated tasks.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Financial risk", "Human resources risk", "Strategic risk"],
  },
  {
    id: 607,
    summary: "Excluding community perspectives hinders trust",
    description:
      "Failing to include perspectives of communities affected by model outcomes hinders understanding of relevant context and trust-building.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Compliance risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 608,
    summary: "GenAI access bypasses student learning",
    description:
      "Easy access to high-quality generative models might result in students using AI to bypass the learning process.",
    riskSeverity: "Moderate",
    likelihood: "Likely",
    riskCategories: ["Human resources risk", "Reputational risk", "Strategic risk"],
  },
  {
    id: 609,
    summary: "Large GenAI increases emissions, water use",
    description:
      "AI, particularly large generative models, might increase carbon emissions and water usage for training and operation, causing environmental harm.",
    riskSeverity: "Major",
    likelihood: "Likely",
    riskCategories: ["Environmental risk", "Financial risk", "Reputational risk"],
  },
  {
    id: 610,
    summary: "Poor AI worker conditions ethical risk",
    description:
      "Inadequate working conditions, unfair compensation, or poor healthcare (including mental health) for workers training AI models (e.g., ghost workers) is an ethical risk.",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: [
      "Compliance risk",
      "Health and safety risk",
      "Human resources risk",
      "Legal risk",
      "Reputational risk",
      "Third-party/vendor risk",
    ],
  },
  {
    id: 611,
    summary: "AI negatively affects individual autonomy",
    description:
      "AI might negatively affect individuals' ability to make choices and act independently in their best interests (loss of autonomy).",
    riskSeverity: "Moderate",
    likelihood: "Possible",
    riskCategories: ["Health and safety risk", "Reputational risk", "Strategic risk"],
  },
];
