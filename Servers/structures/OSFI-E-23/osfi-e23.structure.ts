import type { FrameworkStructure } from "../types";

export const osfiE23Structure: FrameworkStructure = {
  id: 26,
  key: "osfi-e23",
  framework_type: "osfi_e23",
  displayName: "OSFI E-23 Model Risk Management",
  tables: {
    l1_struct: "osfi_e23_principles_struct",
    l2_struct: "osfi_e23_requirements_struct",
    l2_impl: "osfi_e23_requirements",
    l2_risks: "osfi_e23_requirements__risks",
  },
  cols: {
    l2_struct_parent: "principle_id",
    l2_impl_meta: "requirement_meta_id",
    l2_risks_impl: "requirement_id",
  },
  entity_types: {
    l2_impl: "requirement",
  },
  source_labels: {
    requirement: "OSFI E-23 requirements",
  },
  seed: {
    name: "OSFI E-23 Model Risk Management",
    description:
      "Enterprise-wide, risk-based expectations for governing models across their lifecycle, including AI and machine learning models, at federally regulated financial institutions in Canada. Based on OSFI Guideline E-23 – Model Risk Management (2027), published September 11, 2025, effective May 1, 2027. Requirements are paraphrased; see https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/guideline-e-23-model-risk-management-2027 for the official text.",
    version: "2027",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Principle",
      level2_name: "Requirement",
    },
    structure: [
      {
        title: "Principle 1.1 – Organizational enablement (B.1)",
        description:
          "Reporting lines and resourcing should be set up so that model governance can work properly.",
        order_no: 1,
        items: [
          {
            title: "1.1.1 MRM roles, accountabilities and expectations set by senior management",
            description:
              "Senior management defines who does what in model risk management across the whole enterprise and what is expected of them, and makes sure those roles are applied in practice.",
            order_no: 1,
            summary:
              "Senior management defines and applies enterprise-wide MRM roles and expectations",
            questions: [
              "Are MRM roles and accountabilities defined and approved by senior management?",
              "Are expectations for each role communicated across business and control functions?",
              "How does senior management confirm the roles are applied in practice?",
            ],
            evidence_examples: [
              "MRM roles and responsibilities document",
              "Senior management approval records",
              "RACI matrix for model governance",
            ],
          },
          {
            title: "1.1.2 MRM staff with the needed skills, including for AI",
            description:
              "People working on model risk need the right skills and experience, especially where the institution uses newer technologies such as AI. Senior management is responsible for putting them in place.",
            order_no: 2,
            summary: "MRM personnel have the skills and experience required, including for AI",
            questions: [
              "What skills and experience are required for each MRM role?",
              "Are there gaps in expertise for AI and other novel techniques?",
              "How are skills maintained through training or hiring?",
            ],
            evidence_examples: [
              "Competency matrix for MRM roles",
              "Training and certification records",
              "Staffing and skills gap assessment",
            ],
          },
          {
            title: "1.1.3 Model risk reporting to the board",
            description:
              "Model risk is communicated and reported to the board of directors through appropriate channels, so the board has a sound picture of the exposure.",
            order_no: 3,
            summary: "Model risk is appropriately communicated and reported to the board",
            questions: [
              "How often does the board receive model risk reporting?",
              "What content does the reporting include, such as inventory, ratings and breaches?",
              "How are board questions or decisions on model risk tracked?",
            ],
            evidence_examples: [
              "Board or committee model risk reports",
              "Meeting minutes referencing model risk",
              "Reporting calendar and templates",
            ],
          },
          {
            title: "1.1.4 Multi-disciplinary MRM team, including legal or ethics",
            description:
              "Model risk work draws on people from many functions, with legal or ethics expertise where relevant. This matters more as AI and machine learning raise model complexity and potential impact.",
            order_no: 4,
            summary: "MRM draws on a multi-disciplinary team, including legal or ethics expertise",
            questions: [
              "Which functions take part in MRM activities?",
              "When are legal or ethics professionals involved?",
              "How is the team's mix of expertise reviewed as AI use grows?",
            ],
            evidence_examples: [
              "MRM committee charter and membership list",
              "Terms of reference for cross-functional working groups",
              "Records of legal or ethics consultation on models",
            ],
          },
          {
            title: "1.1.5 Adequate, evidenced MRM resourcing",
            description:
              "Resources for model risk management are sufficient and directed to where identified risks are greatest. The institution can show evidence that its structure and resourcing support sound governance.",
            order_no: 5,
            summary:
              "MRM is resourced adequately, allocated to risk, and the resourcing can be evidenced",
            questions: [
              "How are MRM resources allocated against identified model risks?",
              "How does the institution assess whether resourcing is sufficient?",
              "What evidence can be shown to a supervisor that the structure supports governance?",
            ],
            evidence_examples: [
              "MRM budget and headcount plans",
              "Resource allocation analysis by risk rating",
              "Organization charts for MRM functions",
            ],
          },
        ],
      },
      {
        title: "Principle 1.2 – Model risk management framework (B.2)",
        description:
          "The MRM framework should tie risk-taking to strategic objectives and the institution's appetite for model risk.",
        order_no: 2,
        items: [
          {
            title: "1.2.1 Fits the broader risk and governance framework",
            description:
              "The MRM framework sits within the institution's wider risk and governance arrangements rather than operating on its own, consistent with OSFI's corporate governance expectations.",
            order_no: 1,
            summary: "MRM framework is integrated with the broader risk and governance framework",
            questions: [
              "How does the MRM framework link to enterprise risk management and corporate governance?",
              "Are escalation paths shared with other risk disciplines?",
              "Who owns the alignment between the frameworks?",
            ],
            evidence_examples: [
              "MRM framework document with cross-references to enterprise risk policies",
              "Governance structure diagram",
              "Risk committee terms of reference",
            ],
          },
          {
            title: "1.2.2 Reflects risk appetite for model risk",
            description:
              "The framework expresses how much model risk the institution is willing to accept, so that its requirements and limits follow from that appetite.",
            order_no: 2,
            summary: "MRM framework reflects the institution's risk appetite for model risk",
            questions: [
              "Is there a stated appetite or tolerance for model risk?",
              "Who approved it and how often is it revisited?",
              "How do framework requirements trace back to the appetite?",
            ],
            evidence_examples: [
              "Risk appetite statement covering model risk",
              "Board or committee approval record",
              "Appetite metrics and thresholds",
            ],
          },
          {
            title: "1.2.3 Processes to identify, assess, manage, monitor and report",
            description:
              "The framework sets out the processes and requirements for finding, assessing, managing, monitoring and reporting on model risk.",
            order_no: 3,
            summary: "Framework defines processes for the full model risk cycle",
            questions: [
              "Is each of identify, assess, manage, monitor and report covered by a defined process?",
              "Who is responsible for each process?",
              "How are the processes tested to confirm they work?",
            ],
            evidence_examples: [
              "MRM framework and procedures",
              "Process maps for model risk activities",
              "Control testing results",
            ],
          },
          {
            title:
              "1.2.4 Guidelines for identification, inventory, ratings and lifecycle governance",
            description:
              "The framework gives clear direction on its major building blocks: how models are identified, how the inventory is kept, how risk ratings work, and what governance applies across the lifecycle.",
            order_no: 4,
            summary:
              "Clear guidance exists for identification, inventory, ratings and lifecycle governance",
            questions: [
              "Is there a written standard for each major component?",
              "Do the standards cover model identification and inventory maintenance?",
              "Do they set out risk rating and lifecycle governance requirements?",
            ],
            evidence_examples: [
              "Model identification standard",
              "Model inventory standard",
              "Model risk rating methodology",
              "Lifecycle governance standard",
            ],
          },
          {
            title: "1.2.5 Consistent reporting at each level of the enterprise",
            description:
              "The framework describes how model risk is reported in a transparent and consistent way, from individual business units up to enterprise level.",
            order_no: 5,
            summary: "Model risk reporting is transparent and consistent across levels",
            questions: [
              "Which reports exist at business unit, function and enterprise level?",
              "Are definitions and metrics consistent between levels?",
              "How is reporting quality checked?",
            ],
            evidence_examples: [
              "Reporting templates and metric definitions",
              "Sample reports at each level",
              "Reporting hierarchy description",
            ],
          },
          {
            title: "1.2.6 Periodic review of the framework, including for new technology",
            description:
              "The framework is reviewed on a regular basis, with particular attention when new technologies emerge, so it stays fit for purpose.",
            order_no: 6,
            summary: "Framework is reviewed periodically and when new technology appears",
            questions: [
              "How often is the MRM framework reviewed?",
              "Is there a trigger for review when new technologies are adopted?",
              "How are review outcomes approved and tracked to completion?",
            ],
            evidence_examples: [
              "Framework review schedule",
              "Review reports and approved changes",
              "Version history of framework documents",
            ],
          },
          {
            title: "1.2.7 Covers externally sourced models and data (B-10)",
            description:
              "The framework extends to models and data that come from outside the institution, such as foreign offices or third-party vendors, in line with OSFI's third-party risk guideline B-10.",
            order_no: 7,
            summary: "Framework covers models and data from foreign offices and third parties",
            questions: [
              "Are externally sourced models and data in scope of the framework?",
              "How are they aligned with third-party risk management requirements?",
              "Who is accountable for models obtained from group entities or vendors?",
            ],
            evidence_examples: [
              "Framework scope statement covering external models and data",
              "Third-party risk assessments for model vendors",
              "Contractual terms on model documentation and access",
            ],
          },
        ],
      },
      {
        title: "Principle 1.3 – Use of models (B.3)",
        description: "Models should be fit for the business purposes they serve.",
        order_no: 3,
        items: [
          {
            title: "1.3.1 Models used only where they add value and are reliable",
            description:
              "A model should be deployed only when it genuinely contributes to decisions, risk assessment or another business purpose, and produces reliable results for its intended use.",
            order_no: 1,
            summary: "Models are used only where they contribute value and perform reliably",
            questions: [
              "How is the business benefit of a model established before use?",
              "How is reliability for the intended use demonstrated?",
              "Who decides whether a model is the right tool for the task?",
            ],
            evidence_examples: [
              "Business case or use justification for the model",
              "Performance and reliability assessment",
              "Approval record confirming intended use",
            ],
          },
          {
            title: "1.3.2 Clear purpose backed by adequate data, systems and technology",
            description:
              "Building, deploying and using a model rests on a clear purpose plus adequate data, systems and technology. These foundations should be part of every discussion of model risk.",
            order_no: 2,
            summary:
              "Model purpose is clear and supported by adequate data, systems and technology",
            questions: [
              "Is the purpose of each model stated clearly?",
              "Are data, systems and technology capacity assessed as part of model risk discussions?",
              "What gaps have been identified and how are they handled?",
            ],
            evidence_examples: [
              "Model purpose statements",
              "Data and infrastructure readiness assessment",
              "Model risk committee discussion records",
            ],
          },
          {
            title: "1.3.3 Unfit models modified, replaced or decommissioned",
            description:
              "As the organization's needs change, a model that no longer suits its purpose is changed, replaced or retired.",
            order_no: 3,
            summary: "Models that are no longer fit for purpose are modified, replaced or retired",
            questions: [
              "How are models checked for continued fitness for purpose?",
              "What process leads to modification, replacement or decommissioning?",
              "Who makes and records that decision?",
            ],
            evidence_examples: [
              "Fitness-for-purpose review records",
              "Model change or retirement decisions",
              "Replacement plans for outdated models",
            ],
          },
        ],
      },
      {
        title: "Principle 2.1 – Model identification (C.1)",
        description:
          "Institutions should identify and keep track of every model in use or recently decommissioned.",
        order_no: 4,
        items: [
          {
            title:
              "2.1.1 Periodic enterprise-wide identification, including vendor and third-party models",
            description:
              "The institution has defined processes to regularly survey the whole enterprise for models, covering vendor and third-party models, and to update the status of models already known.",
            order_no: 1,
            summary:
              "Models are identified periodically across the enterprise, including external ones",
            questions: [
              "How often is the enterprise surveyed for new and changed models?",
              "Are vendor and third-party models included in the survey?",
              "How is the status of known models refreshed?",
            ],
            evidence_examples: [
              "Model identification procedure",
              "Survey results or attestations from business units",
              "List of vendor and third-party models",
            ],
          },
          {
            title: "2.1.2 Triage for non-negligible inherent risk",
            description:
              "Identified items are triaged to decide whether they carry non-negligible inherent model risk and so fall under lifecycle governance. Items without model risk may not need the full set of requirements.",
            order_no: 2,
            summary:
              "Identified models are triaged to determine whether lifecycle governance applies",
            questions: [
              "What criteria decide whether inherent model risk is non-negligible?",
              "Who performs and approves the triage decision?",
              "How are items that fall out of scope recorded?",
            ],
            evidence_examples: [
              "Triage criteria and decision tree",
              "Triage outcome log",
              "Approval records for out-of-scope items",
            ],
          },
          {
            title: "2.1.3 Provisional rating for new models and re-rating on material change",
            description:
              "A new model receives an initial rating, and an existing model is re-rated when its substance or usage has changed materially.",
            order_no: 3,
            summary: "New models get a provisional rating; materially changed models are re-rated",
            questions: [
              "Is a provisional rating assigned when a model is first identified?",
              "What counts as a material change in substance or usage?",
              "How quickly is a re-rating completed after such a change?",
            ],
            evidence_examples: [
              "Provisional rating records",
              "Material change definition",
              "Re-rating records with trigger and date",
            ],
          },
          {
            title: "2.1.4 Enterprise-level model inventory as system of record",
            description:
              "The institution keeps a complete inventory of models with non-negligible inherent risk, maintained at enterprise level. It holds key model information and is the basis for management and regulatory reporting.",
            order_no: 4,
            summary: "A comprehensive enterprise inventory is the system of record for models",
            questions: [
              "Does the inventory contain all models with non-negligible inherent risk?",
              "Is it maintained centrally for the whole enterprise?",
              "Is it used as the source for management and regulatory reports?",
            ],
            evidence_examples: [
              "Model inventory extract",
              "Inventory policy or standard",
              "Reports produced from the inventory",
            ],
          },
          {
            title: "2.1.5 Accurate, controlled, timely inventory updates",
            description:
              "The inventory is kept accurate and current, protected by robust controls, and updated promptly when models change, are used differently, are re-rated or change in performance status.",
            order_no: 5,
            summary: "Inventory is accurate, controlled and updated promptly on changes",
            questions: [
              "What controls protect the accuracy of inventory entries?",
              "What is the expected time to update after a change in model, use, rating or performance?",
              "How are inventory completeness and accuracy tested?",
            ],
            evidence_examples: [
              "Inventory change log",
              "Inventory control testing or reconciliation results",
              "Access and change-control rules for the inventory",
            ],
          },
          {
            title: "2.1.6 Decommissioned models kept in the inventory",
            description:
              "Models that have been retired remain in the inventory for a period the institution considers reasonable.",
            order_no: 6,
            summary: "Decommissioned models stay in the inventory for a defined period",
            questions: [
              "How long are decommissioned models retained in the inventory?",
              "How is the retention period justified?",
              "Are retired models clearly flagged as such?",
            ],
            evidence_examples: [
              "Inventory retention rule",
              "Inventory records showing retired status",
              "Decommissioning completion records",
            ],
          },
        ],
      },
      {
        title: "Principle 2.2 – Model risk rating (C.2)",
        description:
          "Institutions should use a rating approach that assesses the key dimensions of model risk.",
        order_no: 5,
        items: [
          {
            title: "2.2.1 Rating approach based on inherent risk",
            description:
              "Ratings are based on inherent model risk, reflecting both how vulnerable a model is and how material its impacts are. This lets critical or complex models get closer scrutiny while lower-risk ones face lighter requirements.",
            order_no: 1,
            summary: "Rating approach reflects inherent risk: vulnerabilities and materiality",
            questions: [
              "Is the rating approach built on inherent model risk?",
              "Does it capture both vulnerability and materiality of impact?",
              "How does it differentiate requirements between higher and lower rated models?",
            ],
            evidence_examples: [
              "Model risk rating methodology",
              "Rating scale definitions",
              "Mapping of rating tiers to governance requirements",
            ],
          },
          {
            title: "2.2.2 Measurable quantitative and qualitative criteria",
            description:
              "Each risk dimension has clear, measurable criteria that blend quantitative factors, such as portfolio size or potential financial impact, and qualitative ones, such as use, complexity, autonomy, data reliability, customer impact or regulatory exposure.",
            order_no: 2,
            summary: "Rating uses clear quantitative and qualitative criteria for each dimension",
            questions: [
              "Which quantitative factors are used, such as portfolio size, growth or potential impact?",
              "Which qualitative factors are used, such as complexity, autonomy, data reliability, customer or regulatory impact?",
              "Are the criteria measurable and applied consistently?",
              "Are risk dimensions organized in a way that suits the institution?",
            ],
            evidence_examples: [
              "Rating criteria and scoring guide",
              "Completed rating worksheets",
              "Calibration or consistency review results",
            ],
          },
          {
            title: "2.2.3 Every model rated through a defined process",
            description:
              "Each model is assigned a rating through a defined process. A temporary rating may be used first and then confirmed at model review or approval.",
            order_no: 3,
            summary: "Every model receives a rating through a defined process",
            questions: [
              "Does every inventoried model have a current rating?",
              "Is there a defined process for assigning and approving ratings?",
              "Where a temporary rating is used, when is it confirmed?",
            ],
            evidence_examples: [
              "Rating procedure",
              "Inventory showing rating for each model",
              "Rating confirmation at review or approval",
            ],
          },
          {
            title: "2.2.4 Regular and trigger-based rating review",
            description:
              "Ratings are looked at on a regular basis and updated when needed, including after trigger events such as weaker performance or a material change in the model's use, data or infrastructure.",
            order_no: 4,
            summary: "Ratings are reviewed regularly and when trigger events occur",
            questions: [
              "How often are ratings reassessed?",
              "Which trigger events force an early reassessment?",
              "How are rating changes approved and recorded?",
            ],
            evidence_examples: [
              "Rating review schedule",
              "Trigger event definitions",
              "Rating change history",
            ],
          },
          {
            title: "2.2.5 Approved and tracked negligible-risk exemptions",
            description:
              "If a rating category implies negligible inherent risk and so exempts a model from full lifecycle governance, the institution has a robust process to approve and track each exemption.",
            order_no: 5,
            summary: "Negligible-risk exemptions are approved through a robust process and tracked",
            questions: [
              "Is there a negligible-risk category and what are its criteria?",
              "Who approves an exemption?",
              "How are exemptions tracked and revisited?",
            ],
            evidence_examples: [
              "Exemption policy and criteria",
              "Exemption approval records",
              "Register of exempted models",
            ],
          },
          {
            title: "2.2.6 Standalone rating of external models",
            description:
              "Models developed outside the institution are rated on their own merits, rather than inheriting a rating from the supplier or another source.",
            order_no: 6,
            summary: "Externally developed models are rated on a standalone basis",
            questions: [
              "Are external models rated using the same methodology as internal ones?",
              "What information is obtained from the supplier to support rating?",
              "Who is accountable for the rating of an external model?",
            ],
            evidence_examples: [
              "Rating records for vendor models",
              "Vendor documentation used in assessment",
              "Procedure for rating external models",
            ],
          },
          {
            title: "2.2.7 Inherent and residual risk visible to senior management",
            description:
              "Residual risk is not meant to drive primary governance, but showing both inherent and residual model risk reveals how much the controls mitigate and informs reporting to senior management.",
            order_no: 7,
            summary: "Both inherent and residual model risk are visible for management reporting",
            questions: [
              "Is residual model risk assessed alongside inherent risk?",
              "Are both reported to senior management?",
              "Is it clear that primary governance follows inherent risk?",
            ],
            evidence_examples: [
              "Residual risk assessment method",
              "Management reports showing inherent and residual risk",
              "Model-level risk summaries",
            ],
          },
          {
            title: "2.2.8 Remediation when model risk exceeds appetite",
            description:
              "Where model risk falls outside what the institution is prepared to accept, appropriate remediation actions are put in place.",
            order_no: 8,
            summary: "Remediation is established when model risk is outside appetite",
            questions: [
              "How is model risk compared against appetite?",
              "What remediation options exist and who decides?",
              "How are remediation actions tracked to closure?",
            ],
            evidence_examples: [
              "Appetite breach reports",
              "Remediation action plans",
              "Issue tracking records with closure evidence",
            ],
          },
        ],
      },
      {
        title: "Principle 2.3 – Risk management intensity (C.3)",
        description:
          "The scope, scale and intensity of model risk management should match the risk the model introduces.",
        order_no: 6,
        items: [
          {
            title:
              "2.3.1 Rating drives review, documentation, approval authority, monitoring and re-rating interval",
            description:
              "The inherent risk rating sets how often and how deeply a model is reviewed and monitored, how much documentation is needed, who has authority to approve it, and how often its rating is reassessed.",
            order_no: 1,
            summary: "Inherent risk rating sets the intensity of governance across the lifecycle",
            questions: [
              "Does the rating determine review frequency, depth and scope?",
              "Does it determine documentation and approval authority?",
              "Does it determine monitoring intensity and the re-rating interval?",
            ],
            evidence_examples: [
              "Requirements matrix by risk rating",
              "Approval authority table",
              "Review and monitoring schedules by rating",
            ],
          },
          {
            title:
              "2.3.2 Rating and review drive usage limits, monitoring intensity and residual-risk controls",
            description:
              "Together with findings from model review and the institution's appetite, the rating also shapes constraints on use, how closely a model is monitored, and the controls used to manage what risk remains.",
            order_no: 2,
            summary:
              "Rating and review results shape usage limits, monitoring and residual-risk controls",
            questions: [
              "How are limits or constraints on model use decided after review?",
              "Are models with known limitations monitored more closely?",
              "Which controls manage residual risk, such as conservatism, reserves or contingency plans?",
            ],
            evidence_examples: [
              "Model use restrictions recorded at approval",
              "Enhanced monitoring plans for models with limitations",
              "Residual risk mitigation plans",
            ],
          },
          {
            title:
              "2.3.3 Extra criteria (e.g. by model type) and governance maturity matching AI/ML use",
            description:
              "Additional requirements may apply by criteria such as model type, but they sit on top of the main risk-based rules. Governance capability should be as mature as the complexity of what is used, so heavy AI/ML use calls for correspondingly mature oversight.",
            order_no: 3,
            summary:
              "Supplementary criteria are layered on risk-based rules; governance maturity matches complexity",
            questions: [
              "Are there extra requirements by model type, and are they additional to risk-based rules?",
              "How is MRM capability assessed against the complexity of models in use?",
              "What oversight is applied to advanced AI/ML techniques?",
            ],
            evidence_examples: [
              "Model-type specific standards",
              "MRM maturity or capability assessment",
              "AI/ML governance procedures",
            ],
          },
        ],
      },
      {
        title: "Principle 3.1 – Policies, procedures and controls (D.1)",
        description:
          "MRM policies, procedures and controls should be robust and flexible, and lead to effective requirements across the model lifecycle.",
        order_no: 7,
        items: [
          {
            title: "3.1.1 Lifecycle policies applied to all models in proportion to risk",
            description:
              "Policies, procedures and controls cover the full model lifecycle and apply to every model, scaled to its level of risk.",
            order_no: 1,
            summary: "Lifecycle policies cover all models in proportion to their risk",
            questions: [
              "Do policies and procedures span every lifecycle stage?",
              "Do they apply to all in-scope models?",
              "How is proportionality to risk built in?",
            ],
            evidence_examples: [
              "Model lifecycle policy",
              "Procedures for each lifecycle stage",
              "Scope statement and applicability matrix",
            ],
          },
          {
            title: "3.1.2 Consistent governance across the enterprise",
            description:
              "Governance structures and practices remain sound and are applied in the same way across all parts of the enterprise.",
            order_no: 2,
            summary: "Governance structures and practices are sound and consistent enterprise-wide",
            questions: [
              "How is consistency ensured between business lines and entities?",
              "How are deviations from standard practice identified?",
              "Who monitors consistent application?",
            ],
            evidence_examples: [
              "Cross-business-line governance reviews",
              "Exception and deviation register",
              "Compliance or internal audit reports on MRM",
            ],
          },
          {
            title: "3.1.3 Explicit stakeholder responsibilities",
            description:
              "Policies spell out the responsibilities and accountability of each kind of stakeholder, including owners, reviewers and users.",
            order_no: 3,
            summary: "Responsibilities and accountability are explicit for each model stakeholder",
            questions: [
              "Are duties defined for owners, developers, reviewers, approvers and users?",
              "Is accountability for each model assigned to a named role?",
              "How are responsibilities communicated and acknowledged?",
            ],
            evidence_examples: [
              "Stakeholder responsibility matrix",
              "Role descriptions",
              "Model-level ownership assignments",
            ],
          },
          {
            title: "3.1.4 Key stakeholders involved early",
            description:
              "Teams such as data science, business units, compliance, ethics, legal, IT and risk management take part from the early stages of the model lifecycle, not only at the end.",
            order_no: 4,
            summary: "Key stakeholders are involved early in the model lifecycle",
            questions: [
              "Which stakeholder groups must be consulted at the start of a model project?",
              "Is early involvement required by procedure?",
              "How is early engagement recorded?",
            ],
            evidence_examples: [
              "Model project intake checklist",
              "Stakeholder consultation records",
              "Kick-off meeting minutes",
            ],
          },
          {
            title: "3.1.5 Independence and objectivity",
            description:
              "Appropriate independence and objectivity are preserved across lifecycle activities, so that those challenging a model are not the same people who built or rely on it.",
            order_no: 5,
            summary: "Independence and objectivity are maintained across the lifecycle",
            questions: [
              "Where is independence required, and how is it ensured?",
              "How are conflicts of interest identified and managed?",
              "Do reviewers have authority and reporting lines free of influence from developers or users?",
            ],
            evidence_examples: [
              "Independence requirements in policy",
              "Organization chart showing separation of duties",
              "Conflict of interest declarations",
            ],
          },
          {
            title: "3.1.6 Flexible for new technologies and model types",
            description:
              "Policies are flexible enough to handle evolving technology, different kinds of model (notably opaque or autonomous AI/ML models), varying risk levels and organizational change.",
            order_no: 6,
            summary:
              "Policies adapt to new technologies, model types, risk levels and organizational change",
            questions: [
              "How do policies accommodate opaque or autonomous models?",
              "How are they updated when technology or organization changes?",
              "Is there a route to apply tailored controls for new model types?",
            ],
            evidence_examples: [
              "Policy update log",
              "Guidance for AI/ML and other novel model types",
              "Change management records for policy revisions",
            ],
          },
          {
            title: "3.1.7 Policies and procedures fully documented",
            description:
              "Policies, procedures and controls are documented comprehensively and in enough detail to be applied consistently.",
            order_no: 7,
            summary: "Policies, procedures and controls are comprehensively documented",
            questions: [
              "Are all lifecycle policies and procedures documented and current?",
              "Is documentation version-controlled and accessible to those who need it?",
              "How is completeness of documentation reviewed?",
            ],
            evidence_examples: [
              "Policy and procedure library with version history",
              "Document review and approval records",
              "Documentation gap analysis",
            ],
          },
        ],
      },
    ],
  },
};

export default osfiE23Structure;
