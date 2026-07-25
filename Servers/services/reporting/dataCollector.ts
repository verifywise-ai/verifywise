/**
 * Data Collector Service for Report Generation
 * Collects and transforms data from various sources into unified report structure
 * Following VerifyWise clean architecture patterns
 */

import {
  ReportData,
  ReportMetadata,
  ReportBranding,
  ChartData,
  RenderedCharts,
  RiskDistributionData,
  AssessmentStatusData,
  ProjectRisksSectionData,
  VendorsListSectionData,
  VendorRisksSectionData,
  ComplianceSectionData,
  AssessmentSectionData,
  ClausesAndAnnexesSectionData,
  NistSubcategoriesSectionData,
  ModelsListSectionData,
  ModelRisksSectionData,
  TrainingRegistrySectionData,
  PolicyManagerSectionData,
  IncidentManagementSectionData,
} from "../../domain.layer/interfaces/i.reportGeneration";
import {
  generateRiskDistributionChart,
  generateRiskDonutChart,
  generateComplianceProgressChart,
  generateRiskLegend,
  generateAssessmentStatusChart,
  generateAssessmentLegend,
} from "./chartUtils";
import {
  getProjectRisksReportQuery,
  getAssessmentReportQuery,
  getComplianceReportQuery,
  getClausesReportQuery,
  getAnnexesReportQuery,
} from "../../utils/reporting.utils";
import { getOrganizationByIdQuery } from "../../utils/organization.utils";
import { getUserByIdQuery } from "../../utils/user.utils";
import { getProjectByIdQuery } from "../../utils/project.utils";
import { getAllFrameworkByIdQuery } from "../../utils/framework.utils";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";

// Risk level color mapping
const RISK_LEVEL_COLORS: Record<string, string> = {
  Critical: "#B42318",
  "Very High": "#B42318",
  High: "#C4320A",
  Medium: "#B54708",
  Low: "#027A48",
  "Very Low": "#026AA2",
};

/**
 * ISO `YYYY-MM-DD`, or undefined when there is no usable date.
 *
 * EXPORTED deliberately: this is the report pipeline's ONE date
 * normalisation. The analyzers' facts substrate (§1/§3) hands the model a
 * reference date and asks it to compare due dates against it, so both sides of
 * that comparison must be sliced the same way or they disagree by a day.
 *
 * Locale-independent on purpose: `toLocaleDateString()` renders whatever the
 * server's locale happens to be. Built from LOCAL components rather than
 * `toISOString()` — pg hands back a DATE column as local midnight, and
 * UTC-shifting that reports the previous day anywhere west of Greenwich.
 */
export const isoDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Status color mapping (for future use with charts)
// const STATUS_COLORS: Record<string, string> = {
//   Compliant: "#027A48",
//   Complete: "#027A48",
//   Completed: "#027A48",
//   "In Progress": "#B54708",
//   Partial: "#B54708",
//   "Non-Compliant": "#B42318",
//   Incomplete: "#B42318",
//   "Not Applicable": "#344054",
//   Draft: "#344054",
// };

export class ReportDataCollector {
  private organizationId: number;
  private projectId: number;
  private frameworkId: number;
  private projectFrameworkId: number;
  private userId: number;

  constructor(
    organizationId: number,
    projectId: number,
    frameworkId: number,
    projectFrameworkId: number,
    userId: number,
  ) {
    this.organizationId = organizationId;
    this.projectId = projectId;
    this.frameworkId = frameworkId;
    this.projectFrameworkId = projectFrameworkId;
    this.userId = userId;
  }

  /**
   * Collect all report data based on requested sections
   *
   * Section Groups:
   * - Risk Analysis: projectRisks, vendorRisks, modelRisks
   * - Compliance & Governance: compliance, assessment (EU AI Act), clausesAndAnnexes (ISO), nistSubcategories (NIST)
   * - Organization: vendors, models, trainingRegistry, policyManager, incidentManagement
   *
   * Framework-specific sections:
   * - Framework 1 (EU AI Act): assessment, compliance
   * - Framework 2 (ISO 42001): clausesAndAnnexes
   * - Framework 3 (ISO 27001): clausesAndAnnexes
   * - Framework 4 (NIST AI RMF): nistSubcategories
   */
  async collectAllData(sections: string[]): Promise<ReportData> {
    const metadata = await this.collectMetadata();
    const branding = await this.collectBranding();
    const charts = await this.collectChartData(sections);
    const isOrganizational = metadata.isOrganizational;

    const sectionData: ReportData["sections"] = {};

    // ============================================
    // RISK ANALYSIS GROUP
    // ============================================

    // Project/Use Case Risks - common for all
    if (sections.includes("projectRisks") || sections.includes("all")) {
      sectionData.projectRisks = await this.collectProjectRisks();
    }

    // Vendor Risks - available for all report types
    // For organizational reports, shows ALL vendor risks across organization
    // For use case reports, shows vendor risks filtered by project
    if (sections.includes("vendorRisks") || sections.includes("all")) {
      sectionData.vendorRisks = await this.collectVendorRisks(isOrganizational);
    }

    // Model Risks - available for all report types
    // For organizational reports, shows ALL model risks across organization
    // For use case reports, shows model risks filtered by project
    if (sections.includes("modelRisks") || sections.includes("all")) {
      sectionData.modelRisks = await this.collectModelRisks(isOrganizational);
    }

    // ============================================
    // COMPLIANCE & GOVERNANCE GROUP
    // ============================================

    // EU AI Act specific sections (frameworkId = 1)
    if (this.frameworkId === 1 && !isOrganizational) {
      if (sections.includes("compliance") || sections.includes("all")) {
        sectionData.compliance = await this.collectCompliance();
      }

      if (sections.includes("assessment") || sections.includes("all")) {
        sectionData.assessment = await this.collectAssessment();
      }
    }

    // ISO 42001 and ISO 27001 specific sections (frameworkId = 2 or 3)
    //
    // No !isOrganizational guard here, unlike EU AI Act above. frameworks.
    // is_organizational is true for ISO 42001, ISO 27001 and NIST AI RMF, and
    // createNewProjectQuery only lets a project take frameworks whose flag
    // matches its own — so these three can ONLY ever sit on an organizational
    // project. Requiring !isOrganizational made both branches unreachable and
    // silently dropped the section from every report that asked for it.
    // The frameworkId check is sufficient on its own: the collector is built
    // from a real projects_frameworks row, so the pairing is already valid.
    if (this.frameworkId === 2 || this.frameworkId === 3) {
      if (sections.includes("clausesAndAnnexes") || sections.includes("all")) {
        sectionData.clausesAndAnnexes = await this.collectClausesAndAnnexes();
      }
    }

    // NIST AI RMF specific sections (frameworkId = 4) — same reasoning.
    if (this.frameworkId === 4) {
      if (sections.includes("nistSubcategories") || sections.includes("all")) {
        sectionData.nistSubcategories = await this.collectNistSubcategories();
      }
    }

    // ============================================
    // ORGANIZATION GROUP
    // ============================================

    // Vendors list - for all reports
    if (sections.includes("vendors") || sections.includes("all")) {
      sectionData.vendors = await this.collectVendorsList(isOrganizational);
    }

    // Models list - for all reports
    if (sections.includes("models") || sections.includes("all")) {
      sectionData.models = await this.collectModelsList(isOrganizational);
    }

    if (sections.includes("trainingRegistry") || sections.includes("all")) {
      sectionData.trainingRegistry = await this.collectTrainingRegistry();
    }

    if (sections.includes("policyManager") || sections.includes("all")) {
      sectionData.policyManager = await this.collectPolicyManager();
    }

    if (sections.includes("incidentManagement") || sections.includes("all")) {
      sectionData.incidentManagement = await this.collectIncidentManagement(isOrganizational);
    }

    // Render chart SVGs
    const renderedCharts = this.renderCharts(charts);

    return {
      metadata,
      branding,
      charts,
      renderedCharts,
      sections: sectionData,
    };
  }

  /**
   * Render chart data into SVG strings
   */
  private renderCharts(charts: ChartData): RenderedCharts {
    const rendered: RenderedCharts = {};

    if (charts.riskDistribution && charts.riskDistribution.length > 0) {
      rendered.riskDistributionBar = generateRiskDistributionChart(charts.riskDistribution, {
        width: 350,
        title: "Risk distribution by level",
      });
      rendered.riskDistributionDonut = generateRiskDonutChart(charts.riskDistribution, {
        size: 180,
      });
      rendered.riskLegend = generateRiskLegend(charts.riskDistribution, {
        width: 350,
        inline: true,
      });
    }

    if (charts.complianceProgress && charts.complianceProgress.length > 0) {
      rendered.complianceProgress = generateComplianceProgressChart(charts.complianceProgress, {
        width: 350,
        title: "Compliance progress by category",
      });
    }

    if (charts.assessmentStatus && charts.assessmentStatus.length > 0) {
      rendered.assessmentStatus = generateAssessmentStatusChart(charts.assessmentStatus, {
        size: 180,
        title: "",
      });
      rendered.assessmentLegend = generateAssessmentLegend(charts.assessmentStatus, { width: 300 });
    }

    return rendered;
  }

  /**
   * Collect report metadata
   */
  private async collectMetadata(): Promise<ReportMetadata> {
    const project = await getProjectByIdQuery(this.projectId, this.organizationId);
    const framework = await getAllFrameworkByIdQuery(this.frameworkId, this.organizationId);
    const user = await getUserByIdQuery(this.userId);

    // Get project owner name
    let projectOwnerName = "Unknown";
    if (project?.owner) {
      const owner = await getUserByIdQuery(project.owner);
      if (owner) {
        projectOwnerName = `${owner.name || ""} ${owner.surname || ""}`.trim();
      }
    }

    return {
      projectId: this.projectId,
      projectTitle: project?.project_title || "Unknown Project",
      projectOwner: projectOwnerName,
      frameworkId: this.frameworkId,
      frameworkName: framework?.name || "Unknown Framework",
      projectFrameworkId: this.projectFrameworkId,
      generatedAt: new Date(),
      generatedBy: user ? `${user.name || ""} ${user.surname || ""}`.trim() : "System",
      organizationId: this.organizationId,
      isOrganizational: project?.is_organizational || false,
    };
  }

  /**
   * Collect organization branding
   */
  private async collectBranding(): Promise<ReportBranding> {
    const user = await getUserByIdQuery(this.userId);
    let organizationName = "VerifyWise";
    let organizationLogo: string | undefined;

    if (user?.organization_id) {
      const organization = await getOrganizationByIdQuery(user.organization_id);
      if (organization) {
        organizationName = organization.name || "VerifyWise";
        // Fetch organization logo if available
        if (organization.logo) {
          organizationLogo = organization.logo;
        }
      }
    }

    return {
      organizationName,
      organizationLogo,
      primaryColor: "#13715B", // VerifyWise green
      secondaryColor: "#1C2130",
    };
  }

  /**
   * Collect chart data for visualizations
   * Framework-specific chart data collection
   */
  private async collectChartData(sections: string[]): Promise<ChartData> {
    const chartData: ChartData = {};

    // Risk distribution is common for all frameworks
    if (sections.includes("projectRisks") || sections.includes("all")) {
      chartData.riskDistribution = await this.collectRiskDistribution();
    }

    // Compliance progress is only for EU AI Act (frameworkId = 1)
    if (this.frameworkId === 1) {
      if (sections.includes("compliance") || sections.includes("all")) {
        chartData.complianceProgress = await this.collectComplianceProgress();
      }

      if (sections.includes("assessment") || sections.includes("all")) {
        chartData.assessmentStatus = await this.collectAssessmentStatus();
      }
    }

    return chartData;
  }

  /**
   * Collect risk distribution data for charts
   */
  private async collectRiskDistribution(): Promise<RiskDistributionData[]> {
    const risks = await getProjectRisksReportQuery(this.projectId, this.organizationId);
    const distribution: Record<string, number> = {};

    (risks as any[]).forEach((risk) => {
      const level = risk.risk_level_autocalculated || "Unknown";
      distribution[level] = (distribution[level] || 0) + 1;
    });

    return Object.entries(distribution).map(([level, count]) => ({
      level,
      count,
      color: RISK_LEVEL_COLORS[level] || "#667085",
    }));
  }

  /**
   * Collect compliance progress data for charts
   * Note: getComplianceReportQuery returns control categories with nested controls
   */
  private async collectComplianceProgress(): Promise<
    { category: string; completed: number; total: number; percentage: number }[]
  > {
    try {
      const controlCategories = await getComplianceReportQuery(
        this.projectFrameworkId,
        this.organizationId,
      );

      // Calculate progress per control category
      const progressMap: Record<string, { completed: number; total: number }> = {};

      (controlCategories as any[]).forEach((category) => {
        const categoryName = category.name || category.dataValues?.name || "Other";
        const controls = category.dataValues?.controls || category.controls || [];

        if (!progressMap[categoryName]) {
          progressMap[categoryName] = { completed: 0, total: 0 };
        }

        controls.forEach((control: any) => {
          progressMap[categoryName].total++;
          if (control.status === "Done") {
            progressMap[categoryName].completed++;
          }
        });
      });

      return Object.entries(progressMap).map(([category, data]) => ({
        category,
        completed: data.completed,
        total: data.total,
        percentage: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      }));
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting compliance progress:", error);
      return [];
    }
  }

  /**
   * Collect assessment status data for charts
   */
  private async collectAssessmentStatus(): Promise<AssessmentStatusData[]> {
    try {
      const assessmentData = await getAssessmentReportQuery(
        this.projectId,
        this.frameworkId,
        this.organizationId,
      );

      let answered = 0;
      let pending = 0;

      (assessmentData as any[]).forEach((topic) => {
        (topic.subtopics || []).forEach((subtopic: any) => {
          (subtopic.questions || []).forEach((q: any) => {
            if (q.status === "Done") {
              answered++;
            } else {
              pending++;
            }
          });
        });
      });

      return [
        { status: "Answered", count: answered, color: "#027A48" },
        { status: "Pending", count: pending, color: "#F2F4F7" },
      ];
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting assessment status:", error);
      return [];
    }
  }

  /**
   * Collect project risks section data
   */
  private async collectProjectRisks(): Promise<ProjectRisksSectionData> {
    const risks = (await getProjectRisksReportQuery(this.projectId, this.organizationId)) as any[];

    const risksByLevel: Record<string, number> = {};
    risks.forEach((risk) => {
      const level = risk.risk_level_autocalculated || "Unknown";
      risksByLevel[level] = (risksByLevel[level] || 0) + 1;
    });

    return {
      totalRisks: risks.length,
      risksByLevel: Object.entries(risksByLevel).map(([level, count]) => ({
        level,
        count,
        color: RISK_LEVEL_COLORS[level] || "#667085",
      })),
      risks: risks.map((risk) => ({
        id: risk.id,
        name: risk.risk_name || "Unnamed Risk",
        description: risk.risk_description || "",
        riskLevel: risk.risk_level_autocalculated || "Unknown",
        impact: risk.risk_severity || "Unknown",
        likelihood: risk.likelihood || "Unknown",
        // `risks` carries both columns and they are orthogonal — a risk can be
        // mitigation_status 'Completed' while approval_status is 'Rejected'.
        // Reading approval under this name made the section's "how many are
        // unmitigated" question answer against approval state instead.
        mitigationStatus: risk.mitigation_status || "Unknown",
        owner:
          `${risk.risk_owner_name || ""} ${risk.risk_owner_surname || ""}`.trim() || "Unassigned",
      })),
    };
  }

  /**
   * Collect vendors list section data (Organization group)
   * For organizational reports: all vendors
   * For use case reports: vendors linked to project
   */
  private async collectVendorsList(isOrganizational: boolean): Promise<VendorsListSectionData> {
    try {
      let vendorsQuery: string;
      let replacements: Record<string, any> = {};

      if (isOrganizational) {
        // Get all vendors for organizational reports
        vendorsQuery = `
          SELECT v.*, u.name as assignee_name, u.surname as assignee_surname
          FROM vendors v
          LEFT JOIN users u ON v.assignee = u.id
          WHERE v.organization_id = :organizationId
          ORDER BY v.vendor_name ASC
        `;
        replacements = { organizationId: this.organizationId };
      } else {
        // Get only project-linked vendors for use case reports
        vendorsQuery = `
          SELECT v.*, u.name as assignee_name, u.surname as assignee_surname
          FROM vendors v
          JOIN vendors_projects vp ON v.id = vp.vendor_id AND vp.organization_id = v.organization_id
          LEFT JOIN users u ON v.assignee = u.id
          WHERE v.organization_id = :organizationId AND vp.project_id = :projectId
          ORDER BY v.vendor_name ASC
        `;
        replacements = { organizationId: this.organizationId, projectId: this.projectId };
      }

      const vendors = (await sequelize.query(vendorsQuery, {
        replacements,
        type: QueryTypes.SELECT,
      })) as any[];

      return {
        totalVendors: vendors.length,
        vendors: vendors.map((v) => ({
          id: v.id,
          name: v.vendor_name || "Unknown Vendor",
          website: v.website,
          contactPerson: v.vendor_contact_person,
          riskStatus: v.review_status || "Unknown",
          assignee: v.assignee_name
            ? `${v.assignee_name} ${v.assignee_surname || ""}`.trim()
            : undefined,
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting vendors list:", error);
      return { totalVendors: 0, vendors: [] };
    }
  }

  /**
   * Collect vendor risks section data (Risk Analysis group)
   * For use case reports: filtered by project
   * For organizational reports: ALL vendor risks across organization
   */
  private async collectVendorRisks(
    isOrganizational: boolean = false,
  ): Promise<VendorRisksSectionData> {
    try {
      let vendorRisksQuery: string;
      let replacements: Record<string, any>;

      if (isOrganizational) {
        // For organizational reports, get ALL vendor risks
        vendorRisksQuery = `
          SELECT vr.*, v.vendor_name as vendor_name, u.name as owner_name, u.surname as owner_surname
          FROM vendorrisks vr
          JOIN vendors v ON vr.vendor_id = v.id AND v.organization_id = vr.organization_id
          LEFT JOIN users u ON vr.action_owner = u.id
          WHERE vr.organization_id = :organizationId
          ORDER BY vr.id ASC
        `;
        replacements = { organizationId: this.organizationId };
      } else {
        // For use case reports, filter by project
        vendorRisksQuery = `
          SELECT vr.*, v.vendor_name as vendor_name, u.name as owner_name, u.surname as owner_surname
          FROM vendorrisks vr
          JOIN vendors v ON vr.vendor_id = v.id AND v.organization_id = vr.organization_id
          LEFT JOIN users u ON vr.action_owner = u.id
          JOIN vendors_projects vp ON v.id = vp.vendor_id AND vp.organization_id = v.organization_id
          WHERE vr.organization_id = :organizationId AND vp.project_id = :projectId
          ORDER BY vr.id ASC
        `;
        replacements = { organizationId: this.organizationId, projectId: this.projectId };
      }

      const vendorRisks = (await sequelize.query(vendorRisksQuery, {
        replacements,
        type: QueryTypes.SELECT,
      })) as any[];

      return {
        totalRisks: vendorRisks.length,
        risks: vendorRisks.map((vr) => ({
          id: vr.id,
          vendorName: vr.vendor_name || "Unknown Vendor",
          riskName: vr.risk_description || "Unnamed Risk",
          riskLevel: vr.risk_level || "Unknown",
          actionOwner: vr.owner_name
            ? `${vr.owner_name} ${vr.owner_surname || ""}`.trim()
            : undefined,
          actionPlan: vr.action_plan,
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting vendor risks:", error);
      return { totalRisks: 0, risks: [] };
    }
  }

  /**
   * Resolve users.id -> "Name Surname" for the ids handed in.
   *
   * Controls carry a numeric `owner` FK, not a name (eu.utils.ts:482).
   *
   * `users` is tenant-scoped, so this filters on the caller's organization
   * (docs/technical/security/tenant-isolation.md §2.1, §4.4). getUserByIdQuery
   * is `SELECT * FROM users WHERE id = :id` with no org filter, and the names
   * it returns reach the rendered report, the facts block sent to the tenant's
   * LLM provider, collectAllowedOwners, and the persisted audit_metadata — an
   * id pointing at another tenant must resolve to nothing, not to a name. Users
   * with a NULL organization_id (SuperAdmin/seed, §2.2) are dropped for the
   * same reason.
   *
   * One query for the whole set, so this is also not N sequential round-trips.
   * `IN (:ids)` rather than `= ANY(:ids)`: sequelize expands an array
   * replacement to a bare comma list, which is valid inside IN and not inside
   * ANY. A failed lookup degrades every owner to undefined rather than failing
   * the report.
   */
  private async resolveUserNames(ids: unknown[]): Promise<Map<number, string>> {
    const distinct = Array.from(
      new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id))),
    );
    const resolved = new Map<number, string>();
    if (distinct.length === 0) return resolved;

    try {
      const users = (await sequelize.query(
        `SELECT id, name, surname FROM users
         WHERE organization_id = :organizationId AND id IN (:ids)`,
        {
          replacements: { organizationId: this.organizationId, ids: distinct },
          type: QueryTypes.SELECT,
        },
      )) as any[];
      for (const user of users) {
        const name = `${user.name || ""} ${user.surname || ""}`.trim();
        if (name) resolved.set(user.id, name);
      }
    } catch (error) {
      console.error("[ReportDataCollector] Error resolving user names:", error);
    }
    return resolved;
  }

  /**
   * Collect compliance section data
   * Note: getComplianceReportQuery returns control categories with nested controls
   */
  private async collectCompliance(): Promise<ComplianceSectionData> {
    const controlCategories = (await getComplianceReportQuery(
      this.projectFrameworkId,
      this.organizationId,
    )) as any[];

    // Flatten controls from all categories
    const allControls: any[] = [];
    controlCategories.forEach((category) => {
      const controls = category.dataValues?.controls || category.controls || [];
      controls.forEach((control: any) => {
        allControls.push({
          ...control,
          categoryName: category.name || category.dataValues?.name || "Unknown",
        });
      });
    });

    const completedControls = allControls.filter((c) => c.status === "Done").length;
    const ownerNames = await this.resolveUserNames(allControls.map((c) => c.owner));

    return {
      overallProgress:
        allControls.length > 0 ? Math.round((completedControls / allControls.length) * 100) : 0,
      totalControls: allControls.length,
      completedControls,
      controls: allControls.map((c) => ({
        id: c.id,
        controlId: c.control_id || `C-${c.id}`,
        title: c.title || "Untitled Control",
        status: c.status || "Unknown",
        description: c.description,
        // `c.owner_name` was undefined for every control: the row carries a
        // numeric `owner` FK, not a joined name.
        owner: typeof c.owner === "number" ? ownerNames.get(c.owner) : undefined,
        // categoryName was computed above and then dropped. Control family is
        // exactly the grouping the compliance analysis needs.
        category: c.categoryName,
        dueDate: isoDate(c.due_date),
      })),
    };
  }

  /**
   * Collect assessment section data
   */
  private async collectAssessment(): Promise<AssessmentSectionData> {
    const assessmentData = await getAssessmentReportQuery(
      this.projectId,
      this.frameworkId,
      this.organizationId,
    );

    let totalQuestions = 0;
    let answeredQuestions = 0;

    const topics = (assessmentData as any[]).map((topic) => {
      const subtopics = (topic.subtopics || []).map((subtopic: any) => {
        const questions = (subtopic.questions || []).map((q: any) => {
          totalQuestions++;
          const isDone = q.status === "Done";
          if (isDone) {
            answeredQuestions++;
          }
          return {
            id: q.id,
            question: q.question || "Unnamed Question",
            answer: q.answer,
            status: isDone ? "Answered" : "Pending",
          };
        });

        return {
          id: subtopic.id,
          title: subtopic.title || "Untitled Subtopic",
          questions,
        };
      });

      const topicQuestions = subtopics.reduce(
        (sum: number, st: any) => sum + st.questions.length,
        0,
      );
      const topicAnswered = subtopics.reduce(
        (sum: number, st: any) =>
          sum + st.questions.filter((q: any) => q.status === "Answered").length,
        0,
      );

      return {
        id: topic.id,
        title: topic.title || "Untitled Topic",
        progress: topicQuestions > 0 ? Math.round((topicAnswered / topicQuestions) * 100) : 0,
        subtopics,
      };
    });

    return {
      totalQuestions,
      answeredQuestions,
      topics,
    };
  }

  /**
   * Collect clauses and annexes section data (for ISO frameworks)
   */
  private async collectClausesAndAnnexes(): Promise<ClausesAndAnnexesSectionData> {
    try {
      const clauses = await getClausesReportQuery(this.projectFrameworkId, this.organizationId);
      const annexes = await getAnnexesReportQuery(this.projectFrameworkId, this.organizationId);

      return {
        clauses: (clauses as any[]).map((clause) => ({
          id: clause.id,
          clauseId: clause.clause_id || `Clause ${clause.id}`,
          title: clause.title || "Untitled Clause",
          status: clause.status || "Unknown",
          subClauses: (clause.subClauses || []).map((sc: any) => ({
            id: sc.id,
            title: sc.title || "Untitled Sub-Clause",
            status: sc.status || "Unknown",
          })),
        })),
        annexes: (annexes as any[]).map((annex) => ({
          id: annex.id,
          annexId: annex.annex_id || `Annex ${annex.id}`,
          title: annex.title || "Untitled Annex",
          status: annex.status || "Unknown",
          controls: (annex.annexCategories || []).map((ac: any) => ({
            id: ac.id,
            controlId: ac.control_id || `AC-${ac.id}`,
            title: ac.title || "Untitled Control",
            status: ac.status || "Unknown",
          })),
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting clauses and annexes:", error);
      return { clauses: [], annexes: [] };
    }
  }

  /**
   * Collect models list section data (Organization group)
   * For organizational reports: all models
   * For use case reports: models linked to project
   */
  private async collectModelsList(isOrganizational: boolean): Promise<ModelsListSectionData> {
    try {
      let modelsQuery: string;
      let replacements: Record<string, any> = {};

      if (isOrganizational) {
        // Get all models for organizational reports
        modelsQuery = `
          SELECT mi.*, u.name as approver_name, u.surname as approver_surname
          FROM model_inventories mi
          LEFT JOIN users u ON mi.approver = u.id
          WHERE mi.organization_id = :organizationId
          ORDER BY mi.model ASC
        `;
        replacements = { organizationId: this.organizationId };
      } else {
        // Get only project-linked models for use case reports
        modelsQuery = `
          SELECT mi.*, u.name as approver_name, u.surname as approver_surname
          FROM model_inventories mi
          JOIN model_inventories_projects_frameworks mip ON mi.id = mip.model_inventory_id AND mip.organization_id = mi.organization_id
          LEFT JOIN users u ON mi.approver = u.id
          WHERE mi.organization_id = :organizationId AND mip.project_id = :projectId
          ORDER BY mi.model ASC
        `;
        replacements = { organizationId: this.organizationId, projectId: this.projectId };
      }

      const models = (await sequelize.query(modelsQuery, {
        replacements,
        type: QueryTypes.SELECT,
      })) as any[];

      return {
        totalModels: models.length,
        models: models.map((m) => ({
          id: m.id,
          name: m.model || "Unnamed Model",
          version: m.version,
          status: m.status || "Unknown",
          approver: m.approver_name
            ? `${m.approver_name} ${m.approver_surname || ""}`.trim()
            : undefined,
          description: m.capabilities,
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting models list:", error);
      return { totalModels: 0, models: [] };
    }
  }

  /**
   * Collect model risks section data (Risk Analysis group)
   * For use case reports: filtered by project
   * For organizational reports: ALL model risks across organization
   */
  private async collectModelRisks(
    isOrganizational: boolean = false,
  ): Promise<ModelRisksSectionData> {
    try {
      let modelRisksQuery: string;
      let replacements: Record<string, any>;

      if (isOrganizational) {
        // For organizational reports, get ALL model risks
        modelRisksQuery = `
          SELECT mr.*, mi.model as model_name
          FROM model_risks mr
          JOIN model_inventories mi ON mr.model_id = mi.id AND mi.organization_id = mr.organization_id
          WHERE mr.organization_id = :organizationId
          ORDER BY mr.id ASC
        `;
        replacements = { organizationId: this.organizationId };
      } else {
        // For use case reports, filter by project
        modelRisksQuery = `
          SELECT mr.*, mi.model as model_name
          FROM model_risks mr
          JOIN model_inventories mi ON mr.model_id = mi.id AND mi.organization_id = mr.organization_id
          JOIN model_inventories_projects_frameworks mip ON mi.id = mip.model_inventory_id AND mip.organization_id = mi.organization_id
          WHERE mr.organization_id = :organizationId AND mip.project_id = :projectId
          ORDER BY mr.id ASC
        `;
        replacements = { organizationId: this.organizationId, projectId: this.projectId };
      }

      const modelRisks = (await sequelize.query(modelRisksQuery, {
        replacements,
        type: QueryTypes.SELECT,
      })) as any[];

      return {
        totalRisks: modelRisks.length,
        risks: modelRisks.map((mr) => ({
          id: mr.id,
          modelName: mr.model_name || "Unknown Model",
          riskName: mr.risk_name || "Unnamed Risk",
          riskLevel: mr.risk_level || "Unknown",
          // model_risks has `status`, not `mitigation_status`. The old read
          // resolved to undefined for every row, so every model risk in every
          // report rendered as "Unknown".
          mitigationStatus: mr.status || "Unknown",
          // All four are already fetched by the SELECT mr.* above and were
          // being discarded here.
          mitigationPlan: mr.mitigation_plan || undefined,
          targetDate: isoDate(mr.target_date),
          impact: mr.impact || undefined,
          likelihood: mr.likelihood || undefined,
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting model risks:", error);
      return { totalRisks: 0, risks: [] };
    }
  }

  /**
   * Collect training registry section data
   */
  private async collectTrainingRegistry(): Promise<TrainingRegistrySectionData> {
    try {
      const trainingQuery = `
        SELECT tr.*
        FROM trainingregistar tr
        WHERE tr.organization_id = :organizationId
        ORDER BY tr.id ASC
      `;

      const records = (await sequelize.query(trainingQuery, {
        replacements: { organizationId: this.organizationId },
        type: QueryTypes.SELECT,
      })) as any[];

      return {
        totalRecords: records.length,
        records: records.map((r) => ({
          id: r.id,
          trainingName: r.training_name || "Unnamed Training",
          status: r.status || "Unknown",
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting training registry:", error);
      return { totalRecords: 0, records: [] };
    }
  }

  /**
   * Collect policy manager section data
   */
  private async collectPolicyManager(): Promise<PolicyManagerSectionData> {
    try {
      const policiesQuery = `
        SELECT p.*, p.next_review_date as review_date,
               u.name as owner_name, u.surname as owner_surname
        FROM policy_manager p
        LEFT JOIN users u ON p.policy_owner_id = u.id
        WHERE p.organization_id = :organizationId
        ORDER BY p.title ASC
      `;

      const policies = (await sequelize.query(policiesQuery, {
        replacements: { organizationId: this.organizationId },
        type: QueryTypes.SELECT,
      })) as any[];

      return {
        totalPolicies: policies.length,
        policies: policies.map((p) => ({
          id: p.id,
          policyName: p.title || "Unnamed Policy",
          status: p.status || "Unknown",
          reviewDate: p.review_date ? new Date(p.review_date).toLocaleDateString() : undefined,
          owner: p.owner_name ? `${p.owner_name} ${p.owner_surname || ""}`.trim() : undefined,
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting policy manager:", error);
      return { totalPolicies: 0, policies: [] };
    }
  }

  /**
   * Collect NIST AI RMF subcategories section data
   * Groups subcategories by function (Govern, Map, Measure, Manage)
   */
  private async collectNistSubcategories(): Promise<NistSubcategoriesSectionData> {
    try {
      // Get subcategories with their risks for this project
      const subcategoriesQuery = `
        SELECT
          ns.id,
          ss.subcategory_id AS subcategory_id,
          ss.description AS name,
          ss.function AS function,
          cs.category_id AS category,
          ns.status,
          r.id AS risk_id,
          r.risk_name,
          r.risk_level_autocalculated AS risk_level
        FROM nist_ai_rmf_subcategories ns
        JOIN nist_ai_rmf_subcategories_struct ss ON ns.subcategory_meta_id = ss.id
        JOIN nist_ai_rmf_categories_struct cs ON ss.category_struct_id = cs.id
        LEFT JOIN nist_ai_rmf_subcategories__risks nsr
               ON nsr.nist_ai_rmf_subcategory_id = ns.id
              AND nsr.organization_id = ns.organization_id
        LEFT JOIN risks r ON r.id = nsr.projects_risks_id
        WHERE ns.organization_id = :organizationId AND ns.projects_frameworks_id = :projectFrameworkId
        ORDER BY ss.function, cs.order_no, ss.order_no
      `;

      const results = (await sequelize.query(subcategoriesQuery, {
        replacements: {
          organizationId: this.organizationId,
          projectFrameworkId: this.projectFrameworkId,
        },
        type: QueryTypes.SELECT,
      })) as any[];

      // Group by function -> category -> subcategory
      const functionMap: Record<string, Record<string, any[]>> = {};

      results.forEach((row) => {
        const func = row.function || "Other";
        const cat = row.category || "Other";

        if (!functionMap[func]) {
          functionMap[func] = {};
        }
        if (!functionMap[func][cat]) {
          functionMap[func][cat] = [];
        }

        // Find or create subcategory entry
        let subcategory = functionMap[func][cat].find((s) => s.id === row.id);
        if (!subcategory) {
          subcategory = {
            id: row.id,
            subcategoryId: row.subcategory_id,
            name: row.name,
            status: row.status || "Not Started",
            risks: [],
          };
          functionMap[func][cat].push(subcategory);
        }

        // Add risk if exists
        if (row.risk_id) {
          subcategory.risks.push({
            id: row.risk_id,
            riskName: row.risk_name || "Unnamed Risk",
            riskLevel: row.risk_level || "Unknown",
          });
        }
      });

      // Convert to structured format
      const functions = Object.entries(functionMap).map(([name, categories]) => ({
        name,
        categories: Object.entries(categories).map(([catName, subcategories]) => ({
          id: catName,
          name: catName,
          subcategories: subcategories.map((s) => ({
            id: s.id,
            subcategoryId: s.subcategoryId,
            name: s.name,
            status: s.status,
            risks: s.risks,
          })),
        })),
      }));

      // Sort functions in correct order
      const functionOrder = ["Govern", "Map", "Measure", "Manage"];
      functions.sort((a, b) => {
        const aIndex = functionOrder.indexOf(a.name);
        const bIndex = functionOrder.indexOf(b.name);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });

      return { functions };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting NIST subcategories:", error);
      return { functions: [] };
    }
  }

  /**
   * Collect incident management section data
   * For organizational reports: all incidents
   * For use case reports: incidents linked to project
   */
  private async collectIncidentManagement(
    isOrganizational: boolean,
  ): Promise<IncidentManagementSectionData> {
    try {
      let incidentsQuery: string;
      let replacements: Record<string, any> = {};

      if (isOrganizational) {
        // Get all incidents for organizational reports
        incidentsQuery = `
          SELECT aim.*
          FROM ai_incident_managements aim
          WHERE aim.organization_id = :organizationId
          ORDER BY aim.created_at DESC
        `;
        replacements = { organizationId: this.organizationId };
      } else {
        // Get only project-linked incidents for use case reports.
        // ai_project is a varchar column, so bind the project id as text.
        incidentsQuery = `
          SELECT aim.*
          FROM ai_incident_managements aim
          WHERE aim.organization_id = :organizationId AND aim.ai_project = :projectId
          ORDER BY aim.created_at DESC
        `;
        replacements = { organizationId: this.organizationId, projectId: String(this.projectId) };
      }

      const incidents = (await sequelize.query(incidentsQuery, {
        replacements,
        type: QueryTypes.SELECT,
      })) as any[];

      return {
        totalIncidents: incidents.length,
        incidents: incidents.map((inc) => ({
          id: inc.id,
          incidentId: inc.incident_id || `INC-${inc.id}`,
          // No `title` here: ai_incident_managements has no title column, and
          // aliasing `type` under one printed it twice in adjacent columns.
          type: inc.type || "Unknown",
          severity: inc.severity || "Unknown",
          status: inc.status || "Unknown",
          reportedDate: inc.date_detected
            ? new Date(inc.date_detected).toLocaleDateString()
            : inc.created_at
              ? new Date(inc.created_at).toLocaleDateString()
              : undefined,
          resolvedDate: undefined,
          // `reporter` is who filed the incident. There is no assignee column,
          // and the filer is not the person accountable for the incident.
          reporter: inc.reporter || undefined,
        })),
      };
    } catch (error) {
      console.error("[ReportDataCollector] Error collecting incident management:", error);
      return { totalIncidents: 0, incidents: [] };
    }
  }
}

/**
 * Factory function to create a data collector instance
 */
export function createDataCollector(
  organizationId: number,
  projectId: number,
  frameworkId: number,
  projectFrameworkId: number,
  userId: number,
): ReportDataCollector {
  return new ReportDataCollector(
    organizationId,
    projectId,
    frameworkId,
    projectFrameworkId,
    userId,
  );
}
