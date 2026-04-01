import {
  getData,
  deleteDemoVendorsData,
} from "../../utils/autoDriver.utils";
import { createEUFrameworkQuery } from "../../utils/eu.utils";
import { sequelize } from "../../database/db";
import {
  createNewProjectQuery,
  deleteProjectByIdQuery,
} from "../../utils/project.utils";
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
export async function insertMockData(
  organizationId: number,
  _organization: number,
  userId: number
) {
  const transaction = await sequelize.transaction();
  try {
    let projects = (
      (await getData("projects", organizationId, transaction)) as ProjectModel[]
    )[0];
    if (!projects) {
      // create project
      const project = await createNewProjectQuery(
        {
          project_title: "AI Recruitment Screening Platform",
          owner: userId,
          start_date: new Date(Date.now()),
          geography: 1,
          target_industry: "Human Resources",
          description: "An AI-powered platform that automates candidate screening, resume parsing, and preliminary assessments for recruitment processes. The system uses machine learning to rank candidates based on job requirements and historical hiring data.",
          ai_risk_classification: AiRiskClassification.HIGH_RISK,
          type_of_high_risk_role: HighRiskRole.DEPLOYER,
          goal: "To streamline recruitment while ensuring fair, unbiased, and transparent candidate evaluation in compliance with EU AI Act requirements for high-risk employment systems",
          last_updated: new Date(Date.now()),
          last_updated_by: userId,
        },
        [], // no additional members
        [1], // frameworks
        organizationId,
        userId,
        transaction,
        true // is demo
      );
      // create eu framework
      await createEUFrameworkQuery(
        project.id!,
        true,
        organizationId,
        transaction,
        true
      );

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
          review_notes: "Requires regular bias audits and demographic parity testing across protected groups.",
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
        transaction
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
        transaction
      );

      // create vendor
      let vendor = (
        (await getData("vendors", organizationId, transaction)) as IVendor[]
      )[0];
      if (!vendor) {
        vendor = await createNewVendorQuery(
          {
            projects: [project.id],
            vendor_name: "TalentAI Solutions",
            vendor_provides: "ML-based candidate scoring, resume parsing, and skills assessment APIs",
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
          true // is demo
        );
      } else {
        await addVendorProjects(vendor.id!, [project.id!], organizationId, transaction);
      }

      // Always create vendor risks if they don't exist
      // Check for existing demo vendor risks
      const existingVendorRisks = await sequelize.query(
        `SELECT COUNT(*) as count FROM vendorrisks WHERE organization_id = :organizationId AND is_demo = true`,
        { replacements: { organizationId }, transaction }
      ) as [{ count: string }[], number];

      const vendorRiskCount = parseInt(existingVendorRisks[0][0].count) || 0;

      if (vendorRiskCount === 0) {
        // create vendor risks (one high, one medium, one low)
        await createNewVendorRiskQuery(
          {
            vendor_id: vendor.id,
            risk_description: "Training Data Quality and Provenance",
            impact_description: "Vendor's ML models may be trained on biased or unrepresentative datasets, leading to discriminatory scoring of candidates. Lack of transparency in training data sources makes it difficult to audit for compliance.",
            likelihood: "Possible",
            risk_severity: "Major",
            action_plan: "Request vendor's model cards and training data documentation. Conduct independent bias testing on vendor API outputs. Include audit rights clause in vendor contract.",
            action_owner: userId,
            risk_level: "High risk",
            is_demo: true,
          },
          organizationId,
          transaction
        );

        await createNewVendorRiskQuery(
          {
            vendor_id: vendor.id,
            risk_description: "Data Security and Processing Location",
            impact_description: "Vendor processes candidate data in multiple jurisdictions. Risk of data being processed outside EU without adequate safeguards, potentially violating GDPR requirements for international data transfers.",
            likelihood: "Unlikely",
            risk_severity: "Moderate",
            action_plan: "Verify vendor's data processing locations and ensure Standard Contractual Clauses are in place. Request SOC 2 Type II certification and evidence of EU data residency options.",
            action_owner: userId,
            risk_level: "Medium risk",
            is_demo: true,
          },
          organizationId,
          transaction
        );

        await createNewVendorRiskQuery(
          {
            vendor_id: vendor.id,
            risk_description: "Service Level Agreement Compliance",
            impact_description: "Vendor may not meet agreed upon uptime and response time requirements during peak recruitment periods.",
            likelihood: "Rare",
            risk_severity: "Minor",
            action_plan: "Monitor vendor SLA performance monthly. Establish backup provider for critical recruitment periods.",
            action_owner: userId,
            risk_level: "Low risk",
            is_demo: true,
          },
          organizationId,
          transaction
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
          capabilities: ["Resume parsing", "Skills extraction", "Candidate scoring", "Job matching"],
          security_assessment: true,
          status: "Approved",
          status_date: new Date(Date.now()),
          reference_link: "https://docs.talentai-solutions.com/models/candidate-ranking",
          biases: "Known underrepresentation of non-English language resumes. Lower accuracy for candidates with non-traditional career paths.",
          limitations: "Cannot process handwritten documents. Maximum 10MB file size for resume uploads. Requires structured job descriptions for optimal matching.",
          hosting_provider: "AWS EU (Frankfurt)",
          security_assessment_data: [],
          is_demo: true,
        } as unknown as ModelInventoryModel,
        organizationId,
        [project.id!],
        [1],
        transaction
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
          description: "Risk of model accuracy degrading over time as job market trends, skill requirements, and candidate demographics change. Initial model was trained on 2022-2023 data which may not reflect current market conditions.",
          mitigation_plan: "Implement continuous monitoring of model performance metrics. Schedule quarterly model retraining with updated data. Establish drift detection alerts at 5% accuracy threshold.",
          impact: "Medium",
          likelihood: "Likely",
          key_metrics: "Precision, Recall, F1-Score, Demographic Parity",
          current_values: "Precision: 0.82, Recall: 0.78, F1: 0.80",
          threshold: "F1-Score must remain above 0.75",
          model_id: modelInventory.id,
          is_demo: true,
        },
        organizationId,
        transaction
      );

      await createNewModelRiskQuery(
        {
          risk_name: "Bias in Gender Prediction from Names",
          risk_category: ModelRiskCategory.BIAS,
          risk_level: ModelRiskLevel.HIGH,
          status: ModelRiskStatus.OPEN,
          owner: String(userId),
          target_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          description: "Model shows statistically significant differences in scoring between candidates with traditionally male vs female names, even when controlling for qualifications and experience.",
          mitigation_plan: "Remove name-based features from model input. Implement blind evaluation mode. Conduct third-party fairness audit and remediate findings.",
          impact: "High",
          likelihood: "Confirmed",
          key_metrics: "Statistical Parity Difference, Equalized Odds",
          current_values: "SPD: 0.12 (threshold: 0.05)",
          threshold: "SPD must be below 0.05",
          model_id: modelInventory.id,
          is_demo: true,
        },
        organizationId,
        transaction
      );

      // Create Dataset
      await createNewDatasetQuery(
        {
          name: "Historical Hiring Decisions Dataset",
          description: "Dataset containing 5 years of historical hiring decisions including candidate profiles, interview scores, and hiring outcomes. Used for training the candidate ranking model.",
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
          known_biases: "Dataset overrepresents candidates from technical backgrounds. Underrepresentation of candidates over 50 years old. Geographic bias towards urban areas.",
          bias_mitigation: "Applied synthetic oversampling for underrepresented groups. Removed age-related features. Implemented stratified sampling for training.",
          collection_method: "Extracted from HRIS system with candidate consent",
          preprocessing_steps: "PII anonymization, feature normalization, outlier removal, missing value imputation",
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
        transaction
      );

      // Create Tasks
      await createNewTaskQuery(
        {
          title: "Complete Bias Audit for Candidate Ranking Model",
          description: "Conduct comprehensive bias audit across protected characteristics (gender, age, ethnicity) for the TalentScore Pro model. Document findings and create remediation plan.",
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
        [{ user_id: userId }]
      );

      await createNewTaskQuery(
        {
          title: "Update Data Processing Agreement with TalentAI",
          description: "Review and update the DPA with TalentAI Solutions to include new SCCs, clarify data residency requirements, and add audit rights clause.",
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
        [{ user_id: userId }]
      );

      await createNewTaskQuery(
        {
          title: "Implement Human Oversight Dashboard",
          description: "Design and implement a dashboard for HR managers to review AI-generated candidate rankings and provide manual overrides with documented justification.",
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
        [{ user_id: userId }]
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
          description: "Comprehensive training on EU AI Act requirements for high-risk AI systems in employment contexts. Covers legal obligations, human oversight requirements, and documentation standards.",
          is_demo: true,
        },
        organizationId,
        transaction
      );

      await createNewTrainingRegistarQuery(
        {
          training_name: "Responsible AI Practices Workshop",
          duration: "2 days",
          provider: "External Consultant",
          department: "Engineering",
          status: "In Progress",
          numberOfPeople: 15,
          description: "Hands-on workshop for ML engineers covering bias detection, fairness metrics, explainability techniques, and model documentation best practices.",
          is_demo: true,
        },
        organizationId,
        transaction
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
        transaction
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
        transaction
      );
    } else {
      // project already exists, delete it and insert a new one
    }

    // Seed Shadow AI demo data (tools, events, rollups, rules, alerts)
    await insertShadowAiDemoData(organizationId, userId, transaction);

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

    // =====================================================
    // DELETE ORDER MATTERS - respect foreign key constraints
    // =====================================================

    // 1. Delete demo tasks (and their assignees first)
    const demoTasks = await sequelize.query(
      `SELECT id FROM tasks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    ) as [{ id: number }[], number];

    for (const task of demoTasks[0]) {
      await sequelize.query(
        `DELETE FROM task_assignees WHERE organization_id = :organizationId AND task_id = :id`,
        { replacements: { organizationId, id: task.id }, transaction }
      );
    }
    await sequelize.query(
      `DELETE FROM tasks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    );

    // 2. Delete demo training registers
    await sequelize.query(
      `DELETE FROM trainingregistar WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    );

    // 3. Delete demo policies (and their reviewer mappings first)
    const demoPolicies = await sequelize.query(
      `SELECT id FROM policy_manager WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    ) as [{ id: number }[], number];

    for (const policy of demoPolicies[0]) {
      await sequelize.query(
        `DELETE FROM policy_manager__assigned_reviewer_ids WHERE organization_id = :organizationId AND policy_manager_id = :id`,
        { replacements: { organizationId, id: policy.id }, transaction }
      );
    }
    await sequelize.query(
      `DELETE FROM policy_manager WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    );

    // 4. Delete demo model risks BEFORE model inventories (model_risks.model_id -> model_inventories.id)
    await sequelize.query(
      `DELETE FROM model_risks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    );

    // 5. Delete demo datasets (and their relationships first)
    const demoDatasets = await sequelize.query(
      `SELECT id FROM datasets WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    ) as [{ id: number }[], number];

    for (const dataset of demoDatasets[0]) {
      await sequelize.query(
        `DELETE FROM dataset_model_inventories WHERE organization_id = :organizationId AND dataset_id = :id`,
        { replacements: { organizationId, id: dataset.id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM dataset_projects WHERE organization_id = :organizationId AND dataset_id = :id`,
        { replacements: { organizationId, id: dataset.id }, transaction }
      );
    }
    await sequelize.query(
      `DELETE FROM datasets WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    );

    // 6. Delete demo model inventories (and their relationships first)
    const demoModels = await sequelize.query(
      `SELECT id FROM model_inventories WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    ) as [{ id: number }[], number];

    for (const model of demoModels[0]) {
      await sequelize.query(
        `DELETE FROM model_inventories_projects_frameworks WHERE organization_id = :organizationId AND model_inventory_id = :id`,
        { replacements: { organizationId, id: model.id }, transaction }
      );
    }
    await sequelize.query(
      `DELETE FROM model_inventories WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    );

    // 7. Delete demo risks (and their project/framework relationships first)
    const demoRisks = await sequelize.query(
      `SELECT id FROM risks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    ) as [{ id: number }[], number];

    for (const risk of demoRisks[0]) {
      // Delete all risk relationship tables
      await sequelize.query(
        `DELETE FROM projects_risks WHERE organization_id = :organizationId AND risk_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM controls_eu__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM answers_eu__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM subclauses_iso__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM annexcategories_iso__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM subclauses_iso27001__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM annexcontrols_iso27001__risks WHERE organization_id = :organizationId AND projects_risks_id = :id`,
        { replacements: { organizationId, id: risk.id }, transaction }
      );
    }
    await sequelize.query(
      `DELETE FROM risks WHERE organization_id = :organizationId AND is_demo = true`,
      { replacements: { organizationId }, transaction }
    );

    // 8. Delete vendor related data (includes vendor risks)
    await deleteDemoVendorsData(organizationId, transaction);

    // 9. Delete demo projects (this will also delete projects_frameworks, projects_members, files, etc.)
    const demoProjects = (await getData(
      "projects",
      organizationId,
      transaction
    )) as ProjectModel[];
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
