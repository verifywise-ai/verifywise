/**
 * Demo implementation text for the NIST AI RMF, keyed by
 * "<FUNCTION>-<category>.<subcategory>" — the same reference NIST itself uses
 * (GOVERN 1.1, MEASURE 2.11, ...), which is how
 * nist_ai_rmf_subcategories_struct.subcategory_id is written by the seed
 * migration.
 *
 * Keyed rather than positional on purpose: the struct table holds 70 of the 74
 * subcategories this framework declares, so pairing a flat array against the
 * struct rows by index would attach every later entry to the wrong
 * subcategory. An entry whose key has no struct row simply seeds nothing.
 *
 * The four that are missing are MEASURE 2.10-2.13. subcategory_id is
 * numeric(4,1), so each of them rounds to 2.1 and collides with MEASURE 2.1,
 * and the seeding migration's ON CONFLICT DO NOTHING drops them. Their entries
 * are kept below so they seed if that column ever becomes text.
 */

export interface NISTDemoEntry {
  implementation_description: string;
  auditor_feedback: string;
}

export const NIST_AI_RMF_DEMO: Record<string, NISTDemoEntry> = {
  "GOVERN-1.1": {
    implementation_description:
      "Maintain a register of AI-related legal and regulatory obligations covering the EU AI Act, GDPR and sector guidance, with a named owner per obligation and quarterly horizon scanning.",
    auditor_feedback:
      "Obligation register is current and owned; keep horizon scanning on a fixed cadence.",
  },
  "GOVERN-1.2": {
    implementation_description:
      "The trustworthy-AI characteristics are written into the AI policy set so that validity, safety, security, accountability, explainability, privacy and fairness each map to named controls.",
    auditor_feedback:
      "Policies reference each characteristic; evidence of operational application is still thin.",
  },
  "GOVERN-1.3": {
    implementation_description:
      "Tiering criteria set the depth of risk work per system from its risk tolerance band: high-impact systems take a full assessment, low-impact systems a screening review.",
    auditor_feedback: "Tiering criteria are applied consistently across the inventory.",
  },
  "GOVERN-1.4": {
    implementation_description:
      "The AI risk management procedure is published with decision rights, escalation thresholds and the artefacts required at each lifecycle stage.",
    auditor_feedback:
      "Process is documented and transparent; link outcomes back to risk priorities.",
  },
  "GOVERN-1.5": {
    implementation_description:
      "The risk management process is reviewed semi-annually by named accountable roles, with monthly monitoring of open risk actions in between.",
    auditor_feedback: "Review frequency is defined; the first full cycle is not yet complete.",
  },
  "GOVERN-1.6": {
    implementation_description:
      "An AI system inventory covers internally built and third-party systems, refreshed from discovery feeds and reconciled against procurement records monthly.",
    auditor_feedback:
      "Inventory coverage is good; reconcile shadow AI findings into it more promptly.",
  },
  "GOVERN-1.7": {
    implementation_description:
      "A decommissioning procedure covers model retirement, data disposition, downstream notification and rollback of dependent integrations.",
    auditor_feedback: "Procedure exists; exercise it on a real retirement to prove it works.",
  },
  "GOVERN-2.1": {
    implementation_description:
      "AI risk roles are assigned across product, data science, legal and security through a responsibility matrix, with documented escalation routes.",
    auditor_feedback: "Responsibilities are clear to the teams interviewed.",
  },
  "GOVERN-2.2": {
    implementation_description:
      "Role-based AI risk training is delivered to engineering, product and procurement, with completion tracked in the training register.",
    auditor_feedback:
      "Completion is high for staff; extend the programme to partners and contractors.",
  },
  "GOVERN-2.3": {
    implementation_description:
      "An AI governance committee chaired by an executive sponsor approves high-risk deployments and records its decisions.",
    auditor_feedback: "Executive accountability is evidenced in committee minutes.",
  },
  "GOVERN-3.1": {
    implementation_description:
      "High-risk systems go through a cross-functional review panel drawing in domain, legal, accessibility and affected-user perspectives, and participation is recorded.",
    auditor_feedback: "Panel composition is diverse; record the dissenting views as well.",
  },
  "GOVERN-3.2": {
    implementation_description:
      "Oversight mode is defined per system — human in the loop, on the loop, or out of the loop — together with the competence required of the people filling it.",
    auditor_feedback: "Oversight modes are documented and match what is deployed.",
  },
  "GOVERN-4.1": {
    implementation_description:
      "Design review includes a pre-mortem and a documented challenge step, so teams must record what could go wrong before build approval.",
    auditor_feedback: "Safety-first practice is visible in recent design reviews.",
  },
  "GOVERN-4.2": {
    implementation_description:
      "Each AI system carries an impact note covering affected groups, plausible harms and mitigations, published to the internal governance space.",
    auditor_feedback: "Impact notes exist for major systems; broaden them to lower-tier systems.",
  },
  "GOVERN-4.3": {
    implementation_description:
      "A pre-release test gate, an AI incident intake channel and an internal post-incident note shared across teams support testing, identification and information sharing.",
    auditor_feedback: "Testing and intake are working; information sharing is still informal.",
  },
  "GOVERN-5.1": {
    implementation_description:
      "An external feedback route for AI-driven decisions is open, and submissions are triaged, prioritised and answered under a documented procedure.",
    auditor_feedback: "Feedback route is live; publish the response times achieved.",
  },
  "GOVERN-5.2": {
    implementation_description:
      "Adjudicated feedback enters the product backlog as tracked items, with a quarterly summary of what changed in the system as a result.",
    auditor_feedback: "Feedback reaches the backlog; close the loop with the people who raised it.",
  },
  "GOVERN-6.1": {
    implementation_description:
      "The third-party policy extends to AI suppliers, covering model provenance, training-data rights, IP indemnity and permitted use of our data.",
    auditor_feedback:
      "Supplier policy covers IP; verify the clauses are present in older contracts.",
  },
  "GOVERN-6.2": {
    implementation_description:
      "Contingency plans for high-risk third-party AI and data services name fallback providers and define degraded-mode operation.",
    auditor_feedback: "Contingency plans exist; test the fallback path at least annually.",
  },
  "MAP-1.1": {
    implementation_description:
      "Intended purpose, user groups, deployment setting, applicable law and known assumptions and limitations are documented for each AI system before build.",
    auditor_feedback: "Purpose and context documentation is thorough.",
  },
  "MAP-1.2": {
    implementation_description:
      "The disciplines and backgrounds contributing to context-setting are recorded per system, and cross-team workshops are prioritised.",
    auditor_feedback: "Participation is recorded; the range of domain expertise could be wider.",
  },
  "MAP-1.3": {
    implementation_description:
      "Each AI system is tied to the organisational objective it serves, stated in the system record and reviewed by the governance committee.",
    auditor_feedback: "Mission alignment is stated for every system in the inventory.",
  },
  "MAP-1.4": {
    implementation_description:
      "A business case is captured per system and re-evaluated annually, including whether a non-AI approach would now be sufficient.",
    auditor_feedback: "Business value is documented and re-evaluation dates are being met.",
  },
  "MAP-1.5": {
    implementation_description:
      "AI risk tolerance statements are published per risk category, with the thresholds that trigger escalation or a deployment hold.",
    auditor_feedback: "Tolerances are explicit and quantified where possible.",
  },
  "MAP-1.6": {
    implementation_description:
      "Non-functional requirements for privacy, fairness, explainability and human oversight are elicited alongside functional ones and traced to tests.",
    auditor_feedback: "Requirements are traceable to test cases.",
  },
  "MAP-2.1": {
    implementation_description:
      "The model class and method for each system — classifier, ranker, generative or forecasting — is recorded with its inputs and outputs.",
    auditor_feedback: "Task and method descriptions match the implementations reviewed.",
  },
  "MAP-2.2": {
    implementation_description:
      "Known knowledge limits, out-of-scope inputs and the oversight expected of operators are documented and surfaced in user-facing guidance.",
    auditor_feedback: "Knowledge limits are documented; make them more visible in the product.",
  },
  "MAP-2.3": {
    implementation_description:
      "Experimental design, dataset selection rationale, representativeness analysis and construct validity are documented for each model.",
    auditor_feedback: "TEVV documentation is sound for the flagship models.",
  },
  "MAP-3.1": {
    implementation_description:
      "Expected benefits are stated per system together with the measures that will show whether they were realised.",
    auditor_feedback: "Benefits are stated with measures attached.",
  },
  "MAP-3.2": {
    implementation_description:
      "Cost of error is assessed per system, including non-monetary harm to individuals, and compared against risk tolerance.",
    auditor_feedback: "Cost-of-error analysis covers non-monetary harm.",
  },
  "MAP-3.3": {
    implementation_description:
      "Permitted application scope is specified per system, along with the conditions that put a use case out of scope.",
    auditor_feedback: "Scope boundaries are explicit and enforced in configuration.",
  },
  "MAP-3.4": {
    implementation_description:
      "Operator proficiency expectations are defined, with onboarding checks before access to AI-assisted workflows is granted.",
    auditor_feedback: "Proficiency checks are in place; record the refresher cadence.",
  },
  "MAP-3.5": {
    implementation_description:
      "The oversight mode set by policy is implemented per system, including override capability and logging of every override.",
    auditor_feedback: "Oversight implementation matches the governing policy.",
  },
  "MAP-4.1": {
    implementation_description:
      "Legal and IP risk is assessed for each component including third-party models, datasets and open-source libraries, with licence terms recorded.",
    auditor_feedback: "Component-level legal review is documented.",
  },
  "MAP-4.2": {
    implementation_description:
      "The internal controls applying to each component — gateway routing, guardrails, access control and logging — are identified, and coverage gaps recorded.",
    auditor_feedback: "Component controls are identified; close the recorded gaps.",
  },
  "MAP-5.1": {
    implementation_description:
      "Likelihood and magnitude are rated for each identified impact, using past incidents, public incident reports and external feedback as inputs.",
    auditor_feedback: "Impact ratings are evidence-based.",
  },
  "MAP-5.2": {
    implementation_description:
      "Named roles are responsible for ongoing engagement with affected groups, sessions are scheduled, and notes feed into the risk register.",
    auditor_feedback: "Engagement is scheduled; attendance from affected groups is still low.",
  },
  "MEASURE-1.1": {
    implementation_description:
      "Metrics are selected for the highest-rated risks first, and the risks that cannot currently be measured are documented as such.",
    auditor_feedback: "Metric selection is risk-led and unmeasurable risks are acknowledged.",
  },
  "MEASURE-1.2": {
    implementation_description:
      "Metric appropriateness and control effectiveness are reviewed quarterly, including error reports and any impact on affected communities.",
    auditor_feedback: "Quarterly review is happening; capture the resulting metric changes.",
  },
  "MEASURE-1.3": {
    implementation_description:
      "Internal reviewers outside the build team, plus an external assessor for high-risk systems, take part on a defined assessment schedule.",
    auditor_feedback: "Independence of assessors is satisfactory.",
  },
  "MEASURE-2.1": {
    implementation_description:
      "Test sets, metric definitions and tooling versions are documented for each evaluation so results can be reproduced.",
    auditor_feedback: "Evaluation artefacts are reproducible.",
  },
  "MEASURE-2.2": {
    implementation_description:
      "Evaluations involving people go through an approval step covering consent, participant protection and representativeness of the sample.",
    auditor_feedback: "Human-subject safeguards are in place for the studies reviewed.",
  },
  "MEASURE-2.3": {
    implementation_description:
      "Performance is measured against acceptance criteria on data representative of the deployment setting, and the results recorded.",
    auditor_feedback: "Testing conditions reasonably reflect deployment.",
  },
  "MEASURE-2.4": {
    implementation_description:
      "Production behaviour is monitored against the baselines set during MAP, with alerting on drift, error-rate and latency thresholds.",
    auditor_feedback: "Production monitoring is live with alert thresholds agreed.",
  },
  "MEASURE-2.5": {
    implementation_description:
      "Validity and reliability are demonstrated before deployment, and the conditions beyond which results do not generalise are documented.",
    auditor_feedback: "Generalisability limits are documented clearly.",
  },
  "MEASURE-2.6": {
    implementation_description:
      "Safety risks are evaluated on a regular schedule, residual risk is confirmed within tolerance, and fail-safe behaviour beyond knowledge limits is tested.",
    auditor_feedback: "Fail-safe behaviour has been tested; add response-time measures.",
  },
  "MEASURE-2.7": {
    implementation_description:
      "Prompt injection, model extraction, data poisoning and denial-of-service exposure are assessed, and resilience test outcomes recorded.",
    auditor_feedback: "Security evaluation covers the AI-specific attack classes.",
  },
  "MEASURE-2.8": {
    implementation_description:
      "Whether users can tell they are interacting with AI, and whether decisions trace to an accountable owner, are both examined and documented.",
    auditor_feedback:
      "Transparency obligations are met and the accountability chain is documented.",
  },
  "MEASURE-2.9": {
    implementation_description:
      "Model documentation carries explanation methods appropriate to the model class, validated against expert review, with guidance on reading outputs in context.",
    auditor_feedback: "Explanations are appropriate to the audience.",
  },
  "MEASURE-2.10": {
    implementation_description:
      "Privacy risk including memorisation, re-identification and inference exposure is examined, and the mitigations applied are documented.",
    auditor_feedback: "Privacy analysis is thorough for the models assessed.",
  },
  "MEASURE-2.11": {
    implementation_description:
      "Fairness is evaluated across protected groups against agreed metrics and thresholds, with results and remediation documented.",
    auditor_feedback: "Fairness testing is documented with thresholds stated.",
  },
  "MEASURE-2.12": {
    implementation_description:
      "The energy and compute footprint of training and serving is estimated and recorded alongside the efficiency measures taken.",
    auditor_feedback:
      "Footprint is estimated; measurement rather than estimation would be stronger.",
  },
  "MEASURE-2.13": {
    implementation_description:
      "Whether the TEVV metrics in use actually detect the risks they were chosen for is reviewed, and metrics that do not are retired.",
    auditor_feedback: "Metric effectiveness is reviewed and acted on.",
  },
  "MEASURE-3.1": {
    implementation_description:
      "Known and emergent AI risks are tracked in the risk register, fed by production monitoring, incident reports and user feedback.",
    auditor_feedback: "Emergent risk tracking is operating.",
  },
  "MEASURE-3.2": {
    implementation_description:
      "Where no metric exists, qualitative review panels and documented expert judgement are used, and the risk is recorded as unmeasured.",
    auditor_feedback: "The qualitative approach is reasonable and documented.",
  },
  "MEASURE-3.3": {
    implementation_description:
      "End users can report problems and appeal AI-influenced outcomes; appeals route to a human reviewer and are tracked to resolution.",
    auditor_feedback: "Appeal route exists; publish the resolution times.",
  },
  "MEASURE-4.1": {
    implementation_description:
      "Measurement approaches are set in consultation with domain experts and operators of the deployed system, and the rationale documented.",
    auditor_feedback: "Measurement design reflects the real deployment context.",
  },
  "MEASURE-4.2": {
    implementation_description:
      "Trustworthiness results are validated with domain experts and operators to confirm the system behaves as intended in context.",
    auditor_feedback: "Expert validation of results is documented.",
  },
  "MEASURE-4.3": {
    implementation_description:
      "Performance is compared over time against field data and consultation findings, and improvements and declines are recorded with their causes.",
    auditor_feedback: "Trend reporting is in place; extend the history.",
  },
  "MANAGE-1.1": {
    implementation_description:
      "A go/no-go decision is required at the deployment gate, recording whether the system met its stated objectives and who approved proceeding.",
    auditor_feedback: "Go/no-go decisions are recorded with the evidence relied on.",
  },
  "MANAGE-1.2": {
    implementation_description:
      "Risk treatment is prioritised by impact and likelihood against available resources, and reviewed by the governance committee.",
    auditor_feedback: "Prioritisation is consistent with the stated tolerances.",
  },
  "MANAGE-1.3": {
    implementation_description:
      "Each high-priority risk has a documented response — mitigate, transfer, avoid or accept — with an owner, a plan and a target date.",
    auditor_feedback: "Response options and owners are clear.",
  },
  "MANAGE-1.4": {
    implementation_description:
      "Residual risk after mitigation is recorded and communicated to downstream acquirers and, where relevant, to end users.",
    auditor_feedback: "Residual risk is disclosed to the right audiences.",
  },
  "MANAGE-2.1": {
    implementation_description:
      "The resourcing needed to manage each system's risks is assessed, along with whether a non-AI alternative would reduce impact or likelihood.",
    auditor_feedback: "Non-AI alternatives were genuinely considered.",
  },
  "MANAGE-2.2": {
    implementation_description:
      "Deployed systems are sustained through scheduled retraining, data-quality checks and periodic review of continued fitness for purpose.",
    auditor_feedback: "Sustainment activities are on schedule.",
  },
  "MANAGE-2.3": {
    implementation_description:
      "A procedure for newly discovered risks covers containment, assessment, treatment and communication.",
    auditor_feedback: "Procedure has been exercised at least once this period.",
  },
  "MANAGE-2.4": {
    implementation_description:
      "A documented and tested means exists to disable or override automated operation, with assigned responsibility for invoking it.",
    auditor_feedback: "Override capability is assigned and tested.",
  },
  "MANAGE-3.1": {
    implementation_description:
      "Third-party AI services are monitored for model changes, incidents and policy updates, with response in line with risk tolerance.",
    auditor_feedback: "Third-party monitoring is active; capture provider model-change notices.",
  },
  "MANAGE-3.2": {
    implementation_description:
      "Agreements with AI providers cover data use and retention, model security, privacy terms, intellectual property and data ownership.",
    auditor_feedback: "Agreement coverage is complete for the current providers.",
  },
  "MANAGE-3.3": {
    implementation_description:
      "Response plans for incidents originating in third-party software or data are documented and resourced, including provider escalation paths.",
    auditor_feedback: "Third-party incident plans name the escalation contacts.",
  },
  "MANAGE-4.1": {
    implementation_description:
      "Post-deployment monitoring covers user input, appeal and override, incident response, recovery, change management and decommissioning.",
    auditor_feedback: "Post-deployment plan covers the full set of required mechanisms.",
  },
  "MANAGE-4.2": {
    implementation_description:
      "Continuous improvement measures for performance, risk reduction and resilience are tracked, with a defined path for updates and discontinuance.",
    auditor_feedback: "Improvement measures are quantified.",
  },
  "MANAGE-4.3": {
    implementation_description:
      "Incidents are communicated to affected parties per the notification matrix, and post-incident reviews produce actions tracked to closure.",
    auditor_feedback: "Incident communication and learning are both evidenced.",
  },
  "MANAGE-4.4": {
    implementation_description:
      "Incidents spanning organisational or liability boundaries follow a defined process, with joint response contacts agreed in advance.",
    auditor_feedback: "Cross-boundary process is agreed; rehearse it with key partners.",
  },
};
