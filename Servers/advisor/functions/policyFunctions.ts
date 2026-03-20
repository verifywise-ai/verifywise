import { getAllPoliciesQuery } from "../../utils/policyManager.utils";
import { POLICY_TAGS } from "../../domain.layer/interfaces/i.policy";
import { POLICY_STATUS_ENUM } from "../../utils/validations/policiesValidation.utils";
import logger from "../../utils/logger/fileLogger";

// Import policy templates from the client-side JSON
// Note: In production, this should be fetched from a proper data source
import * as fs from "fs";
import * as path from "path";

interface PolicyTemplate {
  id: number;
  title: string;
  description: string;
  content: string;
  tags: string[];
  category: string;
}

let policyTemplates: PolicyTemplate[] = [];
try {
  const templatesPath = path.join(
    __dirname,
    "../../../../Clients/src/application/data/PolicyTemplates.json"
  );
  const templatesContent = fs.readFileSync(templatesPath, "utf-8");
  policyTemplates = JSON.parse(templatesContent);
} catch (error) {
  logger.warn("Could not load policy templates:", error);
}

export interface FetchPoliciesParams {
  status?: "Draft" | "Under Review" | "Approved" | "Published" | "Archived" | "Deprecated";
  tag?: string;
  review_due_days?: number;
  overdue_review?: boolean;
  limit?: number;
}

interface PolicyWithReviewers {
  id: number;
  title: string;
  content_html: string;
  status: string;
  tags: string[];
  next_review_date: Date | null;
  author_id: number;
  assigned_reviewer_ids: number[];
  last_updated_by: number;
  last_updated_at: Date;
  created_at?: Date;
}

const fetchPolicies = async (
  params: FetchPoliciesParams,
  organizationId: number
): Promise<Partial<PolicyWithReviewers>[]> => {
  let policies: PolicyWithReviewers[] = [];

  try {
    policies = (await getAllPoliciesQuery(organizationId)) as PolicyWithReviewers[];
    const now = new Date();

    // Apply filters
    if (params.status) {
      policies = policies.filter((p) => p.status === params.status);
    }
    if (params.tag) {
      policies = policies.filter((p) => {
        const tags = p.tags || [];
        return tags.some((t) => t.toLowerCase().includes(params.tag!.toLowerCase()));
      });
    }
    if (params.review_due_days !== undefined) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + params.review_due_days);
      policies = policies.filter((p) => {
        if (!p.next_review_date) return false;
        const reviewDate = new Date(p.next_review_date);
        return reviewDate >= now && reviewDate <= futureDate;
      });
    }
    if (params.overdue_review) {
      policies = policies.filter((p) => {
        if (!p.next_review_date) return false;
        const reviewDate = new Date(p.next_review_date);
        return reviewDate < now;
      });
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      policies = policies.slice(0, params.limit);
    }

    // Return lightweight projections — exclude content_html (too large for LLM context)
    return policies.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      tags: p.tags,
      next_review_date: p.next_review_date,
      last_updated_at: p.last_updated_at,
      created_at: p.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching policies:", error);
    throw new Error(
      `Failed to fetch policies: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

export interface PolicyAnalytics {
  statusDistribution: {
    [status: string]: number;
  };
  tagDistribution: Array<{
    tag: string;
    count: number;
    percentage: number;
  }>;
  reviewScheduleAnalysis: {
    overdueReviews: number;
    dueThisWeek: number;
    dueThisMonth: number;
    noReviewDateSet: number;
  };
  authorWorkload: Array<{
    authorId: number;
    count: number;
    publishedCount: number;
    draftCount: number;
  }>;
  totalPolicies: number;
  publishedPolicies: number;
  draftPolicies: number;
}

const getPolicyAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<PolicyAnalytics> => {
  try {
    const policies = (await getAllPoliciesQuery(organizationId)) as PolicyWithReviewers[];
    const totalPolicies = policies.length;
    const now = new Date();

    // 1. Status Distribution
    const statusDistribution: { [status: string]: number } = {};
    POLICY_STATUS_ENUM.forEach((status) => {
      statusDistribution[status] = 0;
    });

    policies.forEach((policy) => {
      if (policy.status) {
        statusDistribution[policy.status] = (statusDistribution[policy.status] || 0) + 1;
      }
    });

    // 2. Tag Distribution
    const tagMap = new Map<string, number>();
    policies.forEach((policy) => {
      if (policy.tags && Array.isArray(policy.tags)) {
        policy.tags.forEach((tag: string) => {
          tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
        });
      }
    });

    const tagDistribution = Array.from(tagMap.entries())
      .map(([tag, count]) => ({
        tag,
        count,
        percentage: totalPolicies > 0 ? Math.round((count / totalPolicies) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. Review Schedule Analysis
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    let overdueReviews = 0;
    let dueThisWeek = 0;
    let dueThisMonth = 0;
    let noReviewDateSet = 0;

    policies.forEach((policy) => {
      if (!policy.next_review_date) {
        noReviewDateSet++;
      } else {
        const reviewDate = new Date(policy.next_review_date);
        if (reviewDate < now) {
          overdueReviews++;
        } else if (reviewDate <= oneWeekFromNow) {
          dueThisWeek++;
        } else if (reviewDate <= oneMonthFromNow) {
          dueThisMonth++;
        }
      }
    });

    // 4. Author Workload
    const authorMap = new Map<number, { count: number; publishedCount: number; draftCount: number }>();
    policies.forEach((policy) => {
      if (policy.author_id) {
        const existing = authorMap.get(policy.author_id) || {
          count: 0,
          publishedCount: 0,
          draftCount: 0,
        };
        existing.count++;
        if (policy.status === "Published") {
          existing.publishedCount++;
        }
        if (policy.status === "Draft") {
          existing.draftCount++;
        }
        authorMap.set(policy.author_id, existing);
      }
    });

    const authorWorkload = Array.from(authorMap.entries())
      .map(([authorId, data]) => ({
        authorId,
        count: data.count,
        publishedCount: data.publishedCount,
        draftCount: data.draftCount,
      }))
      .sort((a, b) => b.count - a.count);

    const publishedPolicies = policies.filter((p) => p.status === "Published").length;
    const draftPolicies = policies.filter((p) => p.status === "Draft").length;

    return {
      statusDistribution,
      tagDistribution,
      reviewScheduleAnalysis: {
        overdueReviews,
        dueThisWeek,
        dueThisMonth,
        noReviewDateSet,
      },
      authorWorkload,
      totalPolicies,
      publishedPolicies,
      draftPolicies,
    };
  } catch (error) {
    logger.error("Error getting policy analytics:", error);
    throw new Error(
      `Failed to get policy analytics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

export interface PolicyExecutiveSummary {
  totalPolicies: number;
  draftPolicies: number;
  underReviewPolicies: number;
  approvedPolicies: number;
  publishedPolicies: number;
  archivedPolicies: number;
  deprecatedPolicies: number;
  overdueReviews: number;
  reviewsDueThisWeek: number;
  reviewsDueThisMonth: number;
  policiesNeedingAttention: Array<{
    id: number;
    title: string;
    status: string;
    next_review_date: Date | string | null;
    daysOverdue: number;
    reason: string;
  }>;
  topTags: Array<{
    tag: string;
    count: number;
  }>;
  recentPolicies: Array<{
    id: number;
    title: string;
    status: string;
    last_updated_at: Date | string;
  }>;
  tagCoverage: {
    coveredTags: number;
    totalPossibleTags: number;
    percentage: number;
  };
}

const getPolicyExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<PolicyExecutiveSummary> => {
  try {
    const policies = (await getAllPoliciesQuery(organizationId)) as PolicyWithReviewers[];
    const totalPolicies = policies.length;
    const now = new Date();

    // Count by status
    const draftPolicies = policies.filter((p) => p.status === "Draft").length;
    const underReviewPolicies = policies.filter((p) => p.status === "Under Review").length;
    const approvedPolicies = policies.filter((p) => p.status === "Approved").length;
    const publishedPolicies = policies.filter((p) => p.status === "Published").length;
    const archivedPolicies = policies.filter((p) => p.status === "Archived").length;
    const deprecatedPolicies = policies.filter((p) => p.status === "Deprecated").length;

    // Review analysis
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    let overdueReviews = 0;
    let reviewsDueThisWeek = 0;
    let reviewsDueThisMonth = 0;

    policies.forEach((policy) => {
      if (policy.next_review_date) {
        const reviewDate = new Date(policy.next_review_date);
        if (reviewDate < now) {
          overdueReviews++;
        } else if (reviewDate <= oneWeekFromNow) {
          reviewsDueThisWeek++;
        } else if (reviewDate <= oneMonthFromNow) {
          reviewsDueThisMonth++;
        }
      }
    });

    // Policies needing attention
    const policiesNeedingAttention = policies
      .filter((p) => {
        const isOverdue =
          p.next_review_date && new Date(p.next_review_date) < now;
        const isStale =
          p.status === "Draft" &&
          p.last_updated_at &&
          (now.getTime() - new Date(p.last_updated_at).getTime()) / (1000 * 60 * 60 * 24) > 30;
        return isOverdue || isStale;
      })
      .map((p) => {
        let daysOverdue = 0;
        let reason = "";
        if (p.next_review_date && new Date(p.next_review_date) < now) {
          daysOverdue = Math.floor(
            (now.getTime() - new Date(p.next_review_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          reason = "Overdue for review";
        } else {
          reason = "Draft policy inactive for 30+ days";
        }
        return {
          id: p.id,
          title: p.title,
          status: p.status,
          next_review_date: p.next_review_date,
          daysOverdue,
          reason,
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 5);

    // Top tags
    const tagMap = new Map<string, number>();
    policies.forEach((policy) => {
      if (policy.tags && Array.isArray(policy.tags)) {
        policy.tags.forEach((tag: string) => {
          tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
        });
      }
    });

    const topTags = Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recent policies
    const recentPolicies = policies
      .sort((a, b) => {
        const dateA = a.last_updated_at ? new Date(a.last_updated_at).getTime() : 0;
        const dateB = b.last_updated_at ? new Date(b.last_updated_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        last_updated_at: p.last_updated_at,
      }));

    // Tag coverage
    const uniqueTags = new Set<string>();
    policies.forEach((policy) => {
      if (policy.tags && Array.isArray(policy.tags)) {
        policy.tags.forEach((tag: string) => uniqueTags.add(tag));
      }
    });

    const tagCoverage = {
      coveredTags: uniqueTags.size,
      totalPossibleTags: POLICY_TAGS.length,
      percentage:
        POLICY_TAGS.length > 0
          ? Math.round((uniqueTags.size / POLICY_TAGS.length) * 100)
          : 0,
    };

    return {
      totalPolicies,
      draftPolicies,
      underReviewPolicies,
      approvedPolicies,
      publishedPolicies,
      archivedPolicies,
      deprecatedPolicies,
      overdueReviews,
      reviewsDueThisWeek,
      reviewsDueThisMonth,
      policiesNeedingAttention,
      topTags,
      recentPolicies,
      tagCoverage,
    };
  } catch (error) {
    logger.error("Error getting policy executive summary:", error);
    throw new Error(
      `Failed to get policy executive summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

export interface SearchPolicyTemplatesParams {
  category?: string;
  tag?: string;
  search?: string;
  limit?: number;
}

interface PolicyTemplateResult {
  id: number;
  title: string;
  description: string;
  tags: string[];
  category: string;
}

const searchPolicyTemplates = async (
  params: SearchPolicyTemplatesParams,
  _organizationId: number
): Promise<PolicyTemplateResult[]> => {
  try {
    let templates = [...policyTemplates];

    // Apply filters
    if (params.category) {
      templates = templates.filter(
        (t) => t.category.toLowerCase() === params.category!.toLowerCase()
      );
    }
    if (params.tag) {
      templates = templates.filter((t) =>
        t.tags.some((tag) => tag.toLowerCase().includes(params.tag!.toLowerCase()))
      );
    }
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.title.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower)
      );
    }

    // Limit results
    const limit = params.limit || 10;
    templates = templates.slice(0, limit);

    // Return without content (too large for LLM context)
    return templates.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      tags: t.tags,
      category: t.category,
    }));
  } catch (error) {
    logger.error("Error searching policy templates:", error);
    throw new Error(
      `Failed to search policy templates: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

export interface GetTemplateRecommendationsParams {
  focus_area?: string;
}

interface TemplateRecommendation {
  id: number;
  title: string;
  description: string;
  category: string;
  tags: string[];
  relevanceReason: string;
}

const getTemplateRecommendations = async (
  params: GetTemplateRecommendationsParams,
  organizationId: number
): Promise<TemplateRecommendation[]> => {
  try {
    const policies = (await getAllPoliciesQuery(organizationId)) as PolicyWithReviewers[];

    // Get all tags currently covered by existing policies
    const existingTags = new Set<string>();
    policies.forEach((policy) => {
      if (policy.tags && Array.isArray(policy.tags)) {
        policy.tags.forEach((tag: string) => existingTags.add(tag));
      }
    });

    // Score templates based on gap coverage
    const scoredTemplates = policyTemplates.map((template) => {
      let score = 0;
      let reasons: string[] = [];

      // Check for tags not covered by existing policies
      const uncoveredTags = template.tags.filter((tag) => !existingTags.has(tag));
      if (uncoveredTags.length > 0) {
        score += uncoveredTags.length * 2;
        reasons.push(`Covers gaps: ${uncoveredTags.join(", ")}`);
      }

      // Boost if matches focus area
      if (params.focus_area) {
        if (template.tags.some((tag) => tag.toLowerCase() === params.focus_area!.toLowerCase())) {
          score += 5;
          reasons.push(`Matches focus area: ${params.focus_area}`);
        }
      }

      // Check if similar policy already exists (by title)
      const similarExists = policies.some(
        (p) =>
          p.title.toLowerCase().includes(template.title.toLowerCase()) ||
          template.title.toLowerCase().includes(p.title.toLowerCase())
      );
      if (similarExists) {
        score -= 10;
        reasons = ["Similar policy may already exist"];
      }

      return {
        ...template,
        score,
        relevanceReason: reasons.length > 0 ? reasons.join("; ") : "General recommendation",
      };
    });

    // Filter and sort by score
    return scoredTemplates
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        tags: t.tags,
        relevanceReason: t.relevanceReason,
      }));
  } catch (error) {
    logger.error("Error getting template recommendations:", error);
    throw new Error(
      `Failed to get template recommendations: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availablePolicyTools: Record<string, Function> = {
  fetch_policies: fetchPolicies,
  get_policy_analytics: getPolicyAnalytics,
  get_policy_executive_summary: getPolicyExecutiveSummary,
  search_policy_templates: searchPolicyTemplates,
  get_template_recommendations: getTemplateRecommendations,
};

export { availablePolicyTools };
