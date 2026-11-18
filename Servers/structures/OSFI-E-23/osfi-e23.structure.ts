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
          "Every model that is currently in use, or was retired not long ago, should be found and kept on the institution's radar.",
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
          "A rating method is needed that scores each model against the main dimensions along which model risk arises.",
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
          "Written policies, procedures and controls need to be sturdy yet adaptable, so that what they require works well at every lifecycle stage.",
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
      {
        title: "Model design – rationale (D.2)",
        description:
          "Before a model is built or changed, its owner makes the case for it: what it is for, which business problem it addresses and what could go wrong in that use.",
        order_no: 8,
        items: [
          {
            title: "3.1.8 Defined purpose, scope, coverage and output use",
            description:
              "The model owner writes down why a model is being introduced or changed, what it covers and how its results will feed decisions. For a modification, the write-up explains what drives the change.",
            order_no: 1,
            summary:
              "Purpose, scope, coverage and output use are defined before building or changing a model",
            questions: [
              "Is there a written statement of purpose for each new or modified model?",
              "Does it set out scope and the population or portfolio covered?",
              "Does it say how outputs will be consumed and by whom?",
              "For a modification, is the reason for the change explained?",
            ],
            evidence_examples: [
              "Model proposal or business case",
              "Model change request",
              "Scope and intended-use statement",
            ],
          },
          {
            title: "3.1.9 Business use case and intended-use risk",
            description:
              "Each model is tied to a concrete business use case, and the risk that comes with using it in that way is assessed up front.",
            order_no: 2,
            summary: "The business use case is identified and the risk of intended use is assessed",
            questions: [
              "Which business use case does the model support?",
              "Who assessed the risk of the intended usage, and when?",
              "How does that assessment feed the model risk rating?",
            ],
            evidence_examples: [
              "Use case description",
              "Intended-use risk assessment",
              "Rationale sign-off by the model owner",
            ],
          },
          {
            title:
              "3.1.10 AI/ML considerations: explainability, alternative controls, bias, ethics, privacy",
            description:
              "When the rationale involves advanced techniques such as AI/ML, owners weigh extra questions: how transparent the model must be, whether opaque or autonomous behaviour calls for compensating controls, and whether it could produce biased results, harm society or expose personal information.",
            order_no: 3,
            summary:
              "Rationale for AI/ML models covers explainability, alternative controls, bias, ethics and privacy",
            questions: [
              "What level of transparency and explainability does the use case demand?",
              "Are alternative controls needed for black-box or autonomous models?",
              "Could the model create biased outcomes or adverse social or ethical effects?",
              "Have privacy risks been assessed?",
            ],
            evidence_examples: [
              "AI/ML rationale addendum",
              "Explainability requirements statement",
              "Bias, ethics and privacy assessment",
              "Alternative control design",
            ],
          },
        ],
      },
      {
        title: "Principle 3.2 – Model data (D.2)",
        description:
          "Whatever feeds a model has to suit the job it was built for. This group looks at how that data is governed, vetted for quality and bias, and cleaned before it shapes a model.",
        order_no: 9,
        items: [
          {
            title: "3.2.1 Data governance integrated with enterprise data governance",
            description:
              "Standards for gathering, storing and accessing model data exist and sit within the institution's wider data governance, strategy and management.",
            order_no: 1,
            summary: "Model data standards are part of enterprise data governance",
            questions: [
              "Are there standards for collecting, storing and accessing model data?",
              "How are they connected to enterprise data governance and strategy?",
              "Who owns data standards that affect models?",
            ],
            evidence_examples: [
              "Data governance policy covering models",
              "Data standards for model inputs",
              "Data ownership assignments",
            ],
          },
          {
            title: "3.2.2 Development data accurate, relevant, compliant, traceable and timely",
            description:
              "Data used to build a model should be free of material errors with bias understood, representative of the population the model targets, lawful and ethical in use and privacy-respecting, backed by documented lineage and refreshed often enough.",
            order_no: 2,
            summary:
              "Development data is accurate, representative, compliant, traceable and timely",
            questions: [
              "How is accuracy and fitness for use of development data confirmed?",
              "Does the data reflect the intended target population?",
              "Does its use meet statutory, regulatory and internal data ethics and privacy requirements?",
              "Is lineage and provenance documented?",
              "Is the refresh frequency appropriate for the use?",
            ],
            evidence_examples: [
              "Data fitness assessment",
              "Data lineage documentation",
              "Privacy and compliance checks",
              "Data refresh schedule",
            ],
          },
          {
            title: "3.2.3 Data bias identified and managed",
            description:
              "Unwanted bias in data can carry through into unfair outputs and reputational harm, so it should be looked for and handled, particularly for AI/ML models that readily reproduce unjustified patterns.",
            order_no: 3,
            summary: "Bias in model data is identified and managed",
            questions: [
              "How is bias in the data detected?",
              "What actions follow when bias is found?",
              "Is residual bias recorded and made visible to reviewers?",
            ],
            evidence_examples: [
              "Data bias testing results",
              "Bias remediation log",
              "Reviewer notes on residual data bias",
            ],
          },
          {
            title: "3.2.4 Regular data quality checks",
            description:
              "Thorough checks run on a recurring basis, for instance looking for outliers, gaps in values and inconsistencies.",
            order_no: 4,
            summary: "Data quality checks are performed regularly and thoroughly",
            questions: [
              "Which checks are performed (outliers, missing values, consistency)?",
              "How often do they run?",
              "Where are results recorded and who acts on them?",
            ],
            evidence_examples: [
              "Data quality check procedure",
              "Data quality reports",
              "Issue tracking records",
            ],
          },
          {
            title: "3.2.5 Controls and provenance for synthetic and proxy data",
            description:
              "Where synthetic data or proxy sources stand in for real data, controls assure its quality, and its origin and how it is used are documented.",
            order_no: 5,
            summary:
              "Quality controls and provenance documentation exist for synthetic and proxy data",
            questions: [
              "Is synthetic or proxy data used in any model?",
              "What controls assure its quality?",
              "How are its origin and use documented?",
            ],
            evidence_examples: [
              "Synthetic data generation records",
              "Proxy data justification",
              "Provenance log",
            ],
          },
          {
            title: "3.2.6 Data cleansing controls",
            description:
              "Controls make sure cleansing steps, such as treating wrong or missing values, are applied appropriately.",
            order_no: 6,
            summary: "Controls ensure data cleansing is applied appropriately",
            questions: [
              "How are inaccurate and missing values handled?",
              "Are cleansing rules documented and approved?",
              "Is the effect of cleansing on the data checked?",
            ],
            evidence_examples: [
              "Data cleansing procedures",
              "Cleansing rule documentation",
              "Before and after cleansing comparison",
            ],
          },
        ],
      },
      {
        title: "Principle 3.3 – Model development (D.2)",
        description:
          "Building a model should follow repeatable practices with defined bars for performance and record-keeping. This covers methodology choices, selection criteria and what is set in advance for later monitoring.",
        order_no: 10,
        items: [
          {
            title: "3.3.1 Model documentation standards",
            description:
              "A documentation standard spells out what developers must record: how the model is set up and run, its limits and usage restrictions, how its data is created, accessed and maintained, assumptions and method, the part played by expert judgment, and the analyses and tests the developers carried out.",
            order_no: 1,
            summary: "Documentation standards define what developers must record about each model",
            questions: [
              "Does the standard cover setup and operation of the model?",
              "Does it require limitations and usage restrictions to be recorded?",
              "Does it require descriptions of data creation, access and maintenance?",
              "Does it require assumptions, methodology and expert judgment to be documented?",
              "Does it require developer analyses and performance tests to be included?",
            ],
            evidence_examples: [
              "Model documentation standard",
              "Sample completed model documentation",
              "Documentation completeness checklist",
            ],
          },
          {
            title: "3.3.2 Methodology, data and algorithm selection guidelines",
            description:
              "Guidelines help developers choose methods, data (including variable transformations) and algorithms that are conceptually sound.",
            order_no: 2,
            summary: "Guidelines support sound choices of methodology, data and algorithms",
            questions: [
              "Are there guidelines for choosing methodologies and algorithms?",
              "Do they cover data selection and variable transformations?",
              "How is conceptual soundness demonstrated?",
            ],
            evidence_examples: [
              "Development guidelines",
              "Methodology justification in model documents",
              "Algorithm selection records",
            ],
          },
          {
            title: "3.3.3 Explainability requirements",
            description:
              "Explainability expectations are set per model and can differ with its purpose, degree of autonomy, regulatory demands or likely effect on customers and other stakeholders.",
            order_no: 3,
            summary:
              "Explainability requirements are defined and vary by purpose, autonomy and impact",
            questions: [
              "How are explainability requirements determined for each model?",
              "Do they account for autonomy, regulation and stakeholder impact?",
              "How does the developer show the requirement is met?",
            ],
            evidence_examples: [
              "Explainability standard",
              "Model-level explainability requirements",
              "Explainability test results",
            ],
          },
          {
            title: "3.3.4 Model selection criteria",
            description:
              "Performance and other criteria are fixed for choosing between candidate models.",
            order_no: 4,
            summary: "Performance and other criteria guide model selection",
            questions: [
              "What performance measures decide between candidate models?",
              "What non-performance criteria apply?",
              "Is the selection decision documented?",
            ],
            evidence_examples: [
              "Model selection criteria",
              "Candidate model comparison",
              "Selection decision record",
            ],
          },
          {
            title: "3.3.5 Standards for output use and reporting",
            description:
              "Standards govern the way model results are used downstream and communicated in reports.",
            order_no: 5,
            summary: "Standards govern how model outputs are used and reported",
            questions: [
              "Are rules in place for how outputs may be used?",
              "How are outputs reported and to whom?",
              "How is misuse of outputs prevented or detected?",
            ],
            evidence_examples: [
              "Output use standard",
              "Model output reporting templates",
              "User guidance for model results",
            ],
          },
          {
            title: "3.3.6 Monitoring criteria set at development",
            description:
              "Performance and other yardsticks for later monitoring are agreed while the model is still being built.",
            order_no: 6,
            summary: "Monitoring criteria are defined during development",
            questions: [
              "Which performance and other criteria will be monitored?",
              "Who agrees the criteria before deployment?",
              "How are they handed to the monitoring function?",
            ],
            evidence_examples: [
              "Monitoring plan in model documentation",
              "Monitoring criteria sign-off",
              "Hand-over notes to monitoring owners",
            ],
          },
        ],
      },
      {
        title: "Principle 3.4 – Model review (D.2)",
        description:
          "Someone other than the builders should test whether a model is correctly specified, works as intended and suits its purpose. This group covers who reviews, how deeply and how often, when a review is forced, what it examines and how the verdict is passed on.",
        order_no: 11,
        items: [
          {
            title: "3.4.1 Review independent of development",
            description:
              "The review function operates separately from development and confirms that models are specified correctly, behave as designed and are fit for purpose. Reviewers can be in-house or objective outside parties.",
            order_no: 1,
            summary:
              "Model review is independent of development and checks specification, behaviour and fitness",
            questions: [
              "How is independence from developers assured?",
              "Does review confirm specification, intended operation and fitness for purpose?",
              "When are internal versus third-party reviewers used?",
            ],
            evidence_examples: [
              "Model review policy",
              "Reviewer independence attestations",
              "Third-party reviewer engagement terms",
            ],
          },
          {
            title: "3.4.2 Review depth and frequency set by rating",
            description:
              "How far a review goes and how often it recurs is scaled to the model's risk rating.",
            order_no: 2,
            summary: "Review extent and frequency match the model risk rating",
            questions: [
              "How does the rating determine review depth?",
              "How does it determine review frequency?",
              "Who approves exceptions to the schedule?",
            ],
            evidence_examples: [
              "Review standard by risk rating",
              "Model review schedule",
              "Exception approvals",
            ],
          },
          {
            title: "3.4.3 Review triggers",
            description:
              "Certain events set a review in motion: a new model, a modification to algorithms, parameters or operational components, a performance breach such as material errors, drift or threshold violations, a significant data change such as new sources, redefined fields or a shift in quality, and scheduled periodic reviews.",
            order_no: 3,
            summary: "Defined events trigger model review",
            questions: [
              "Are triggers defined for new models and modifications?",
              "Do performance breaches initiate review?",
              "Do significant data changes initiate review?",
              "Are periodic risk-based reviews scheduled?",
            ],
            evidence_examples: ["Review trigger procedure", "Trigger log", "Review schedule"],
          },
          {
            title: "3.4.4 Review scope",
            description:
              "A review may challenge the risk rating, examine purpose, scope, conceptual soundness, limitations, mitigants and the reasonableness of results, and assess data. It may also look at new methods and tools, test explainability against the intended use, examine third-party elements, and record assessments with the follow-up taken.",
            order_no: 4,
            summary:
              "Review scope covers rating, soundness, data, novel techniques, explainability and documentation",
            questions: [
              "Does the review confirm or challenge the risk rating?",
              "Does it assess purpose, scope, soundness, limitations and mitigants?",
              "Does it cover data quality and appropriateness?",
              "Does it cover novel methods and explainability against intended use?",
              "Are assessments and responding actions documented?",
            ],
            evidence_examples: [
              "Review scope template",
              "Completed review report",
              "Action tracking log",
            ],
          },
          {
            title: "3.4.5 Review of third-party models, platforms and components",
            description:
              "Reviewers also look at vendor models and platforms, and at the components inside them, including data and libraries used in development.",
            order_no: 5,
            summary:
              "Third-party models, platforms and sub-components, including data and libraries, are reviewed",
            questions: [
              "Are vendor models and platforms in scope of review?",
              "Are sub-components such as data and libraries examined?",
              "How is limited vendor transparency handled?",
            ],
            evidence_examples: [
              "Third-party model review reports",
              "Component inventory",
              "Vendor documentation assessment",
            ],
          },
          {
            title: "3.4.6 Documented results and recommendation to the approver",
            description:
              "The review outcome, including findings, recommendations and an overall view on whether to approve, is written up and delivered to the approver.",
            order_no: 6,
            summary: "Review results, findings and an approval recommendation go to the approver",
            questions: [
              "Are findings and recommendations documented?",
              "Is an overall recommendation on approval given?",
              "How is it delivered to the approver?",
            ],
            evidence_examples: [
              "Review report with recommendation",
              "Findings register",
              "Approver acknowledgement",
            ],
          },
        ],
      },
      {
        title: "Model approval (D.2)",
        description:
          "A formal decision gates a model's entry into production and its continued use. The decision rests on suitability and on a confirmed risk position, and it can accommodate known weaknesses when they are justified.",
        order_no: 12,
        items: [
          {
            title: "3.4.7 Suitability approval throughout the lifecycle",
            description:
              "Approval is not a one-off gate. It recurs across the lifecycle and asks whether the model is suitable to go live, or to stay in use, given what it is meant to do.",
            order_no: 1,
            summary:
              "Approval assesses suitability for production or continued use throughout the lifecycle",
            questions: [
              "At which lifecycle points is approval required?",
              "What criteria determine suitability for intended use?",
              "Who holds approval authority at each point?",
            ],
            evidence_examples: [
              "Model approval procedure",
              "Approval records",
              "Approval authority matrix",
            ],
          },
          {
            title: "3.4.8 Rating and residual risk affirmed at approval",
            description:
              "The approver reconfirms the model's risk rating and its residual risk assessment as part of the decision.",
            order_no: 2,
            summary: "The approval decision affirms the risk rating and residual risk assessment",
            questions: [
              "Does the approver confirm the assigned rating?",
              "Is the residual risk assessment reviewed and affirmed?",
              "How are disagreements recorded?",
            ],
            evidence_examples: [
              "Approval record showing rating and residual risk",
              "Residual risk assessment",
              "Approver sign-off",
            ],
          },
          {
            title: "3.4.9 Approval with known limitations backed by mitigants or justification",
            description:
              "A model with identified weaknesses can still be approved if compensating mitigants are in place or the stakeholder group justifies using it despite the known limitations.",
            order_no: 3,
            summary:
              "Models with known limitations are approved only with mitigants or documented justification",
            questions: [
              "How are limitations and weaknesses recorded at approval?",
              "What mitigants are required?",
              "Who gives justification when mitigants are absent, and how is it documented?",
            ],
            evidence_examples: [
              "Limitations register",
              "Mitigation plan",
              "Stakeholder justification memo",
            ],
          },
        ],
      },
      {
        title: "Principle 3.5 – Model deployment (D.2)",
        description:
          "Moving a model into production demands quality and change controls so that it keeps its integrity once embedded. This group covers coordination, data consistency, testing, procedures, adjacent risk checks and explainability hand-off.",
        order_no: 13,
        items: [
          {
            title: "3.5.1 Collaboration across stakeholders and technology teams",
            description:
              "Developers, owners, reviewers, users and technology or operations teams work together when a model is deployed.",
            order_no: 1,
            summary:
              "Deployment involves collaboration among model stakeholders and technology teams",
            questions: [
              "Which roles take part in deployment?",
              "How is coordination with technology and operations teams organized?",
              "Where are deployment responsibilities recorded?",
            ],
            evidence_examples: [
              "Deployment plan",
              "Stakeholder participation records",
              "Deployment responsibility matrix",
            ],
          },
          {
            title: "3.5.2 Development and production data consistency",
            description:
              "The data the model meets in production should line up with what it was developed on.",
            order_no: 2,
            summary: "Production data is consistent with development data",
            questions: [
              "How is consistency between development and production data verified?",
              "How are differences handled?",
              "Who signs off on data readiness?",
            ],
            evidence_examples: [
              "Data consistency comparison",
              "Production data readiness checklist",
              "Difference resolution log",
            ],
          },
          {
            title: "3.5.3 Production testing",
            description: "Tests show that the model behaves as expected in the live environment.",
            order_no: 3,
            summary: "Tests demonstrate the model works as expected in production",
            questions: [
              "What tests run in the production environment?",
              "What results are required before go-live?",
              "How are test failures handled?",
            ],
            evidence_examples: [
              "Production test plan",
              "Test results",
              "Go-live acceptance record",
            ],
          },
          {
            title:
              "3.5.4 Documented deployment procedures (approvals, change control, exceptions, overlays)",
            description:
              "Written procedures lay out deployment steps, who is responsible, approval hierarchies, change control, monitoring arrangements, and how exceptions are handled, overlays included.",
            order_no: 4,
            summary:
              "Deployment procedures document steps, responsibilities, approvals, change control, monitoring and exceptions",
            questions: [
              "Do procedures define steps and stakeholder responsibilities?",
              "Do they set approval hierarchies and change control?",
              "Do they address monitoring arrangements?",
              "How are exceptions and overlays handled and approved?",
            ],
            evidence_examples: [
              "Deployment procedure document",
              "Change control records",
              "Exception and overlay register",
            ],
          },
          {
            title: "3.5.5 Pre-deployment assessment of related risks (B-13, E-21)",
            description:
              "Before go-live, related risks such as cybersecurity, infrastructure weaknesses and other operational exposures are assessed, with reference to OSFI Guidelines B-13 and E-21.",
            order_no: 5,
            summary:
              "Related cyber, infrastructure and operational risks are assessed before deployment",
            questions: [
              "Is a cybersecurity assessment completed before deployment?",
              "Are infrastructure vulnerabilities and operational risks assessed?",
              "How are B-13 and E-21 considered?",
            ],
            evidence_examples: [
              "Pre-deployment risk assessment",
              "Security review results",
              "Operational readiness assessment",
            ],
          },
          {
            title: "3.5.6 Explainability reviewed and communicated",
            description:
              "Explainability requirements are revisited at deployment, and explanatory outputs are shared with the right stakeholders.",
            order_no: 6,
            summary:
              "Explainability requirements are reviewed and explanatory outputs communicated",
            questions: [
              "Are explainability requirements checked at deployment?",
              "Which stakeholders receive explanatory outputs?",
              "How is delivery confirmed?",
            ],
            evidence_examples: [
              "Explainability review record",
              "Explanatory output distribution list",
              "User briefing materials",
            ],
          },
        ],
      },
      {
        title: "Principle 3.6 – Model monitoring (D.2)",
        description:
          "Once a model is live, ongoing checks confirm it still does its job and flag problems early. This group describes what those checks cover, when they trip and who hears about it.",
        order_no: 14,
        items: [
          {
            title: "3.6.1 Monitoring standards by rating and model type",
            description:
              "Standards set how often monitoring occurs, what it covers and how results are judged, differentiated across risk ratings and kinds of model.",
            order_no: 1,
            summary:
              "Monitoring standards define frequency, scope and evaluation criteria by rating and model type",
            questions: [
              "Do standards define monitoring frequency and scope?",
              "Do they set evaluation criteria?",
              "Are they differentiated by risk rating and model type?",
            ],
            evidence_examples: [
              "Model monitoring standard",
              "Monitoring plan per model",
              "Monitoring frequency matrix",
            ],
          },
          {
            title: "3.6.2 Quantitative and qualitative criteria",
            description:
              "Evaluation draws on numbers such as performance metrics and on judgments such as whether the model is still being used within its original scope.",
            order_no: 2,
            summary: "Monitoring uses both quantitative measures and qualitative assessments",
            questions: [
              "Which performance metrics are tracked?",
              "Which qualitative checks are applied, such as scope adherence?",
              "How are the two combined in an overall assessment?",
            ],
            evidence_examples: [
              "Monitoring metric definitions",
              "Qualitative assessment checklist",
              "Monitoring reports",
            ],
          },
          {
            title: "3.6.3 Tracking operational factors",
            description:
              "Monitoring follows shifts in how the model performs and is used, in its inputs, in external dependencies such as version updates, and in what is being modelled, for example new product features.",
            order_no: 3,
            summary:
              "Operational factors such as performance, usage, inputs, dependencies and modelled characteristics are tracked",
            questions: [
              "Are changes in performance and usage tracked?",
              "Are input data changes tracked?",
              "Are external dependency updates tracked?",
              "Are changes in what is being modelled tracked?",
            ],
            evidence_examples: [
              "Operational factor tracking log",
              "Dependency version records",
              "Input data change reports",
            ],
          },
          {
            title: "3.6.4 Breach thresholds and material-modification criteria",
            description:
              "Thresholds define what counts as a breach, and criteria define when a change, including one in operational factors, is a material modification.",
            order_no: 4,
            summary: "Breach thresholds and criteria for material modifications are defined",
            questions: [
              "How are breach thresholds set per model?",
              "What criteria define a material modification?",
              "How do operational factor changes feed into those criteria?",
            ],
            evidence_examples: [
              "Threshold definitions",
              "Material modification criteria",
              "Breach and modification log",
            ],
          },
          {
            title: "3.6.5 Contingency plans and escalation",
            description:
              "Plans exist for a model that becomes unavailable, deteriorates or fails outright, along with escalation routes for dealing with such events.",
            order_no: 5,
            summary:
              "Contingency plans and escalation procedures cover unavailability, deterioration and failure",
            questions: [
              "Are contingency plans defined for model unavailability, deterioration and failure?",
              "Who is notified and in what order?",
              "Are plans tested?",
            ],
            evidence_examples: [
              "Contingency plans",
              "Escalation procedure",
              "Contingency test results",
            ],
          },
          {
            title: "3.6.6 Controls for AI/ML autonomy, re-parametrization and drift",
            description:
              "AI/ML models raise distinctive monitoring problems: decisions made autonomously, models that re-tune their own parameters, and a heightened chance of drift. Processes should address each of them.",
            order_no: 6,
            summary:
              "Processes address AI/ML autonomous decisions, autonomous re-parametrization and drift",
            questions: [
              "How are autonomous decisions monitored?",
              "How is autonomous re-parametrization controlled?",
              "How is model drift detected and handled?",
            ],
            evidence_examples: [
              "AI/ML monitoring procedures",
              "Drift monitoring reports",
              "Re-parametrization control records",
            ],
          },
          {
            title: "3.6.7 Issues shared promptly with stakeholders",
            description:
              "Problems found are passed quickly to the people who need to know, through the proper escalation routes.",
            order_no: 7,
            summary:
              "Issues are promptly shared with relevant stakeholders through escalation procedures",
            questions: [
              "Who counts as a relevant stakeholder for monitoring issues?",
              "What timelines apply to notification?",
              "How is escalation recorded?",
            ],
            evidence_examples: [
              "Issue communication records",
              "Escalation log",
              "Stakeholder notification procedure",
            ],
          },
        ],
      },
      {
        title: "Model decommission (D.2)",
        description:
          "Retiring a model is a managed step, not just switching it off. This group looks at why models are retired, how the retirement is run and what is left to watch afterwards.",
        order_no: 15,
        items: [
          {
            title: "3.6.8 Decommission criteria",
            description:
              "Reasons to retire a model include performance problems such as severe failure, repeated breaches or excessive overrides, shifts in business, regulatory or strategic direction, and obsolete data or methods or an unfavourable cost-benefit picture.",
            order_no: 1,
            summary:
              "Criteria cover performance, business or regulatory change and obsolescence or cost-benefit",
            questions: [
              "Are criteria defined for performance-based decommission?",
              "Do they cover business, regulatory or strategic change?",
              "Do they cover obsolete data, methodology and cost-benefit?",
            ],
            evidence_examples: [
              "Decommission policy",
              "Decommission decision records",
              "Trigger criteria checklist",
            ],
          },
          {
            title: "3.6.9 Disciplined process with stakeholder notice",
            description:
              "Retirement follows an orderly process, and everyone affected is told about the plan beforehand.",
            order_no: 2,
            summary:
              "Decommission follows a disciplined process with advance notice to stakeholders",
            questions: [
              "Is there a defined decommission procedure?",
              "Who is notified before retirement?",
              "How is completion confirmed?",
            ],
            evidence_examples: [
              "Decommission procedure",
              "Stakeholder notification records",
              "Decommission completion sign-off",
            ],
          },
          {
            title: "3.6.10 Retired model and documentation retained",
            description:
              "The retired model and its documents are kept for a set period so they can serve as a benchmark or a fallback.",
            order_no: 3,
            summary: "The retired model and its documentation are retained for a set period",
            questions: [
              "How long are retired models and documents kept?",
              "Where are they stored?",
              "Under what circumstances may they be used as a benchmark or fallback?",
            ],
            evidence_examples: [
              "Retention schedule",
              "Archive location records",
              "Fallback use criteria",
            ],
          },
          {
            title: "3.6.11 Third-party decommission actions",
            description:
              "For vendor-supplied models, the extra steps needed on retirement are worked out.",
            order_no: 4,
            summary: "Additional actions for decommissioning third-party models are determined",
            questions: [
              "What extra steps apply to retiring a vendor model?",
              "How are contract terms and data return or deletion handled?",
              "Who owns these actions?",
            ],
            evidence_examples: [
              "Third-party exit plan",
              "Contract termination records",
              "Data return or deletion confirmation",
            ],
          },
          {
            title: "3.6.12 Downstream effects monitored",
            description:
              "After retirement, effects further along the chain are watched to be sure nothing lingers.",
            order_no: 5,
            summary: "Downstream effects are monitored after decommission",
            questions: [
              "Which downstream processes depend on the retired model?",
              "How long are effects monitored?",
              "How are residual impacts handled?",
            ],
            evidence_examples: [
              "Downstream dependency analysis",
              "Post-decommission monitoring report",
              "Residual impact log",
            ],
          },
        ],
      },
      {
        title: "Appendix 1 – Model information tracking",
        description:
          "Appendix 1 names the minimum facts to keep about models, split into a baseline for every identified model and a larger set for those held in the inventory.",
        order_no: 16,
        items: [
          {
            title: "A.1 Minimum information for every identified model",
            description:
              "For each model that has been identified, the institution keeps at least an ID, a name with a description of key features and use, a risk rating, an owner, a developer and the model's origin, such as in-house or vendor.",
            order_no: 1,
            summary: "Minimum record held for each identified model",
            questions: [
              "Does every identified model have an ID?",
              "Is a name and description of key features and use recorded?",
              "Are the risk rating, owner and developer recorded?",
              "Is the origin (internal or vendor) recorded?",
            ],
            evidence_examples: [
              "Model identification register",
              "Sample model record",
              "Data completeness report",
            ],
          },
          {
            title: "A.2 Additional information for inventoried models",
            description:
              "Models of non-negligible risk that sit in the inventory carry more detail: version, production deployment date, reviewer, approver, dependencies, data sources with a description, approved uses, limitations including exceptions and additional requirements, date of last review, monitoring status including exceptions, and next review date.",
            order_no: 2,
            summary: "Further record held for models in the inventory",
            questions: [
              "Are version, deployment date, reviewer and approver recorded?",
              "Are dependencies, data sources and their description recorded?",
              "Are approved uses and limitations (with exceptions) recorded?",
              "Are last review date, monitoring status (with exceptions) and next review date recorded?",
            ],
            evidence_examples: [
              "Model inventory extract",
              "Inventory field specification",
              "Inventory completeness check",
            ],
          },
        ],
      },
    ],
  },
};

export default osfiE23Structure;
