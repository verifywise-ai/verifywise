import dotenv from "dotenv";
import { Sequelize } from "sequelize-typescript";
import { RoleModel } from "../domain.layer/models/role/role.model";
import { AssessmentModel } from "../domain.layer/models/assessment/assessment.model";
import { ControlModel } from "../domain.layer/models/control/control.model";
import { ControlCategoryModel } from "../domain.layer/models/controlCategory/controlCategory.model";
import { FileModel } from "../domain.layer/models/file/file.model";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { RiskModel } from "../domain.layer/models/risks/risk.model";
import { ProjectScopeModel } from "../domain.layer/models/projectScope/projectScope.model";
import { ProjectsMembersModel } from "../domain.layer/models/projectsMembers/projectsMembers.model";
import { QuestionModel } from "../domain.layer/models/question/question.model";
import { SubcontrolModel } from "../domain.layer/models/subcontrol/subcontrol.model";
import { SubtopicModel } from "../domain.layer/models/subtopic/subtopic.model";
import { TopicModel } from "../domain.layer/models/topic/topic.model";
import { UserModel } from "../domain.layer/models/user/user.model";
import { VendorModel } from "../domain.layer/models/vendor/vendor.model";
import { VendorRiskModel } from "../domain.layer/models/vendorRisk/vendorRisk.model";
import { VendorsProjectsModel } from "../domain.layer/models/vendorsProjects/vendorsProjects.model";
import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import { ModelRiskModel } from "../domain.layer/models/modelRisk/modelRisk.model";
import dbConfig from "./config/config";
import { Dialect } from "sequelize";
import { FrameworkModel } from "../domain.layer/models/frameworks/frameworks.model";
import { ProjectFrameworksModel } from "../domain.layer/models/projectFrameworks/projectFrameworks.model";
import { TopicStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/topicStructEU.model";
import { SubtopicStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/subTopicStructEU.model";
import { QuestionStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/questionStructEU.model";
import { AnswerEUModel } from "../domain.layer/frameworks/EU-AI-Act/answerEU.model";
import { ControlCategoryStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/controlCategoryStructEU.model";
import { ControlStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/controlStructEU.model";
import { SubcontrolStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/subControlStructEU.model";
import { ControlEUModel } from "../domain.layer/frameworks/EU-AI-Act/controlEU.model";
import { SubcontrolEUModel } from "../domain.layer/frameworks/EU-AI-Act/subControlEU.model";
import { AssessmentEUModel } from "../domain.layer/frameworks/EU-AI-Act/assessmentEU.model";
import { AnnexCategoryISOModel } from "../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { AnnexCategoryISORisksModel } from "../domain.layer/frameworks/ISO-42001/annexCategoryISORIsks.model";
import { AnnexCategoryStructISOModel } from "../domain.layer/frameworks/ISO-42001/annexCategoryStructISO.model";
import { AnnexStructISOModel } from "../domain.layer/frameworks/ISO-42001/annexStructISO.model";
import { ClauseStructISOModel } from "../domain.layer/frameworks/ISO-42001/clauseStructISO.model";
import { SubClauseISOModel } from "../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { SubClauseStructISOModel } from "../domain.layer/frameworks/ISO-42001/subClauseStructISO.model";
import { OrganizationModel } from "../domain.layer/models/organization/organization.model";
import { TrainingRegistarModel } from "../domain.layer/models/trainingRegistar/trainingRegistar.model";
import { AITrustCenterCompanyDescriptionModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreCompanyDescription.model";
import { AITrustCenterComplianceBadgesModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreComplianceBadges.model";
import { AITrustCenterInfoModel } from "../domain.layer/models/aiTrustCentre/aiTrustCenterInfo.model";
import { AITrustCenterIntroModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreIntro.model";
import { AITrustCenterResourcesModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreResources.model";
import { AITrustCenterSubprocessorsModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreSubprocessors.model";
import { AITrustCenterTermsAndContactModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreTermsAndContract.model";
import { PolicyManagerModel } from "../domain.layer/models/policy/policy.model";
import { ISO27001SubClauseModel } from "../domain.layer/frameworks/ISO-27001/ISO27001SubClause.model";
import { ISO27001AnnexStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexStruct.model";
import { ISO27001AnnexControlModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexControl.model";
import { ISO27001ClauseStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001ClauseStruct.model";
import { ISO27001SubClauseRisksModel } from "../domain.layer/frameworks/ISO-27001/ISO27001SubClauseRisks.model";
import { ISO27001SubClauseStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001SubClauseStruct.model";
import { ISO27001AnnexControlRisksModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexControlRisks.model";
import { ISO27001AnnexControlStructModel } from "../domain.layer/frameworks/ISO-27001/ISO27001AnnexControlStruct.model";
import { TiersModel } from "../domain.layer/models/tiers/tiers.model";
import { SubscriptionModel } from "../domain.layer/models/subscriptions/subscriptions.model";
import { TasksModel } from "../domain.layer/models/tasks/tasks.model";
import { TaskAssigneesModel } from "../domain.layer/models/taskAssignees/taskAssignees.model";
import { SlackWebhookModel } from "../domain.layer/models/slackNotification/slackWebhook.model";
import { AutomationModel } from "../domain.layer/models/automation/automation.model";
import { AutomationActionModel } from "../domain.layer/models/automationAction/automationAction.model";
import { AutomationTriggerModel } from "../domain.layer/models/automationTrigger/automationTrigger.model";
import { AutomationTriggerActionModel } from "../domain.layer/models/automationTriggerAction/automationTriggerAction.model";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import { MLFlowModelRecordModel } from "../domain.layer/models/mlflowModelRecord/mlflowModelRecord.model";
import { AutomationExecutionLogModel } from "../domain.layer/models/automationExecutionLog/automationExecutionLog.model";
import { ModelInventoryHistoryModel } from "../domain.layer/models/modelInventoryHistory/modelInventoryHistory.model";
import { RiskHistoryModel } from "../domain.layer/models/riskHistory/riskHistory.model";
import { UserPreferencesModel } from "../domain.layer/models/userPreferences/userPreferences.model";
import { NISTAIMRFSubcategoryModel } from "../domain.layer/frameworks/NIST-AI-RMF/nist_ai_rmf_subcategory.model";
import { NISTAIMRFCategoryModel } from "../domain.layer/frameworks/NIST-AI-RMF/nist_ai_rmf_category.model";
// NISTAIMRFFunctionModel is now an interface (functions derived from struct tables)
import { EvidenceHubModel } from "../domain.layer/models/evidenceHub/evidenceHub.model";
import { LLMKeyModel } from "../domain.layer/models/llmKey/llmKey.model";
import { ShareLinkModel } from "../domain.layer/models/shareLink/shareLink.model";
import { EvaluationLlmApiKeyModel } from "../domain.layer/models/evaluationLlmApiKey/evaluationLlmApiKey.model";
import { NotesModel } from "../domain.layer/models/notes/notes.model";
import { EntityGraphAnnotationsModel } from "../domain.layer/models/entityGraphAnnotations/entityGraphAnnotations.model";
import { EntityGraphViewsModel } from "../domain.layer/models/entityGraphViews/entityGraphViews.model";
import { EntityGraphGapRulesModel } from "../domain.layer/models/entityGraphGapRules/entityGraphGapRules.model";
import { PolicyLinkedObjectsModel } from "../domain.layer/models/policy/policy_linked_objects.model";
import { ApprovalRequestModel } from "../domain.layer/models/approvalWorkflow/approvalRequest.model";
import { ApprovalRequestStepModel } from "../domain.layer/models/approvalWorkflow/approvalRequestStep.model";
import { ApprovalRequestStepApprovalModel } from "../domain.layer/models/approvalWorkflow/approvalRequestStepApproval.model";
import { ApprovalStepApproversModel } from "../domain.layer/models/approvalWorkflow/approvalStepApprovers.model";
import { ApprovalWorkflowModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflow.model";
import { ApprovalWorkflowStepModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflowStep.model";
import { DatasetModel } from "../domain.layer/models/dataset/dataset.model";

dotenv.config();

const conf = dbConfig.development;

const sequelize = new Sequelize(conf.database!, conf.username!, conf.password, {
  host: conf.host!,
  port: Number(conf.port!),
  dialect: conf.dialect! as Dialect,
  schema: "verifywise",
  logging: false,
  define: {
    schema: "verifywise",
  },
  hooks: {
    afterConnect: async (connection: any) => {
      await connection.query("SET search_path TO verifywise;");
    },
  },
  models: [
    RoleModel,
    AssessmentModel,
    ControlModel,
    ControlCategoryModel,
    FileModel,
    ProjectModel,
    RiskModel,
    ProjectScopeModel,
    ProjectsMembersModel,
    QuestionModel,
    SubcontrolModel,
    SubtopicModel,
    TopicModel,
    UserModel,
    VendorModel,
    VendorRiskModel,
    VendorsProjectsModel,
    ModelInventoryModel,
    ModelRiskModel,
    FrameworkModel,
    ProjectFrameworksModel,
    AssessmentEUModel,
    TopicStructEUModel,
    SubtopicStructEUModel,
    QuestionStructEUModel,
    AnswerEUModel,
    ControlCategoryStructEUModel,
    ControlStructEUModel,
    SubcontrolStructEUModel,
    ControlEUModel,
    SubcontrolEUModel,
    AnnexCategoryISOModel,
    AnnexCategoryISORisksModel,
    AnnexCategoryStructISOModel,
    AnnexStructISOModel,
    ClauseStructISOModel,
    SubClauseISOModel,
    SubClauseStructISOModel,
    TrainingRegistarModel,
    OrganizationModel,
    AITrustCenterCompanyDescriptionModel,
    AITrustCenterComplianceBadgesModel,
    AITrustCenterInfoModel,
    AITrustCenterIntroModel,
    AITrustCenterResourcesModel,
    AITrustCenterSubprocessorsModel,
    AITrustCenterTermsAndContactModel,
    PolicyManagerModel,
    ISO27001SubClauseModel,
    ISO27001AnnexStructModel,
    ISO27001AnnexControlModel,
    ISO27001ClauseStructModel,
    ISO27001SubClauseRisksModel,
    ISO27001SubClauseStructModel,
    ISO27001AnnexControlRisksModel,
    ISO27001AnnexControlStructModel,
    TiersModel,
    SubscriptionModel,
    TasksModel,
    TaskAssigneesModel,
    SlackWebhookModel,
    AutomationModel,
    AutomationActionModel,
    AutomationTriggerModel,
    AutomationTriggerActionModel,
    AIIncidentManagementModel,
    EvidenceHubModel,
    MLFlowModelRecordModel,
    AutomationExecutionLogModel,
    ModelInventoryHistoryModel,
    RiskHistoryModel,
    UserPreferencesModel,
    NISTAIMRFCategoryModel,
    NISTAIMRFSubcategoryModel,
    LLMKeyModel,
    ShareLinkModel,
    EvaluationLlmApiKeyModel,
    NotesModel,
    EntityGraphAnnotationsModel,
    EntityGraphViewsModel,
    EntityGraphGapRulesModel,
    PolicyLinkedObjectsModel,
    ApprovalRequestModel,
    ApprovalRequestStepModel,
    ApprovalRequestStepApprovalModel,
    ApprovalStepApproversModel,
    ApprovalWorkflowModel,
    ApprovalWorkflowStepModel,
    DatasetModel,
  ],
}) as Sequelize;

export { sequelize };
