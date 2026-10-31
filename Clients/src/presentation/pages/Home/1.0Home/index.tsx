import { useContext, useEffect, useState, useRef, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import { FrameworkTypeEnum } from "../../../components/Forms/ProjectForm/constants";
import { ProjectForm } from "../../../components/Forms/ProjectForm";
import PageTour from "../../../components/PageTour";
import HomeSteps from "./HomeSteps";
import useMultipleOnScreen from "../../../../application/hooks/useMultipleOnScreen";
import { useDashboard } from "../../../../application/hooks/useDashboard";
import ProjectList from "../../../components/ProjectsList/ProjectsList";
import { CustomizableButton } from "../../../components/button/customizable-button";
import allowedRoles from "../../../../application/constants/permissions";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import AiOrNotScreening from "../../../components/Modals/AiOrNotScreening";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { brand } from "../../../themes/palette";
import { testIds } from "../../../test-ids";
import LifecycleTabs from "../../../components/LifecycleTabs";
import { useUseCaseLifecycleSummary } from "../../../../application/hooks/useUseCaseLifecycle";
import {
  LIFECYCLE_STAGES,
  LifecycleStage,
  LifecycleStageCounts,
} from "../../../../domain/enums/lifecycleStage.enum";

const STAGE_STORAGE_KEY = "use-cases-lifecycle-tab";

const STAGE_TOOLTIPS: Record<LifecycleStage, string> = {
  [LifecycleStage.IN_REVIEW]: "Use cases waiting for an approval decision",
  [LifecycleStage.PLANNED]: "Use cases that are not live yet",
  [LifecycleStage.LIVE]: "Use cases in use today",
  [LifecycleStage.RETIRED]: "Use cases that are no longer in use",
};

const STAGE_EMPTY: Record<LifecycleStage, string> = {
  [LifecycleStage.IN_REVIEW]: "No use cases are waiting for review.",
  [LifecycleStage.PLANNED]: "No planned use cases.",
  [LifecycleStage.LIVE]: "No live use cases. Open a planned use case and mark it as live.",
  [LifecycleStage.RETIRED]: "No retired use cases.",
};

const isStage = (value: string | null): value is LifecycleStage =>
  !!value && (LIFECYCLE_STAGES as readonly string[]).includes(value);

/** Stage from ?stage=, else the last tab used, else Planned. */
const initialStage = (param: string | null): LifecycleStage => {
  if (isStage(param)) return param;
  const stored = localStorage.getItem(STAGE_STORAGE_KEY);
  return isStage(stored) ? stored : LifecycleStage.PLANNED;
};

const Home = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { componentsVisible, changeComponentVisibility, refreshUsers, userRoleName } =
    useContext(VerifyWiseContext);
  const [isProjectFormModalOpen, setIsProjectFormModalOpen] = useState<boolean>(false);
  const [isScreeningOpen, setIsScreeningOpen] = useState<boolean>(false);
  const [refreshProjectsFlag, setRefreshProjectsFlag] = useState<boolean>(false);

  const { dashboard, isPending, fetchDashboard } = useDashboard();

  const projects = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.projects_list.filter((p) => !p.is_organizational);
  }, [dashboard]);

  // Lifecycle tabs (#5187). Counts come from the rows this page already shows,
  // so a tab count always equals the rows under it; stale markers come from
  // the server, which applies the org's "still live?" interval.
  const [searchParams, setSearchParams] = useSearchParams();
  const stage = initialStage(searchParams.get("stage"));
  const handleStageChange = (next: LifecycleStage) => {
    localStorage.setItem(STAGE_STORAGE_KEY, next);
    const params = new URLSearchParams(searchParams);
    params.set("stage", next);
    setSearchParams(params, { replace: true });
  };
  const { data: lifecycleSummary, refetch: refetchLifecycleSummary } = useUseCaseLifecycleSummary();
  const staleIds = useMemo(() => new Set(lifecycleSummary?.stale_ids ?? []), [lifecycleSummary]);
  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])) as LifecycleStageCounts;
    for (const project of projects) {
      counts[project.lifecycle_stage ?? LifecycleStage.PLANNED] += 1;
    }
    return counts;
  }, [projects]);
  const stageProjects = useMemo(
    () => projects.filter((p) => (p.lifecycle_stage ?? LifecycleStage.PLANNED) === stage),
    [projects, stage],
  );
  // #5188 extends the In review tab with pending intake submissions: pass
  // their count as extraCounts={{ in_review: n }} and render them alongside
  // stageProjects when stage === LifecycleStage.IN_REVIEW.

  const [runHomeTour, setRunHomeTour] = useState(false);
  const newProjectButtonRef = useRef<HTMLDivElement>(null);
  const { allVisible } = useMultipleOnScreen<HTMLElement>({
    countToTrigger: 1,
  });
  useEffect(() => {
    if (allVisible) {
      changeComponentVisibility("home", true);
    }
  }, [allVisible]);

  useEffect(() => {
    if (componentsVisible.home && componentsVisible.sidebar) {
      setRunHomeTour(true);
    }
  }, [componentsVisible]);

  useEffect(() => {
    void refreshUsers();
    void fetchDashboard();
    void refetchLifecycleSummary();
  }, [fetchDashboard, refreshProjectsFlag, refreshUsers, refetchLifecycleSummary]);

  const submitFormRef = useRef<(() => void) | undefined>(undefined);

  // Auto-open create modal when navigating from "Add new..." dropdown
  useEffect(() => {
    if (location.state?.openCreateModal) {
      setIsScreeningOpen(true);

      // Clear the navigation state to prevent re-opening on subsequent navigations
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  const handleProjectFormModalClose = () => {
    setIsProjectFormModalOpen(false);
    setRefreshProjectsFlag((prev) => !prev);
  };

  return (
    <PageHeaderExtended
      title="Use cases"
      description="Use case is a real-world scenario describing how an AI system is applied within an organization to achieve a defined purpose or outcome."
      helpArticlePath="ai-governance/use-cases"
      tipBoxEntity="overview"
    >
      {/* Projects List */}
      <ProjectList
        projects={stageProjects}
        isLoading={isPending}
        staleIds={staleIds}
        emptyMessage={projects.length > 0 ? STAGE_EMPTY[stage] : undefined}
        header={
          <LifecycleTabs
            value={stage}
            onChange={handleStageChange}
            counts={stageCounts}
            isLoading={isPending}
            tooltips={STAGE_TOOLTIPS}
            dataJoyrideId="use-case-lifecycle-tabs"
          />
        }
        onProjectDeleted={() => setRefreshProjectsFlag((prev) => !prev)}
        newProjectButton={
          <div data-joyride-id="new-project-button" ref={newProjectButtonRef}>
            <CustomizableButton
              variant="contained"
              text="New use case"
              sx={{
                backgroundColor: `${brand.primary}`,
                border: `1px solid ${brand.primary}`,
                gap: 2,
              }}
              icon={<AddCircleOutlineIcon size={16} />}
              testId={testIds.overview.newUseCaseButton}
              onClick={() => setIsScreeningOpen(true)}
              isDisabled={!allowedRoles.projects.create.includes(userRoleName)}
            />
          </div>
        }
      />
      <StandardModal
        isOpen={isProjectFormModalOpen}
        onClose={async () => {
          setIsProjectFormModalOpen(false);
          setRefreshProjectsFlag((prev) => !prev);
        }}
        title="Create new use case"
        description="Create a new use case by filling in the following details"
        onSubmit={() => {
          if (submitFormRef.current) {
            submitFormRef.current();
          }
        }}
        submitButtonText="Create use case"
        maxWidth="900px"
      >
        <ProjectForm
          defaultFrameworkType={FrameworkTypeEnum.ProjectBased}
          useStandardModal={true}
          onSubmitRef={submitFormRef}
          onClose={handleProjectFormModalClose}
        />
      </StandardModal>
      <AiOrNotScreening
        isOpen={isScreeningOpen}
        onClose={() => setIsScreeningOpen(false)}
        onSkip={() => {
          setIsScreeningOpen(false);
          setIsProjectFormModalOpen(true);
        }}
        onComplete={() => {
          setIsProjectFormModalOpen(true);
        }}
      />
      <PageTour
        steps={HomeSteps}
        run={runHomeTour}
        onFinish={() => {
          setRunHomeTour(false);
        }}
        tourKey="home-tour"
      />
    </PageHeaderExtended>
  );
};

export default Home;
