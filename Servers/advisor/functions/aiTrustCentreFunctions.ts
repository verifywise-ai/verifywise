import {
  getAITrustCentreOverviewQuery,
  getAITrustCentreResourcesQuery,
  getAITrustCentreSubprocessorsQuery,
  getIsVisibleQuery,
} from "../../utils/aiTrustCentre.utils";
import logger from "../../utils/logger/fileLogger";

const fetchTrustCenterOverview = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const [overview, resources, subprocessors, isVisible] = await Promise.all([
      getAITrustCentreOverviewQuery(organizationId),
      getAITrustCentreResourcesQuery(organizationId),
      getAITrustCentreSubprocessorsQuery(organizationId),
      getIsVisibleQuery(organizationId),
    ]);

    return {
      isPubliclyVisible: isVisible,
      overview: overview || {},
      resourceCount: Array.isArray(resources) ? resources.length : 0,
      resources: Array.isArray(resources)
        ? resources.map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            visible: r.visible,
            filename: r.filename,
          }))
        : [],
      subprocessorCount: Array.isArray(subprocessors)
        ? subprocessors.length
        : 0,
      subprocessors: Array.isArray(subprocessors)
        ? subprocessors.map((s: any) => ({
            id: s.id,
            name: s.name,
            purpose: s.purpose,
            location: s.location,
          }))
        : [],
    };
  } catch (error) {
    logger.error("Error fetching trust center overview:", error);
    throw new Error(
      `Failed to fetch trust center overview: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const getTrustCenterAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number
): Promise<any> => {
  try {
    const [overview, resources, subprocessors, isVisible] = await Promise.all([
      getAITrustCentreOverviewQuery(organizationId),
      getAITrustCentreResourcesQuery(organizationId),
      getAITrustCentreSubprocessorsQuery(organizationId),
      getIsVisibleQuery(organizationId),
    ]);

    const resourceList = Array.isArray(resources) ? resources : [];
    const subprocessorList = Array.isArray(subprocessors) ? subprocessors : [];

    // Count visible resources
    const visibleResources = resourceList.filter(
      (r: any) => r.visible
    ).length;

    // Section visibility from overview
    const info = (overview as any)?.info || {};
    const sectionVisibility: Record<string, boolean> = {
      intro: !!info.intro_visible,
      compliance_badges: !!info.compliance_badges_visible,
      company_description: !!info.company_description_visible,
      terms_and_contact: !!info.terms_and_contact_visible,
      resources: !!info.resources_visible,
      subprocessors: !!info.subprocessor_visible,
    };

    const visibleSections = Object.values(sectionVisibility).filter(
      Boolean
    ).length;
    const totalSections = Object.keys(sectionVisibility).length;

    return {
      isPubliclyVisible: isVisible,
      totalResources: resourceList.length,
      visibleResources,
      totalSubprocessors: subprocessorList.length,
      sectionVisibility,
      completeness: `${visibleSections}/${totalSections} sections visible`,
    };
  } catch (error) {
    logger.error("Error getting trust center analytics:", error);
    throw new Error(
      `Failed to get trust center analytics: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availableAiTrustCentreTools: Record<string, Function> = {
  fetch_trust_center_overview: fetchTrustCenterOverview,
  get_trust_center_analytics: getTrustCenterAnalytics,
};

export { availableAiTrustCentreTools };
