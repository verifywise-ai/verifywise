import { getData, deleteDemoVendorsData } from "../../utils/autoDriver.utils";
import { createEUFrameworkQuery } from "../../utils/eu.utils";
import { createISOFrameworkQuery } from "../../utils/iso42001.utils";
import { createAiAppQuery } from "../../utils/aiApp.utils";
import { sequelize } from "../../database/db";
import { createNewProjectQuery, deleteProjectByIdQuery } from "../../utils/project.utils";
import { createRiskQuery } from "../../utils/risk.utils";
import { createNewVendorQuery } from "../../utils/vendor.utils";
import { createNewVendorRiskQuery } from "../../utils/vendorRisk.utils";
import { deleteDemoUsersQuery } from "../../utils/user.utils";
import { createNewModelRiskQuery } from "../../utils/modelRisk.utils";
import { createNewTaskQuery } from "../../utils/task.utils";
import { createNewTrainingRegistarQuery } from "../../utils/trainingRegistar.utils";
import { createPolicyQuery } from "../../utils/policyManager.utils";
import { createNewModelInventoryQuery } from "../../utils/modelInventory.utils";
import { createNewDatasetQuery } from "../../utils/dataset.utils";

import { insertShadowAiDemoData, deleteShadowAiDemoData } from "./shadowAiDemoData";
import { insertAiGatewayDemoData, deleteAiGatewayDemoData } from "./aiGatewayDemoData";
import { addVendorProjects } from "../../utils/vendor.utils";
import { ProjectModel } from "../../domain.layer/models/project/project.model";
import { HighRiskRole } from "../../domain.layer/enums/high-risk-role.enum";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import { IVendor } from "../../domain.layer/interfaces/i.vendor";
import { deleteProjectFrameworkNISTQuery } from "../../utils/nistAiRmfCorrect.utils";
import { ModelRiskCategory } from "../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../domain.layer/enums/model-risk-level.enum";
import { ModelRiskStatus } from "../../domain.layer/enums/model-risk-status.enum";
import { TaskPriority, TaskStatus } from "../../domain.layer/enums/task-priority.enum";
import { ModelInventoryModel } from "../../domain.layer/models/modelInventory/modelInventory.model";
import { DatasetModel } from "../../domain.layer/models/dataset/dataset.model";
import { AiAppStatus, AiAppDiscoveredSource } from "../../domain.layer/enums/ai-app-status.enum";
import {
  IncidentType,
  Severity,
  AIIncidentManagementStatus,
  AIIncidentManagementApprovalStatus,
} from "../../domain.layer/enums/ai-incident-management.enum";
export async function insertMockData(
  organizationId: number,
  _organization: number,
  userId: number,
) {
  const transaction = await sequelize.transaction();
  try {
    let projects = ((await getData("projects", organizationId, transaction)) as ProjectModel[])[0];
    if (!projects) {
      // create project
      const project = await createNewProjectQuery(
        {
          project_title: "AI Recruitment Screening Platform",
          owner: userId,
          start_date: new Date(Date.now()),
          geography: 1,
          target_industry: "Human Resources",
          description:
            "An AI-powered platform that automates candidate screening, resume parsing, and preliminary assessments for recruitment processes. The system uses machine learning to rank candidates based on job requirements and historical hiring data.",
          ai_risk_classification: AiRiskClassification.HIGH_RISK,
          type_of_high_risk_role: HighRiskRole.DEPLOYER,
          goal: "To streamline recruitment while ensuring fair, unbiased, and transparent candidate evaluation in compliance with EU AI Act requirements for high-risk employment systems",
          last_updated: new Date(Date.now()),
          last_updated_by: userId,
        },
        [], // no additional members
        [1, 2], // frameworks: EU AI Act (1) + ISO/IEC 42001 (2)
        organizationId,
        userId,
        transaction,
        true, // is demo
      );
      // create eu framework
      await createEUFrameworkQuery(project.id!, true, organizationId, transaction, true);

      // create ISO/IEC 42001 framework — seeds clause/annex implementation
      // descriptions, auditor feedback and a mix of statuses (is_mock_data=true)
      await createISOFrameworkQuery(project.id!, true, organizationId, transaction, true);

      // create project risks
      await createRiskQuery(
        {
          risk_name: "Algorithmic Bias in Candidate Screening",
          risk_owner: userId,
          ai_lifecycle_phase: "Monitoring & maintenance",
          risk_description:
            "Risk of discriminatory outcomes in candidate ranking due to biased training data or model assumptions. The AI system may inadvertently favor or disadvantage candidates based on protected characteristics such as gender, age, ethnicity, or disability status.",
          risk_category: ["Compliance risk"],
          impact: "High",
          assessment_mapping: "EU AI Act Article 10 - Data Governance",
          controls_mapping: "Bias Testing and Fairness Audits",
          likelihood: "Possible",
          severity: "Major",
          risk_level_autocalculated: "High risk",
          review_notes:
            "Requires regular bias audits and demographic parity testing across protected groups.",
          mitigation_status: "Requires review",
          current_risk_level: "High risk",
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          mitigation_plan: "In Progress",
          implementation_strategy:
            "Implement fairness constraints in model training, conduct regular bias audits, and establish human oversight for final hiring decisions.",
          mitigation_evidence_document: "Bias_Audit_Report.pdf",
          likelihood_mitigation: "Possible",
          risk_severity: "Moderate",
          final_risk_level: "Medium risk",
          risk_approval: userId,
          approval_status: "In Progress",
          date_of_assessment: new Date(Date.now()),
          projects: [project.id!],
          frameworks: [1], // EU AI Act framework
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      // Create second project risk - Data Privacy Risk
      await createRiskQuery(
        {
          risk_name: "Data Privacy and GDPR Compliance",
          risk_owner: userId,
          ai_lifecycle_phase: "Model development & training",
          risk_description:
            "Risk of non-compliance with GDPR and data protection regulations when processing candidate personal data. The AI system handles sensitive information including CVs, interview recordings, and assessment results which require specific legal bases for processing.",
          risk_category: ["Compliance risk", "Strategic risk"],
          impact: "High",
          assessment_mapping: "EU AI Act Article 10 - Data Governance",
          controls_mapping: "Data Protection Impact Assessment",
          likelihood: "Likely",
          severity: "Major",
          risk_level_autocalculated: "High risk",
          review_notes: "DPIA required before deployment. Legal team review pending.",
          mitigation_status: "In Progress",
          current_risk_level: "High risk",
          deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
          mitigation_plan: "In Progress",
          implementation_strategy:
            "Complete DPIA, implement data minimization principles, establish lawful basis for processing, and ensure candidate consent mechanisms are in place.",
          mitigation_evidence_document: "DPIA_Draft_v2.pdf",
          likelihood_mitigation: "Possible",
          risk_severity: "Moderate",
          final_risk_level: "Medium risk",
          risk_approval: userId,
          approval_status: "In Progress",
          date_of_assessment: new Date(Date.now()),
          projects: [project.id!],
          frameworks: [1],
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      // create vendor
      let vendor = ((await getData("vendors", organizationId, transaction)) as IVendor[])[0];
      if (!vendor) {
        vendor = await createNewVendorQuery(
          {
            projects: [project.id],
            vendor_name: "TalentAI Solutions",
            vendor_provides:
              "ML-based candidate scoring, resume parsing, and skills assessment APIs",
            assignee: userId,
            website: "www.talentai-solutions.com",
            vendor_contact_person: "Sarah Chen",
            review_result: "Positive",
            review_status: "Requires follow-up",
            reviewer: userId,
            review_date: new Date(Date.now()),
          },
          organizationId,
          transaction,
          true, // is demo
        );
      } else {
        await addVendorProjects(vendor.id!, [project.id!], organizationId, transaction);
      }

      // Always create vendor risks if they don't exist
      // Check for existing demo vendor risks
      const existingVendorRisks = (await sequelize.query(
        `SELECT COUNT(*) as count FROM vendorrisks WHERE organization_id = :organizationId AND is_demo = true`,
        { replacements: { organizationId }, transaction },
      )) as [{ count: string }[], number];

      const vendorRiskCount = parseInt(existingVendorRisks[0][0].count) || 0;

      if (vendorRiskCount === 0) {
        // create vendor risks (one high, one medium, one low)
        await createNewVendorRiskQuery(
          {
            vendor_id: vendor.id,
            risk_description: "Training Data Quality and Provenance",
            impact_description:
              "Vendor's ML models may be trained on biased or unrepresentative datasets, leading to discriminatory scoring of candidates. Lack of transparency in training data sources makes it difficult to audit for compliance.",
            likelihood: "Possible",
            risk_severity: "Major",
            action_plan:
              "Request vendor's model cards and training data documentation. Conduct independent bias testing on vendor API outputs. Include audit rights clause in vendor contract.",
            action_owner: userId,
            risk_level: "High risk",
            is_demo: true,
          },
          organizationId,
          transaction,
        );

        await createNewVendorRiskQuery(
          {
            vendor_id: vendor.id,
            risk_description: "Data Security and Processing Location",
            impact_description:
              "Vendor processes candidate data in multiple jurisdictions. Risk of data being processed outside EU without adequate safeguards, potentially violating GDPR requirements for international data transfers.",
            likelihood: "Unlikely",
            risk_severity: "Moderate",
            action_plan:
              "Verify vendor's data processing locations and ensure Standard Contractual Clauses are in place. Request SOC 2 Type II certification and evidence of EU data residency options.",
            action_owner: userId,
            risk_level: "Medium risk",
            is_demo: true,
          },
          organizationId,
          transaction,
        );

        await createNewVendorRiskQuery(
          {
            vendor_id: vendor.id,
            risk_description: "Service Level Agreement Compliance",
            impact_description:
              "Vendor may not meet agreed upon uptime and response time requirements during peak recruitment periods.",
            likelihood: "Rare",
            risk_severity: "Minor",
            action_plan:
              "Monitor vendor SLA performance monthly. Establish backup provider for critical recruitment periods.",
            action_owner: userId,
            risk_level: "Low risk",
            is_demo: true,
          },
          organizationId,
          transaction,
        );
      }

      // Create Model Inventory
      const modelInventory = await createNewModelInventoryQuery(
        {
          provider_model: "TalentScore Pro",
          provider: "TalentAI Solutions",
          model: "Candidate Ranking Model v2.3",
          version: "2.3.1",
          approver: userId,
          capabilities: [
            "Resume parsing",
            "Skills extraction",
            "Candidate scoring",
            "Job matching",
          ],
          security_assessment: true,
          status: "Approved",
          status_date: new Date(Date.now()),
          reference_link: "https://docs.talentai-solutions.com/models/candidate-ranking",
          biases:
            "Known underrepresentation of non-English language resumes. Lower accuracy for candidates with non-traditional career paths.",
          limitations:
            "Cannot process handwritten documents. Maximum 10MB file size for resume uploads. Requires structured job descriptions for optimal matching.",
          hosting_provider: "AWS EU (Frankfurt)",
          security_assessment_data: [],
          is_demo: true,
        } as unknown as ModelInventoryModel,
        organizationId,
        [project.id!],
        [1],
        transaction,
      );

      // Create Model Risks
      await createNewModelRiskQuery(
        {
          risk_name: "Model Drift - Performance Degradation",
          risk_category: ModelRiskCategory.PERFORMANCE,
          risk_level: ModelRiskLevel.MEDIUM,
          status: ModelRiskStatus.IN_PROGRESS,
          owner: String(userId),
          target_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
          description:
            "Risk of model accuracy degrading over time as job market trends, skill requirements, and candidate demographics change. Initial model was trained on 2022-2023 data which may not reflect current market conditions.",
          mitigation_plan:
            "Implement continuous monitoring of model performance metrics. Schedule quarterly model retraining with updated data. Establish drift detection alerts at 5% accuracy threshold.",
          impact: "Medium",
          likelihood: "Likely",
          key_metrics: "Precision, Recall, F1-Score, Demographic Parity",
          current_values: "Precision: 0.82, Recall: 0.78, F1: 0.80",
          threshold: "F1-Score must remain above 0.75",
          model_id: modelInventory.id,
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      await createNewModelRiskQuery(
        {
          risk_name: "Bias in Gender Prediction from Names",
          risk_category: ModelRiskCategory.BIAS,
          risk_level: ModelRiskLevel.HIGH,
          status: ModelRiskStatus.OPEN,
          owner: String(userId),
          target_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          description:
            "Model shows statistically significant differences in scoring between candidates with traditionally male vs female names, even when controlling for qualifications and experience.",
          mitigation_plan:
            "Remove name-based features from model input. Implement blind evaluation mode. Conduct third-party fairness audit and remediate findings.",
          impact: "High",
          likelihood: "Confirmed",
          key_metrics: "Statistical Parity Difference, Equalized Odds",
          current_values: "SPD: 0.12 (threshold: 0.05)",
          threshold: "SPD must be below 0.05",
          model_id: modelInventory.id,
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      // Create Dataset
      await createNewDatasetQuery(
        {
          name: "Historical Hiring Decisions Dataset",
          description:
            "Dataset containing 5 years of historical hiring decisions including candidate profiles, interview scores, and hiring outcomes. Used for training the candidate ranking model.",
          version: "3.1",
          owner: userId,
          type: "Training",
          function: "Model Training",
          source: "Internal HR Systems",
          license: "Internal Use Only",
          format: "Parquet",
          classification: "Confidential",
          contains_pii: true,
          pii_types: "Names, Email addresses, Phone numbers, Employment history",
          status: "Active",
          status_date: new Date(Date.now()),
          known_biases:
            "Dataset overrepresents candidates from technical backgrounds. Underrepresentation of candidates over 50 years old. Geographic bias towards urban areas.",
          bias_mitigation:
            "Applied synthetic oversampling for underrepresented groups. Removed age-related features. Implemented stratified sampling for training.",
          collection_method: "Extracted from HRIS system with candidate consent",
          preprocessing_steps:
            "PII anonymization, feature normalization, outlier removal, missing value imputation",
          documentation_data: [
            { field: "Total Records", value: "125,000" },
            { field: "Date Range", value: "2019-2024" },
            { field: "Positive Class Rate", value: "15%" },
          ],
          is_demo: true,
        } as unknown as DatasetModel,
        organizationId,
        [modelInventory.id!],
        [project.id!],
        transaction,
      );

      // Create Tasks
      await createNewTaskQuery(
        {
          title: "Complete Bias Audit for Candidate Ranking Model",
          description:
            "Conduct comprehensive bias audit across protected characteristics (gender, age, ethnicity) for the TalentScore Pro model. Document findings and create remediation plan.",
          creator_id: userId,
          organization_id: _organization,
          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          priority: TaskPriority.HIGH,
          status: TaskStatus.IN_PROGRESS,
          categories: ["Compliance", "Model Risk"],
          is_demo: true,
        },
        organizationId,
        transaction,
        [{ user_id: userId }],
      );

      await createNewTaskQuery(
        {
          title: "Update Data Processing Agreement with TalentAI",
          description:
            "Review and update the DPA with TalentAI Solutions to include new SCCs, clarify data residency requirements, and add audit rights clause.",
          creator_id: userId,
          organization_id: _organization,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          priority: TaskPriority.HIGH,
          status: TaskStatus.OPEN,
          categories: ["Legal", "Vendor Management"],
          is_demo: true,
        },
        organizationId,
        transaction,
        [{ user_id: userId }],
      );

      await createNewTaskQuery(
        {
          title: "Implement Human Oversight Dashboard",
          description:
            "Design and implement a dashboard for HR managers to review AI-generated candidate rankings and provide manual overrides with documented justification.",
          creator_id: userId,
          organization_id: _organization,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          priority: TaskPriority.MEDIUM,
          status: TaskStatus.OPEN,
          categories: ["Development", "Compliance"],
          is_demo: true,
        },
        organizationId,
        transaction,
        [{ user_id: userId }],
      );

      // Create Training Register
      await createNewTrainingRegistarQuery(
        {
          training_name: "EU AI Act Compliance for HR Professionals",
          duration: "4 hours",
          provider: "VerifyWise Academy",
          department: "Human Resources",
          status: "Planned",
          numberOfPeople: 25,
          description:
            "Comprehensive training on EU AI Act requirements for high-risk AI systems in employment contexts. Covers legal obligations, human oversight requirements, and documentation standards.",
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      await createNewTrainingRegistarQuery(
        {
          training_name: "Responsible AI Practices Workshop",
          duration: "2 days",
          provider: "External Consultant",
          department: "Engineering",
          status: "In Progress",
          numberOfPeople: 15,
          description:
            "Hands-on workshop for ML engineers covering bias detection, fairness metrics, explainability techniques, and model documentation best practices.",
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      // Create Policies
      await createPolicyQuery(
        {
          title: "AI Ethics and Responsible Use Policy",
          content_html: `<h2>Purpose</h2>
<p>This policy establishes guidelines for the ethical development, deployment, and use of AI systems within our organization, ensuring alignment with EU AI Act requirements and industry best practices.</p>

<h2>Scope</h2>
<p>This policy applies to all AI systems developed, procured, or deployed by the organization, with particular emphasis on high-risk AI systems as defined by the EU AI Act.</p>

<h2>Key Principles</h2>
<ul>
<li><strong>Human Oversight:</strong> All AI systems must have appropriate human oversight mechanisms</li>
<li><strong>Transparency:</strong> AI-driven decisions must be explainable to affected individuals</li>
<li><strong>Fairness:</strong> AI systems must be regularly tested for bias and discrimination</li>
<li><strong>Accountability:</strong> Clear ownership and responsibility for AI system outcomes</li>
</ul>

<h2>Requirements</h2>
<ol>
<li>All high-risk AI systems must undergo mandatory impact assessment before deployment</li>
<li>Bias testing must be conducted quarterly for all production AI models</li>
<li>Training data must be documented with provenance and bias analysis</li>
<li>Human override mechanisms must be available for all automated decisions</li>
</ol>`,
          status: "Approved",
          tags: ["AI ethics", "EU AI Act", "Human oversight"],
          next_review_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
          author_id: userId,
          assigned_reviewer_ids: [userId],
          last_updated_by: userId,
          is_demo: true,
        },
        organizationId,
        userId,
        transaction,
      );

      await createPolicyQuery(
        {
          title: "Vendor AI Risk Management Policy",
          content_html: `<h2>Purpose</h2>
<p>This policy defines requirements for assessing and managing risks associated with third-party AI vendors and their systems.</p>

<h2>Vendor Assessment Requirements</h2>
<ul>
<li>All AI vendors must complete risk assessment questionnaire before onboarding</li>
<li>Vendors providing high-risk AI systems require enhanced due diligence</li>
<li>Annual vendor risk reviews are mandatory</li>
</ul>

<h2>Contractual Requirements</h2>
<ul>
<li>Data processing agreements must specify data residency requirements</li>
<li>Audit rights clause required for all AI vendors</li>
<li>Incident notification within 24 hours</li>
<li>Model documentation and explainability requirements</li>
</ul>

<h2>Ongoing Monitoring</h2>
<p>Vendor AI system performance and compliance must be monitored continuously with quarterly review meetings.</p>`,
          status: "Draft",
          tags: ["Vendor management", "Model risk", "Data governance"],
          next_review_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months
          author_id: userId,
          assigned_reviewer_ids: [userId],
          last_updated_by: userId,
          is_demo: true,
        },
        organizationId,
        userId,
        transaction,
      );

      // =====================================================
      // Additional use cases (projects)
      // =====================================================
      const codingAssistantProject = await createNewProjectQuery(
        {
          project_title: "Internal AI Coding Assistant",
          owner: userId,
          start_date: new Date(Date.now()),
          geography: 1,
          target_industry: "Software & IT services",
          description:
            "An internally deployed AI pair-programming tool integrated into developer IDEs and CI pipelines. It suggests code, generates unit tests, and summarizes changes for reviewers. Access is restricted to authenticated employees; prompts and completions are logged for audit, and outputs are treated as suggestions requiring human review before merge.",
          ai_risk_classification: AiRiskClassification.LIMITED_RISK,
          type_of_high_risk_role: HighRiskRole.DEPLOYER,
          goal: "Give engineers an LLM coding assistant for code completion, generation, refactoring and test writing across internal repositories, while keeping proprietary source and secrets within governed, audited boundaries.",
          last_updated: new Date(Date.now()),
          last_updated_by: userId,
        },
        [],
        [1],
        organizationId,
        userId,
        transaction,
        true, // is demo
      );
      await createEUFrameworkQuery(
        codingAssistantProject.id!,
        true,
        organizationId,
        transaction,
        true,
      );

      const demandForecastProject = await createNewProjectQuery(
        {
          project_title: "Demand Forecasting & Inventory Optimization",
          owner: userId,
          start_date: new Date(Date.now()),
          geography: 1,
          target_industry: "Retail & consumer goods",
          description:
            "A machine-learning demand-forecasting and inventory-optimization system that predicts SKU-level demand from historical sales, seasonality, promotions and external signals, then recommends purchase and replenishment quantities. Forecasts feed planning dashboards; automated ordering stays within human-approved thresholds, and model performance is monitored for drift.",
          ai_risk_classification: AiRiskClassification.LIMITED_RISK,
          type_of_high_risk_role: HighRiskRole.DEPLOYER,
          goal: "Forecast product demand and optimize inventory and replenishment across the supply chain using ML models, reducing stockouts and overstock while improving service levels and working-capital efficiency.",
          last_updated: new Date(Date.now()),
          last_updated_by: userId,
        },
        [],
        [1],
        organizationId,
        userId,
        transaction,
        true, // is demo
      );
      await createEUFrameworkQuery(
        demandForecastProject.id!,
        true,
        organizationId,
        transaction,
        true,
      );

      // =====================================================
      // Project risks for the additional use cases
      // =====================================================
      await createRiskQuery(
        {
          risk_name: "Source code and secret leakage via AI coding assistant",
          risk_owner: userId,
          ai_lifecycle_phase: "Deployment & integration",
          risk_description:
            "Developers may paste proprietary source code, credentials, or secrets into the AI coding assistant, where content may be transmitted to or retained by an external model provider, exposing intellectual property outside the organization's control.",
          risk_category: ["Strategic risk"],
          impact:
            "Loss of intellectual property, exposure of credentials leading to unauthorized system access, and potential breach of confidentiality obligations with customers and partners.",
          assessment_mapping: "",
          controls_mapping: "",
          likelihood: "Likely",
          severity: "Major",
          risk_level_autocalculated: "High risk",
          review_notes:
            "Route assistant traffic through the AI gateway and confirm provider retention/training is disabled.",
          mitigation_status: "In Progress",
          current_risk_level: "High risk",
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          mitigation_plan:
            "Enforce an approved-tools policy for the coding assistant, enable data-loss-prevention scanning on assistant traffic, and disable provider retention/training on submitted content. Train developers on what must never be pasted and provide sanctioned internal alternatives for sensitive repositories.",
          implementation_strategy:
            "Roll out DLP rules and provider retention controls, publish the approved-tools policy, and deliver secure-use training to all engineers before general availability.",
          mitigation_evidence_document: "",
          likelihood_mitigation: "Unlikely",
          risk_severity: "Moderate",
          final_risk_level: "Medium risk",
          risk_approval: userId,
          approval_status: "In Progress",
          date_of_assessment: new Date(Date.now()),
          projects: [codingAssistantProject.id!],
          frameworks: [1], // EU AI Act framework
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      await createRiskQuery(
        {
          risk_name: "Forecast data drift degrading demand accuracy",
          risk_owner: userId,
          ai_lifecycle_phase: "Monitoring & maintenance",
          risk_description:
            "Changes in demand patterns, supplier catalog feeds, or seasonality can cause the forecasting model to drift, producing inaccurate predictions that drive stockouts or overstock and erode planner trust in the system.",
          risk_category: ["Operational risk"],
          impact:
            "Inaccurate replenishment recommendations, increased carrying cost and lost sales, and reduced confidence in the forecasting system.",
          assessment_mapping: "",
          controls_mapping: "",
          likelihood: "Possible",
          severity: "Major",
          risk_level_autocalculated: "High risk",
          review_notes:
            "Monitor forecast error against actuals and alert on drift beyond agreed thresholds.",
          mitigation_status: "In Progress",
          current_risk_level: "High risk",
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          mitigation_plan:
            "Track forecast accuracy and input-feed stability, set drift-detection alerts, schedule periodic retraining, and keep automated ordering within human-approved thresholds until accuracy recovers.",
          implementation_strategy:
            "Instrument drift monitoring on inputs and forecast error, define retraining triggers, and require human sign-off on ordering when drift alerts fire.",
          mitigation_evidence_document: "",
          likelihood_mitigation: "Unlikely",
          risk_severity: "Moderate",
          final_risk_level: "Medium risk",
          risk_approval: userId,
          approval_status: "In Progress",
          date_of_assessment: new Date(Date.now()),
          projects: [demandForecastProject.id!],
          frameworks: [1], // EU AI Act framework
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      // =====================================================
      // AI apps (inventory)
      // =====================================================
      await createAiAppQuery(
        {
          name: "Customer Recommendation Engine",
          description:
            "Customer-facing product recommendation service that personalizes suggestions on web and mobile storefronts using a hosted LLM/ML ranking model via the AI gateway.",
          status: AiAppStatus.APPROVED,
          discovered_source: AiAppDiscoveredSource.MANUAL,
          owner_id: userId,
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      await createAiAppQuery(
        {
          name: "AI Coding Assistant",
          description:
            "AI pair-programming assistant used by the engineering team for code completion and generation inside IDEs. Access is SSO-gated and routed through governed guardrails to prevent secret and proprietary-code leakage.",
          status: AiAppStatus.UNDER_REVIEW,
          discovered_source: AiAppDiscoveredSource.MANUAL,
          owner_id: userId,
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      await createAiAppQuery(
        {
          name: "Demand Forecasting Service",
          description:
            "Internal ML application that forecasts SKU-level demand and recommends replenishment quantities for supply-chain planners. Outputs feed planning dashboards; automated ordering stays within human-approved thresholds and is monitored for drift.",
          status: AiAppStatus.APPROVED,
          discovered_source: AiAppDiscoveredSource.MANUAL,
          owner_id: userId,
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      // =====================================================
      // Additional models (distinct external_key per model to
      // satisfy the per-organization unique external-key constraint)
      // =====================================================
      await createNewModelInventoryQuery(
        {
          provider_model: "Recommendation Ranking Model",
          provider: "Foundation Model Provider",
          model: "Recommendation Ranking Model",
          version: "1.0",
          approver: userId,
          capabilities: ["Ranking", "Personalization", "Embeddings"],
          security_assessment: true,
          status: "Approved",
          status_date: new Date(Date.now()),
          biases:
            "Popularity bias toward frequently purchased items; potential cold-start disadvantage for new products.",
          limitations:
            "Requires sufficient interaction history for reliable personalization. Latency-sensitive at high request volumes.",
          hosting_provider: "Managed LLM API (EU region)",
          reference_link: "https://example.com/models/recommendation-ranking",
          external_key: "demo-recommendation-ranking-model-001",
          security_assessment_data: [],
          is_demo: true,
        } as unknown as ModelInventoryModel,
        organizationId,
        [codingAssistantProject.id!],
        [],
        transaction,
      );

      await createNewModelInventoryQuery(
        {
          provider_model: "Demand Forecasting Model",
          provider: "In-house Data Science",
          model: "Demand Forecasting Model",
          version: "2.1.0",
          approver: userId,
          capabilities: ["Time-series forecasting", "Inventory optimization"],
          security_assessment: true,
          status: "Approved",
          status_date: new Date(Date.now()),
          biases:
            "Sensitivity to abrupt changes in supplier catalog feeds; seasonal SKUs may be under-forecast after data drift.",
          limitations:
            "Depends on clean, schema-stable input feeds. Automated ordering is bounded by human-approved thresholds.",
          hosting_provider: "Internal (private cloud)",
          reference_link: null,
          external_key: "demo-demand-forecasting-model-001",
          security_assessment_data: [],
          is_demo: true,
        } as unknown as ModelInventoryModel,
        organizationId,
        [demandForecastProject.id!],
        [],
        transaction,
      );

      // =====================================================
      // Additional vendors
      // =====================================================
      await createNewVendorQuery(
        {
          projects: [codingAssistantProject.id!],
          vendor_name: "Foundation Model Provider",
          vendor_provides:
            "Hosted large language models and embeddings used by the customer recommendation engine and internal coding assistant, accessed via the AI gateway under data-processing and enterprise privacy terms.",
          assignee: userId,
          website: "www.example-model-provider.com",
          vendor_contact_person: "Enterprise Account Team",
          review_result: "Positive",
          review_status: "Reviewed",
          reviewer: userId,
          review_date: new Date(Date.now()),
        },
        organizationId,
        transaction,
        true, // is demo
      );

      await createNewVendorQuery(
        {
          projects: [demandForecastProject.id!],
          vendor_name: "Data Labeling & Evaluation Partner",
          vendor_provides:
            "Data labeling and evaluation services supporting training and validation datasets for the demand-forecasting and recommendation models, under a data-processing agreement.",
          assignee: userId,
          website: "www.example-data-partner.com",
          vendor_contact_person: "Account Manager",
          review_result: "Positive",
          review_status: "In review",
          reviewer: userId,
          review_date: new Date(Date.now()),
        },
        organizationId,
        transaction,
        true, // is demo
      );

      // =====================================================
      // Additional training register entries
      // =====================================================
      await createNewTrainingRegistarQuery(
        {
          training_name: "ISO/IEC 42001 AI Management System Foundations",
          duration: "3 hours",
          provider: "VerifyWise Academy",
          department: "Engineering",
          status: "Completed",
          numberOfPeople: 18,
          description:
            "Foundational training on the ISO/IEC 42001 AI management system: clauses, Annex A controls, and how teams operating the recommendation, forecasting and coding-assistant systems apply them day to day.",
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      await createNewTrainingRegistarQuery(
        {
          training_name: "AI Fairness and Bias Mitigation",
          duration: "2 hours",
          provider: "Internal Responsible AI Team",
          department: "Data Science",
          status: "In Progress",
          numberOfPeople: 12,
          description:
            "Workshop on detecting and mitigating bias in AI systems, covering fairness metrics, monitoring thresholds, and the review process triggered when a model breaches them.",
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      await createNewTrainingRegistarQuery(
        {
          training_name: "Secure and Responsible Use of AI Coding Assistants",
          duration: "1 hour",
          provider: "Security Engineering",
          department: "Engineering",
          status: "Completed",
          numberOfPeople: 40,
          description:
            "Guidance for engineers on using the AI coding assistant safely: avoiding secret and proprietary-code leakage, reviewing AI-generated code before merge, license considerations, and the guardrails enforced through the AI gateway.",
          is_demo: true,
        },
        organizationId,
        transaction,
      );

      // =====================================================
      // Incidents
      //
      // Insert demo incidents directly rather than via
      // createNewIncidentQuery: that helper fires any active
      // "incident_added" automation (emails/notifications), which should
      // not happen when loading demo data. (Note: the vendor and training
      // helpers used above have the same automation behavior — a
      // pre-existing trait of the seeder, not addressed here.) The
      // `ai_project` values are free-text (not FKs) and must match the
      // seeded project titles above so the demo incidents resolve to real
      // use cases.
      // =====================================================
      const demoIncidents = [
        {
          ai_project: "Demand Forecasting & Inventory Optimization",
          type: IncidentType.MODEL_DRIFT,
          severity: Severity.SERIOUS,
          status: AIIncidentManagementStatus.OPEN,
          occurred_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          date_detected: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          categories_of_harm: ["Property"],
          description:
            "Demand-forecasting model produced systematically low forecasts for a group of seasonal SKUs over a two-week period, contributing to localized stockouts. Root cause traced to input-data drift after a supplier changed its product catalog feed. Detected via monitoring alerts on forecast-vs-actual error.",
          relationship_causality:
            "Input-data drift from a changed supplier catalog feed degraded forecast accuracy for the affected category.",
          immediate_mitigations:
            "Affected SKUs switched to manual planner review; forecast feed for the impacted category temporarily overridden with a prior-season baseline.",
          planned_corrective_actions:
            "Add schema-validation and drift detection on supplier catalog feeds; retrain model with corrected data; add automated alerting for sustained forecast bias.",
        },
        {
          ai_project: "AI Recruitment Screening Platform",
          type: IncidentType.UNEXPECTED_BEHAVIOR,
          severity: Severity.VERY_SERIOUS,
          status: AIIncidentManagementStatus.OPEN,
          occurred_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          date_detected: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          categories_of_harm: ["Rights"],
          description:
            "A routine fairness audit of the recruitment screening model detected a disparity in shortlisting rates across an age-related applicant group that exceeded the internal fairness threshold. No hiring decision was finalized on the affected batch. The model was paused for the impacted role family pending investigation and re-validation.",
          relationship_causality:
            "Model scoring showed a statistically significant disparity for the affected group above the internal fairness threshold.",
          immediate_mitigations:
            "Paused the model for the impacted role family and reverted affected shortlists to manual review.",
          planned_corrective_actions:
            "Conduct third-party fairness audit, remove/adjust contributing features, re-validate against fairness thresholds before re-enabling.",
        },
      ];

      for (const incident of demoIncidents) {
        await sequelize.query(
          `INSERT INTO ai_incident_managements (
            organization_id, ai_project, type, severity, status,
            occurred_date, date_detected, reporter, approval_status,
            categories_of_harm, description, relationship_causality,
            immediate_mitigations, planned_corrective_actions,
            interim_report, archived, is_demo, created_at, updated_at
          ) VALUES (
            :organization_id, :ai_project, :type, :severity, :status,
            :occurred_date, :date_detected, :reporter, :approval_status,
            :categories_of_harm, :description, :relationship_causality,
            :immediate_mitigations, :planned_corrective_actions,
            false, false, true, NOW(), NOW()
          )`,
          {
            replacements: {
              organization_id: organizationId,
              ai_project: incident.ai_project,
              type: incident.type,
              severity: incident.severity,
              status: incident.status,
              occurred_date: incident.occurred_date,
              date_detected: incident.date_detected,
              reporter: String(userId),
              approval_status: AIIncidentManagementApprovalStatus.PENDING,
              categories_of_harm: JSON.stringify(incident.categories_of_harm),
              description: incident.description,
              relationship_causality: incident.relationship_causality,
              immediate_mitigations: incident.immediate_mitigations,
              planned_corrective_actions: incident.planned_corrective_actions,
            },
            transaction,
          },
        );
      }
    } else {
      // project already exists, delete it and insert a new one
    }

    // Seed Shadow AI demo data (tools, events, rollups, rules, alerts)
    await insertShadowAiDemoData(organizationId, userId, transaction);

    // Seed AI Gateway demo data (endpoints, virtual keys, ~30 days of spend logs)
    await insertAiGatewayDemoData(organizationId, userId, transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteMockData(organizationId: number) {
  const transaction = await sequelize.transaction();
  try {
    // Clean all Shadow AI demo data first (no FK ties to governance tables)
    await deleteShadowAiDemoData(organizationId, transaction);

    // Clean AI Gateway demo data (spend logs, virtual keys, endpoints)
    await deleteAiGatewayDemoData(organizationId, transaction);

    // =====================================================
    // DELETE ORDER MATTERS - respect foreign key constraints
    // =====================================================

    // 1. Delete demo tasks (and their assignees first)
    const demoTasks = (await sequelize.query(
      `SELECT id FROM tasks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    )) as [{ id: number }[], number];

    for (const task of demoTasks[0]) {
      await sequelize.query(
        `DELETE FROM task_assignees WHERE organization_id = :organizationId AND task_id = :id`,
        { replacements: { organizationId, id: task.id }, transaction },
      );
    }
    await sequelize.query(
      `DELETE FROM tasks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 2. Delete demo training registers
    await sequelize.query(
      `DELETE FROM trainingregistar WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 2a. Delete demo AI apps (child tables cascade via ON DELETE CASCADE)
    await sequelize.query(
      `DELETE FROM ai_apps WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 2b. Delete demo incidents (dependent rows, e.g. ce_marking_incidents,
    // are removed automatically via ON DELETE CASCADE)
    await sequelize.query(
      `DELETE FROM ai_incident_managements WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 3. Delete demo policies (and their reviewer mappings first)
    const demoPolicies = (await sequelize.query(
      `SELECT id FROM policy_manager WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    )) as [{ id: number }[], number];

    for (const policy of demoPolicies[0]) {
      await sequelize.query(
        `DELETE FROM policy_manager__assigned_reviewer_ids WHERE organization_id = :organizationId AND policy_manager_id = :id`,
        { replacements: { organizationId, id: policy.id }, transaction },
      );
    }
    await sequelize.query(
      `DELETE FROM policy_manager WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 4. Delete demo model risks BEFORE model inventories (model_risks.model_id -> model_inventories.id)
    await sequelize.query(
      `DELETE FROM model_risks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 5. Delete demo datasets (and their relationships first)
    const demoDatasets = (await sequelize.query(
      `SELECT id FROM datasets WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    )) as [{ id: number }[], number];

    for (const dataset of demoDatasets[0]) {
      await sequelize.query(
        `DELETE FROM dataset_model_inventories WHERE organization_id = :organizationId AND dataset_id = :id`,
        { replacements: { organizationId, id: dataset.id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM dataset_projects WHERE organization_id = :organizationId AND dataset_id = :id`,
        { replacements: { organizationId, id: dataset.id }, transaction },
      );
    }
    await sequelize.query(
      `DELETE FROM datasets WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 6. Delete demo model inventories (and their relationships first)
    const demoModels = (await sequelize.query(
      `SELECT id FROM model_inventories WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    )) as [{ id: number }[], number];

    for (const model of demoModels[0]) {
      await sequelize.query(
        `DELETE FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :id`,
        { replacements: { organizationId, id: model.id }, transaction },
      );
    }
    await sequelize.query(
      `DELETE FROM model_inventories WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 7. Delete demo risks (and their project/framework relationships first)
    const demoRisks = (await sequelize.query(
      `SELECT id FROM risks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    )) as [{ id: number }[], number];

    for (const risk of demoRisks[0]) {
      // Delete all risk relationship tables
      await sequelize.query(
        `DELETE FROM projects_risks WHERE organization_id = :organizationId AND risk_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM controls_eu__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM answers_eu__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM subclauses_iso__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM annexcategories_iso__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM subclauses_iso27001__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction },
      );
      await sequelize.query(
        `DELETE FROM annexcontrols_iso27001__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction },
      );
    }
    await sequelize.query(
      `DELETE FROM risks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction },
    );

    // 8. Delete vendor related data (includes vendor risks)
    await deleteDemoVendorsData(organizationId, transaction);

    // 9. Delete demo projects (this will also delete projects_frameworks, projects_members, files, etc.)
    const demoProjects = (await getData("projects", organizationId, transaction)) as ProjectModel[];
    for (let project of demoProjects) {
      // Delete NIST AI RMF framework data first
      await deleteProjectFrameworkNISTQuery(project.id!, organizationId, transaction);
      // Then delete the project
      await deleteProjectByIdQuery(project.id!, organizationId, transaction);
    }

    // 10. Delete demo users (last, as they may be referenced by other entities)
    await deleteDemoUsersQuery(transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
