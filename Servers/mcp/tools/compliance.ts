/**
 * Compliance tools.
 *
 * Read-only. Each framework stores its progress in its own tables, keyed by the
 * projects_frameworks row rather than by use case, so the per-framework counts
 * come from that framework's own query — the same ones the console's progress
 * bars read.
 *
 * NIST AI RMF is the exception: its subcategories are organization-scoped, not
 * per use case, so its progress is reported once for the organization.
 */

import { z } from "zod";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { calculateComplianceScore } from "../../utils/compliance.utils";
import { countAnswersEUByProjectId, countSubControlsEUByProjectId } from "../../utils/eu.utils";
import {
  countAnnexCategoriesISOByProjectId,
  countSubClausesISOByProjectId as countSubClauses42001ByProjectId,
} from "../../utils/iso42001.utils";
import {
  countAnnexControlsISOByProjectId,
  countSubClausesISOByProjectId as countSubClauses27001ByProjectId,
} from "../../utils/iso27001.utils";
import { countNISTAIRMFSubcategoriesProgress } from "../../utils/nist_ai_rmf.subcategory.utils";
import { requireOrganization } from "../scope";
import { listFrameworkRefs } from "../frameworks";
import { CREATE_TIME_FRAMEWORK_BUILDERS } from "../../services/useCase.service";
import { result, type ToolDef } from "../tool";

const organizationIdArg = z
  .number()
  .int()
  .positive()
  .describe("Id of the organization to report on.");

interface ProjectFrameworkRow {
  project_framework_id: number;
  framework_id: number;
  framework_name: string;
  project_id: number;
  project_title: string;
}

/** Every framework instantiated on every use case in one organization. */
async function listProjectFrameworks(organizationId: number): Promise<ProjectFrameworkRow[]> {
  return (await sequelize.query(
    `SELECT pf.id AS project_framework_id,
            pf.framework_id,
            f.name AS framework_name,
            p.id AS project_id,
            p.project_title
     FROM projects_frameworks pf
     JOIN frameworks f ON f.id = pf.framework_id
     JOIN projects p ON p.id = pf.project_id AND p.organization_id = pf.organization_id
     WHERE pf.organization_id = :organizationId
     ORDER BY p.id ASC, pf.framework_id ASC`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as ProjectFrameworkRow[];
}

function percentage(done: number, total: number): number | null {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

/**
 * The progress of one instantiated framework.
 *
 * Each framework counts different things — EU AI Act has subcontrols and
 * assessment answers, both ISO frameworks have clauses and annexes — so the
 * tracks are named rather than flattened into one number that would mean
 * something different per framework.
 */
async function frameworkProgress(
  row: ProjectFrameworkRow,
  organizationId: number,
): Promise<Record<string, unknown>> {
  const tracks: Record<string, unknown> = {};

  if (row.framework_id === 1) {
    const controls = await countSubControlsEUByProjectId(row.project_framework_id, organizationId);
    const answers = await countAnswersEUByProjectId(row.project_framework_id, organizationId);
    const totalControls = parseInt(controls.totalSubcontrols, 10) || 0;
    const doneControls = parseInt(controls.doneSubcontrols, 10) || 0;
    const totalQuestions = parseInt(answers.totalAssessments, 10) || 0;
    const doneQuestions = parseInt(answers.answeredAssessments, 10) || 0;
    tracks.controls = {
      total: totalControls,
      done: doneControls,
      percent: percentage(doneControls, totalControls),
    };
    tracks.assessment = {
      total: totalQuestions,
      answered: doneQuestions,
      percent: percentage(doneQuestions, totalQuestions),
    };
  } else if (row.framework_id === 2) {
    const clauses = await countSubClauses42001ByProjectId(row.project_framework_id, organizationId);
    const annexes = await countAnnexCategoriesISOByProjectId(
      row.project_framework_id,
      organizationId,
    );
    const totalClauses = parseInt(clauses.totalSubclauses, 10) || 0;
    const doneClauses = parseInt(clauses.doneSubclauses, 10) || 0;
    const totalAnnexes = parseInt(annexes.totalAnnexcategories, 10) || 0;
    const doneAnnexes = parseInt(annexes.doneAnnexcategories, 10) || 0;
    tracks.clauses = {
      total: totalClauses,
      done: doneClauses,
      percent: percentage(doneClauses, totalClauses),
    };
    tracks.annexCategories = {
      total: totalAnnexes,
      done: doneAnnexes,
      percent: percentage(doneAnnexes, totalAnnexes),
    };
  } else if (row.framework_id === 3) {
    const clauses = await countSubClauses27001ByProjectId(row.project_framework_id, organizationId);
    const annexes = await countAnnexControlsISOByProjectId(
      row.project_framework_id,
      organizationId,
    );
    const totalClauses = parseInt(clauses.totalSubclauses, 10) || 0;
    const doneClauses = parseInt(clauses.doneSubclauses, 10) || 0;
    const totalAnnexes = parseInt(annexes.totalAnnexControls, 10) || 0;
    const doneAnnexes = parseInt(annexes.doneAnnexControls, 10) || 0;
    tracks.clauses = {
      total: totalClauses,
      done: doneClauses,
      percent: percentage(doneClauses, totalClauses),
    };
    tracks.annexControls = {
      total: totalAnnexes,
      done: doneAnnexes,
      percent: percentage(doneAnnexes, totalAnnexes),
    };
  } else if (row.framework_id === 4) {
    // Organization-scoped, so the same figures appear against every use case
    // this framework is attached to.
    const subcategories = await countNISTAIRMFSubcategoriesProgress(organizationId);
    tracks.subcategories = {
      total: subcategories.totalSubcategories,
      done: subcategories.doneSubcategories,
      percent: percentage(subcategories.doneSubcategories, subcategories.totalSubcategories),
      scope: "organization",
    };
  } else {
    // One of the 21 bundled frameworks, which track completion through their
    // own structures rather than these tables.
    tracks.note = "This framework does not report progress through the core control tables.";
  }

  return tracks;
}

const getCompliancePosture: ToolDef = {
  name: "get_compliance_posture",
  title: "Get compliance posture",
  description:
    "Report how far along an organization's compliance work is: the weighted AI governance score across risk, vendor, use case, model and policy management, plus per-use-case progress for every framework it has instantiated. Use this to answer 'how compliant is this organization' or 'which use case is behind'.",
  inputSchema: {
    organizationId: organizationIdArg,
    useCaseId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Restrict the framework breakdown to a single use case."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);

    const rows = await listProjectFrameworks(args.organizationId);
    const scoped =
      args.useCaseId === undefined ? rows : rows.filter((row) => row.project_id === args.useCaseId);

    const useCases = new Map<number, Record<string, unknown>>();
    for (const row of scoped) {
      if (!useCases.has(row.project_id)) {
        useCases.set(row.project_id, {
          useCaseId: row.project_id,
          title: row.project_title,
          frameworks: [] as unknown[],
        });
      }
      (useCases.get(row.project_id)!.frameworks as unknown[]).push({
        frameworkId: row.framework_id,
        framework: row.framework_name,
        progress: await frameworkProgress(row, args.organizationId),
      });
    }

    const score = await calculateComplianceScore(args.organizationId);

    return result({
      organizationId: args.organizationId,
      overallScore: score.overallScore,
      calculatedAt: score.calculatedAt,
      modules: Object.fromEntries(
        Object.entries(score.modules).map(([name, module]) => [
          name,
          { score: module.score, weight: module.weight, dataPoints: module.totalDataPoints },
        ]),
      ),
      useCases: [...useCases.values()],
      // An organization with no framework attached anywhere is not an error —
      // say so, rather than letting an empty list read as a failed lookup.
      note:
        scoped.length === 0
          ? "No compliance framework is instantiated on any use case in this organization."
          : undefined,
    });
  },
};

const listFrameworks: ToolDef = {
  name: "list_frameworks",
  title: "List frameworks",
  description:
    "List the compliance frameworks this deployment ships, with the name to use when attaching one to a use case or mapping a risk to it, and whether it is organization-wide or use-case scoped. A use case can only hold frameworks of one scope.",
  inputSchema: {},
  handler: async () => {
    const frameworks = await listFrameworkRefs();
    return result({
      count: frameworks.length,
      frameworks: frameworks.map((framework) => ({
        id: framework.id,
        name: framework.name,
        scope: framework.isOrganizational ? "organization wide" : "use case",
        // Whether attaching this framework to a new use case builds out its
        // controls, clauses and assessments, or only records the attachment.
        buildsControls: framework.id in CREATE_TIME_FRAMEWORK_BUILDERS,
      })),
    });
  },
};

export const complianceTools: ToolDef[] = [listFrameworks, getCompliancePosture];
