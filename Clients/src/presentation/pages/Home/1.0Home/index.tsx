import { useContext, useEffect, useState, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
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
import { useQueryClient } from "@tanstack/react-query";
import {
  useCaseLifecycleKeys,
  useUseCaseLifecycleSummary,
  useUseCaseStageCounts,
} from "../../../../application/hooks/useUseCaseLifecycle";
import { LifecycleStage } from "../../../../domain/enums/lifecycleStage.enum";
import { useLifecycleTab } from "../../../../application/hooks/useLifecycleTab";
import PendingIntakeSubmissions from "../../../components/LifecycleTabs/PendingIntakeSubmissions";

const STAGE_STORAGE_KEY = "use-cases-lifecycle-tab";

const STAGE_TOOLTIPS: Record<LifecycleStage, string> = {
  [LifecycleStage.IN_REVIEW]: "Intake requests and use cases waiting for an approval decision",
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
  const [stage, handleStageChange] = useLifecycleTab(STAGE_STORAGE_KEY);
  const { data: lifecycleSummary } = useUseCaseLifecycleSummary();
  const staleIds = useMemo(() => new Set(lifecycleSummary?.stale_ids ?? []), [lifecycleSummary]);
  // Stage counts, with pending intake requests (#5188) added to In review:
  // the same helper the dashboard uses, so the two always show one number.
  // The requests are not projects yet, so they are listed apart from the
  // use cases, below the toolbar.
  const { counts: stageCounts, pending: pendingSubmissions } = useUseCaseStageCounts(projects);
  const stageProjects = useMemo(
    () => projects.filter((p) => (p.lifecycle_stage ?? LifecycleStage.PLANNED) === stage),
    [projects, stage],
  );
  const inReviewWithRequests =
    stage === LifecycleStage.IN_REVIEW && (pendingSubmissions?.total ?? 0) > 0;

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
  }, [fetchDashboard, refreshProjectsFlag, refreshUsers]);

  // A create or delete changes the stale markers too. Invalidating here (not
  // in the effect above) keeps the summary to one fetch on mount.
  const queryClient = useQueryClient();
  const refreshProjects = () => {
    setRefreshProjectsFlag((prev) => !prev);
    void queryClient.invalidateQueries({ queryKey: useCaseLifecycleKeys.all });
  };

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
    refreshProjects();
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
        // An org with no use cases at all keeps the onboarding empty state on
        // every tab; the intake requests still show above it in In review.
        emptyMessage={
          projects.length === 0
            ? undefined
            : inReviewWithRequests
              ? "No use cases are waiting for an approval decision."
              : STAGE_EMPTY[stage]
        }
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
        renderBeforeList={(searchTerm) =>
          stage === LifecycleStage.IN_REVIEW ? (
            <PendingIntakeSubmissions
              pending={pendingSubmissions}
              searchTerm={searchTerm}
              description="Submitted through an intake form. The use case is created when a reviewer approves the request."
              exportNote="Intake requests are not included in the use case export."
            />
          ) : null
        }
        onProjectDeleted={refreshProjects}
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
          refreshProjects();
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
