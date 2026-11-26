import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useProjects } from "../../../../application/hooks/useProjects";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { getComplianceProgress } from "../../../../application/repository/control_eu_act.repository";
import { getAssessmentProgress } from "../../../../application/repository/assesment.repository";
import {
  EU_AI_ACT_ORGANIZATION_SLUG,
  FRAMEWORK_IDS,
} from "../../../../application/constants/frameworks";
import { fill } from "../../../../i18n/fill";
import { VWLink } from "../../../components/Link";
import { text } from "../../../themes/palette";
import { fontSize } from "../../../themes/typography";

const PROGRESS_TEMPLATE =
  "Organization-wide obligations (prohibited practices, AI literacy, quality management system): {done}/{total} requirements done, {answered}/{questions} questions answered";

const FALLBACK_TEXT =
  "Organization-wide obligations (prohibited practices, AI literacy, quality management system) are tracked once for the organization on the Frameworks page by your Admins.";

const lineSx = { fontSize: fontSize.base, color: text.secondary, lineHeight: 1.5 };

/**
 * One line above a use case's EU AI Act trackers saying where the
 * organization-wide obligations went. Users who can see the organizational
 * project get its progress and a link; everyone else gets a plain pointer.
 * Hidden while loading and on errors, so it never blocks the tab.
 */
const OrganizationObligationsStatus = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: projects, isLoading: projectsLoading, isError: projectsError } = useProjects();

  const projectFrameworkId = useMemo(() => {
    // The server uses the non-demo organizational project when there is one;
    // a demo one is a fallback. The sort is stable, so list order holds.
    const ordered = [...(projects ?? [])].sort(
      (a, b) => Number(Boolean(a.is_demo)) - Number(Boolean(b.is_demo)),
    );
    for (const project of ordered) {
      if (!project.is_organizational) continue;
      const link = (project.framework ?? []).find(
        (fw) => fw.framework_id === FRAMEWORK_IDS.EU_AI_ACT_ORGANIZATION,
      );
      if (link) return link.project_framework_id;
    }
    return null;
  }, [projects]);

  const progress = useQuery({
    queryKey: ["euAiActOrganizationProgress", projectFrameworkId],
    queryFn: async ({ signal }) => {
      const [compliance, assessment] = await Promise.all([
        getComplianceProgress({ projectFrameworkId: projectFrameworkId!, signal }),
        getAssessmentProgress({ projectFrameworkId: projectFrameworkId!, signal }),
      ]);
      return {
        done: Number(compliance?.data?.allDonesubControls ?? 0),
        total: Number(compliance?.data?.allsubControls ?? 0),
        answered: Number(assessment?.data?.answeredQuestions ?? 0),
        questions: Number(assessment?.data?.totalQuestions ?? 0),
      };
    },
    enabled: projectFrameworkId !== null,
    retry: false,
  });

  if (projectsLoading || projectsError || !projects) return null;

  if (projectFrameworkId === null) {
    return (
      <Box sx={{ mb: "16px" }} data-testid="eu-ai-act-organization-status">
        <Typography sx={lineSx}>{t(FALLBACK_TEXT)}</Typography>
      </Box>
    );
  }

  if (!progress.data) return null;

  return (
    <Box
      sx={{ mb: "16px", display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}
      data-testid="eu-ai-act-organization-status"
    >
      <Typography sx={lineSx}>{fill(t(PROGRESS_TEMPLATE), progress.data)}</Typography>
      <VWLink
        showIcon={false}
        onClick={() => navigate(`/framework?framework=${EU_AI_ACT_ORGANIZATION_SLUG}`)}
        testId="eu-ai-act-organization-open"
      >
        {/* "View", not "Open": the dictionary's "Open" is the status ("Offen"). */}
        View
      </VWLink>
    </Box>
  );
};

export default OrganizationObligationsStatus;
