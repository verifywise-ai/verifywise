import { Divider, Stack, Typography } from "@mui/material";
import { columnStyle, rowStyle } from "./style";
import { GroupStatsCard } from "../../../../components/Cards/GroupStatsCard";
import { projectRiskSection } from "../style";
import { StatusTileCards, StatusTileItem } from "../../../../components/Cards/StatusTileCards";
import { InfoCard } from "../../../../components/Cards/InfoCard";
import { DescriptionCard } from "../../../../components/Cards/DescriptionCard";
import { TeamCard } from "../../../../components/Cards/TeamCard";
import { Project } from "../../../../../domain/types/Project";
import CustomizableSkeleton from "../../../../components/Skeletons";
import { displayFormattedDate } from "../../../../tools/isoDateToString";
import { pluralizeEntityType } from "../../../../tools/pluralizeEntityType";
import { useEffect, useMemo, useState } from "react";
import { User } from "../../../../../domain/types/User";
import { getEntityById } from "../../../../../application/repository/entity.repository";
import useProjectRisks from "../../../../../application/hooks/useProjectRisks";
import useUsers from "../../../../../application/hooks/useUsers";
import {
  User as UserIcon,
  Activity as ActivityIcon,
  UserCheck as UserCheckIcon,
  Target as TargetIcon,
  Users as UsersIcon,
  Clock as ClockIcon,
} from "lucide-react";
import { brand } from "../../../../themes/palette";

const VWProjectOverview = ({ project }: { project?: Project }) => {
  const [projectFrameworkId, setProjectFrameworkId] = useState<number | null>(null);
  const [projectFrameworkId2, setProjectFrameworkId2] = useState<number | null>(null);
  const { users } = useUsers();

  const projectId = project?.id;

  // Derive owner locally from the `project` prop + users list. Previously
  // this called useProjectData again, which triggered a duplicate
  // GET /projects/:id on every mount — parent VWProjectView already
  // fetched the project and passed it down as a prop.
  const projectOwner = useMemo<string | null>(() => {
    if (!project) return null;
    const ownerUser = users.find((u: User) => u.id === project.owner);
    return ownerUser ? `${ownerUser.name} ${ownerUser.surname}` : null;
  }, [project, users]);

  // Update framework IDs when project changes
  useEffect(() => {
    if (project?.framework) {
      // Only set framework ID 1 if the project has EU AI Act framework
      const framework1 = project.framework.find((p) => p.framework_id === 1);
      if (framework1?.project_framework_id && !isNaN(Number(framework1.project_framework_id))) {
        setProjectFrameworkId(Number(framework1.project_framework_id));
      } else {
        setProjectFrameworkId(null);
      }

      // Only set framework ID 2 if the project has ISO 42001 framework
      const framework2 = project.framework.find((p) => p.framework_id === 2);
      if (framework2?.project_framework_id && !isNaN(Number(framework2.project_framework_id))) {
        setProjectFrameworkId2(Number(framework2.project_framework_id));
      } else {
        setProjectFrameworkId2(null);
      }
    } else {
      setProjectFrameworkId(null);
      setProjectFrameworkId2(null);
    }
  }, [project]);

  const { projectRisksSummary } = useProjectRisks({
    projectId: projectId ?? 0,
  });

  const [complianceProgress, setComplianceProgress] = useState<{
    allDonesubControls: number;
    allsubControls: number;
  }>();
  const [assessmentProgress, setAssessmentProgress] = useState<{
    answeredQuestions: number;
    totalQuestions: number;
  }>();

  const [annexesProgress, setAnnexesProgress] = useState<{
    totalAnnexcategories: number;
    doneAnnexcategories: number;
  }>();
  const [clausesProgress, setClausesProgress] = useState<{
    totalSubclauses: number;
    doneSubclauses: number;
  }>();

  // Progress cards for the 9 project-attachable generic frameworks (HIPAA,
  // Texas AI Act, OECD AI Principles, Colorado AI Act, AI Ethics, PCI-DSS,
  // FTC AI Guidelines, NYC Local Law 144, ALTAI). Framework IDs 1-4 are
  // handled above (EU AI Act, ISO 42001) or are organizational-only and
  // never appear on a use case (ISO 27001, NIST AI RMF).
  type GenericFrameworkProgress = {
    framework_id: number;
    name: string;
    entity_label: string;
    done: number;
    total: number;
  };
  const [genericFrameworkProgress, setGenericFrameworkProgress] = useState<
    GenericFrameworkProgress[]
  >([]);

  // EU AI Act progress — only refires when the EU pfId resolves. Was
  // previously bundled with the generic + ISO fetches in one effect that
  // depended on [project, projectFrameworkId, projectFrameworkId2], which
  // fired everything twice because pfId is set by a separate effect after
  // the first render.
  useEffect(() => {
    if (!project) return;
    const hasEuAiActFramework = project.framework.some((f) => f.framework_id === 1);
    if (!hasEuAiActFramework || !projectFrameworkId || isNaN(projectFrameworkId)) {
      setComplianceProgress(undefined);
      setAssessmentProgress(undefined);
      return;
    }
    (async () => {
      try {
        const complianceData = await getEntityById({
          routeUrl: `/eu-ai-act/compliances/progress/${projectFrameworkId}`,
        });
        if (complianceData?.data) setComplianceProgress(complianceData.data);
        const assessmentData = await getEntityById({
          routeUrl: `/eu-ai-act/assessments/progress/${projectFrameworkId}`,
        });
        if (assessmentData?.data) setAssessmentProgress(assessmentData.data);
      } catch (error) {
        console.error("Error fetching EU AI Act data:", error);
        setComplianceProgress(undefined);
        setAssessmentProgress(undefined);
      }
    })();
  }, [project, projectFrameworkId]);

  // ISO 42001 progress — same rationale, isolated on projectFrameworkId2.
  useEffect(() => {
    if (!project) return;
    const hasIso42001Framework = project.framework.some((f) => f.framework_id === 2);
    if (!hasIso42001Framework || !projectFrameworkId2 || isNaN(projectFrameworkId2)) {
      setAnnexesProgress(undefined);
      setClausesProgress(undefined);
      return;
    }
    (async () => {
      try {
        const annexesData = await getEntityById({
          routeUrl: `/iso-42001/annexes/progress/${projectFrameworkId2}`,
        });
        if (annexesData?.data) setAnnexesProgress(annexesData.data);
        const clausesData = await getEntityById({
          routeUrl: `/iso-42001/clauses/progress/${projectFrameworkId2}`,
        });
        if (clausesData?.data) setClausesProgress(clausesData.data);
      } catch (error) {
        console.error("Error fetching ISO 42001 data:", error);
        setAnnexesProgress(undefined);
        setClausesProgress(undefined);
      }
    })();
  }, [project, projectFrameworkId2]);

  // Generic-framework dashboards (framework_id >= 5). Depends only on
  // `project` — pfId comes from the framework list itself, not state.
  useEffect(() => {
    if (!project) return;
    const genericFrameworks = project.framework.filter((f) => f.framework_id >= 5);
    if (genericFrameworks.length === 0) {
      setGenericFrameworkProgress([]);
      return;
    }
    (async () => {
      try {
        const results = await Promise.all(
          genericFrameworks.map(async (f) => {
            try {
              const response = await getEntityById({
                routeUrl: `/frameworks/${f.framework_id}/dashboard/${f.project_framework_id}`,
              });
              const data = response?.data;
              if (!data) return null;
              return {
                framework_id: f.framework_id,
                name: f.name,
                entity_label: pluralizeEntityType(data.entity_type),
                done: data.progress?.done ?? 0,
                total: data.progress?.total ?? 0,
              } satisfies GenericFrameworkProgress;
            } catch (error) {
              console.error(`Error fetching progress for framework ${f.framework_id}:`, error);
              return null;
            }
          }),
        );
        setGenericFrameworkProgress(
          results.filter((r): r is GenericFrameworkProgress => r !== null),
        );
      } catch (error) {
        console.error("Error fetching generic framework progress:", error);
      }
    })();
  }, [project]);

  if (!project) {
    return <div>No project selected</div>;
  }

  const user: User = users.find((u: User) => u.id === project.last_updated_by) ?? ({} as User);

  const projectMembers: string[] = users
    .filter((user: { id: any }) => project.members.includes(user.id || ""))
    .map((user: User) => `${user.name} ${user.surname}`);

  const completedEuActNumbers = [
    complianceProgress?.allDonesubControls ?? 0,
    assessmentProgress?.answeredQuestions ?? 0,
  ];

  const totalEuActNumbers = [
    complianceProgress?.allsubControls ?? 0,
    assessmentProgress?.totalQuestions ?? 0,
  ];

  const titleEuAct = ["Requirements", "Assessments"];

  const completedIso42001Numbers = [
    clausesProgress?.doneSubclauses ?? 0,
    annexesProgress?.doneAnnexcategories ?? 0,
  ];

  const totalIso42001Numbers = [
    clausesProgress?.totalSubclauses ?? 0,
    annexesProgress?.totalAnnexcategories ?? 0,
  ];

  const titleIso42001 = ["Clauses", "Annexes"];

  return (
    <Stack sx={{ width: "100%" }}>
      {/* Main Content */}
      <Stack className="vw-project-overview" sx={{ width: "100%" }}>
        <Stack className="vw-project-overview-row" sx={rowStyle}>
          {project ? (
            <>
              <InfoCard title="Owner" body={projectOwner || "N/A"} icon={<UserIcon size={16} />} />
              <InfoCard
                title="Use case status"
                body={project.status || "Not started"}
                icon={<ActivityIcon size={16} />}
              />
              <InfoCard
                title="Last updated"
                body={displayFormattedDate(project.last_updated.toString())}
                icon={<ClockIcon size={16} />}
              />
              {user.name !== undefined && user.surname !== undefined ? (
                <InfoCard
                  title="Last updated by"
                  body={`${user.name} ${user.surname}`}
                  icon={<UserCheckIcon size={16} />}
                />
              ) : (
                <InfoCard title="Last updated by" body="N/A" icon={<UserCheckIcon size={16} />} />
              )}
            </>
          ) : (
            <>
              <CustomizableSkeleton variant="text" width="30%" height={32} />
              <CustomizableSkeleton variant="text" width="30%" height={32} />
              <CustomizableSkeleton variant="text" width="30%" height={32} />
            </>
          )}
        </Stack>
        <Stack className="vw-project-overview-row" sx={rowStyle}>
          {project ? (
            <>
              <DescriptionCard
                title="Description"
                body={project.description || ""}
                icon={<TargetIcon size={16} />}
              />
              <TeamCard
                title="Team members"
                members={projectMembers}
                icon={<UsersIcon size={16} />}
              />
            </>
          ) : (
            <>
              <CustomizableSkeleton variant="rectangular" width="60%" height={100} />
              <CustomizableSkeleton variant="rectangular" width="60%" height={100} />
            </>
          )}
        </Stack>
        <Stack className="vw-project-overview-frameworks" sx={{ width: "100%", gap: 2, mb: 10 }}>
          {project ? (
            <>
              {projectFrameworkId && (
                <Stack sx={columnStyle}>
                  <Typography sx={projectRiskSection}>EU AI Act Completion Status</Typography>
                  <GroupStatsCard
                    completed={completedEuActNumbers}
                    total={totalEuActNumbers}
                    title={titleEuAct}
                    progressbarColor={brand.primary}
                  />
                </Stack>
              )}
              {projectFrameworkId2 && (
                <Stack sx={columnStyle}>
                  <Typography sx={projectRiskSection}>ISO 42001 Completion Status</Typography>
                  <GroupStatsCard
                    completed={completedIso42001Numbers}
                    total={totalIso42001Numbers}
                    title={titleIso42001}
                    progressbarColor={brand.primary}
                  />
                </Stack>
              )}
              {genericFrameworkProgress.map((fw) => (
                <Stack key={fw.framework_id} sx={columnStyle}>
                  <Typography sx={projectRiskSection}>{`${fw.name} Completion Status`}</Typography>
                  <GroupStatsCard
                    completed={[fw.done]}
                    total={[fw.total]}
                    title={[fw.entity_label]}
                    progressbarColor={brand.primary}
                  />
                </Stack>
              ))}
            </>
          ) : (
            <>
              <CustomizableSkeleton variant="rectangular" width="100%" height={100} />
              <CustomizableSkeleton variant="rectangular" width="100%" height={100} />
            </>
          )}
        </Stack>
        <Divider />
        <Stack sx={{ gap: 10 }}>
          {project ? (
            <>
              <Typography sx={projectRiskSection}>Use case risks</Typography>
              <StatusTileCards
                items={
                  [
                    {
                      key: "Total",
                      label: "Total",
                      count: projectRisksSummary.total,
                      color: "#4B5563",
                    },
                    {
                      key: "Very high",
                      label: "Very high",
                      count: projectRisksSummary.veryHighRisks,
                      color: "#C63622",
                    },
                    {
                      key: "High",
                      label: "High",
                      count: projectRisksSummary.highRisks,
                      color: "#D68B61",
                    },
                    {
                      key: "Medium",
                      label: "Medium",
                      count: projectRisksSummary.mediumRisks,
                      color: "#D6B971",
                    },
                    {
                      key: "Low",
                      label: "Low",
                      count: projectRisksSummary.lowRisks,
                      color: "#52AB43",
                    },
                    {
                      key: "Very low",
                      label: "Very low",
                      count: projectRisksSummary.veryLowRisks,
                      color: "#B8D39C",
                    },
                  ] satisfies StatusTileItem[]
                }
                entityName="risk"
                size="small"
              />
            </>
          ) : (
            <>
              <CustomizableSkeleton variant="text" width="20%" height={32} />
              <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
            </>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
};

export default VWProjectOverview;
