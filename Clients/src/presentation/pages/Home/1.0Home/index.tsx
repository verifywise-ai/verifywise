import { useContext, useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import { FrameworkTypeEnum } from "../../../components/Forms/ProjectForm/constants";
import { ProjectForm } from "../../../components/Forms/ProjectForm";
import PageTour from "../../../components/PageTour";
import HomeSteps from "./HomeSteps";
import useMultipleOnScreen from "../../../../application/hooks/useMultipleOnScreen";
import { useDashboard } from "../../../../application/hooks/useDashboard";
import { Project } from "../../../../domain/types/Project";
import ProjectList from "../../../components/ProjectsList/ProjectsList";
import { CustomizableButton } from "../../../components/button/customizable-button";
import allowedRoles from "../../../../application/constants/permissions";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import AiOrNotScreening from "../../../components/Modals/AiOrNotScreening";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { brand } from "../../../themes/palette";

const Home = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    setDashboardValues,
    componentsVisible,
    changeComponentVisibility,
    refreshUsers,
    userRoleName,
  } = useContext(VerifyWiseContext);
  const [isProjectFormModalOpen, setIsProjectFormModalOpen] =
    useState<boolean>(false);
  const [isScreeningOpen, setIsScreeningOpen] = useState<boolean>(false);
  const [refreshProjectsFlag, setRefreshProjectsFlag] =
    useState<boolean>(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const { dashboard, fetchDashboard } = useDashboard();

  useEffect(() => {
    if (dashboard) {
      setProjects(dashboard.projects_list.filter((p) => !p.is_organizational));
    }
  }, [dashboard]);

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
    const fetchProgressData = async () => {
      await refreshUsers();

      await fetchDashboard();
    };

    fetchProgressData();
  }, [setDashboardValues, fetchDashboard, refreshProjectsFlag]);

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
        projects={projects}
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
