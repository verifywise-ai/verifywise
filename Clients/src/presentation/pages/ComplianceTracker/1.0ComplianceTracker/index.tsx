import { useContext, useEffect, useState, useCallback } from "react";
import { Stack, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { pageHeadingStyle } from "../../Assessment/1.0AssessmentTracker/index.style";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { StatsCard } from "../../../components/Cards/StatsCard";
import CustomizableSkeleton from "../../../components/Skeletons";
import { ControlCategory as ControlCategoryModel } from "../../../../domain/types/ControlCategory";
import ControlCategoryTile from "./ControlCategory";
import PageTour from "../../../components/PageTour";
import ComplianceSteps from "./ComplianceSteps";
import useMultipleOnScreen from "../../../../application/hooks/useMultipleOnScreen";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import { ComplianceData } from "../../../../domain/interfaces/i.compliance";
import { Project } from "../../../../domain/types/Project";
import {
  getComplianceProgress,
  getControlsByControlCategoryId,
} from "../../../../application/repository/control_eu_act.repository";
import { brand } from "../../../themes/palette";

const ComplianceTracker = ({
  project,
  statusFilter,
  ownerFilter,
  approverFilter,
  dueDateFilter,
}: {
  project: Project;
  statusFilter?: string;
  ownerFilter?: string;
  approverFilter?: string;
  dueDateFilter?: string;
}) => {
  const [searchParams] = useSearchParams();
  const controlId = searchParams.get("controlId");

  const currentProjectId = project?.id;
  const currentProjectFramework = project.framework?.filter((p) => p.framework_id === 1)[0]
    ?.project_framework_id;
  const [complianceData, setComplianceData] = useState<ComplianceData>();
  const [controlCategories, setControlCategories] = useState<ControlCategoryModel[]>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { componentsVisible, changeComponentVisibility } = useContext(VerifyWiseContext);
  const [runComplianceTour, setRunComplianceTour] = useState(false);
  const [initialControlCategoryId, setInitialControlCategoryId] = useState<number | null>(null);

  // Find which control category contains the target controlId
  const findControlCategoryId = useCallback(async () => {
    if (!controlId || !currentProjectFramework || !controlCategories) {
      return;
    }

    for (const category of controlCategories) {
      if (!category.id) continue;
      try {
        const controls = await getControlsByControlCategoryId({
          controlCategoryId: category.id,
          projectFrameworkId: currentProjectFramework,
        });
        // API returns 'control_id' as the actual control ID from controls_eu table
        const found = controls?.find((c: any) => c.control_id === Number(controlId));
        if (found) {
          setInitialControlCategoryId(category.id);
          return;
        }
      } catch (err) {
        console.error("Error finding control category:", err);
      }
    }
  }, [controlId, currentProjectFramework, controlCategories]);

  // Find the control's category when controlId is present and categories are loaded
  useEffect(() => {
    if (controlId && controlCategories && controlCategories.length > 0) {
      findControlCategoryId();
    }
  }, [controlId, controlCategories, findControlCategoryId]);

  const { refs, allVisible } = useMultipleOnScreen<HTMLDivElement>({
    countToTrigger: 2,
  });

  useEffect(() => {
    if (allVisible) {
      changeComponentVisibility("compliance", true);
    }
  }, [allVisible]);

  useEffect(() => {
    if (componentsVisible.compliance && componentsVisible.projectFrameworks) {
      setRunComplianceTour(true);
    }
  }, [componentsVisible]);

  // Reset state when project changes
  useEffect(() => {
    setComplianceData(undefined);
    setControlCategories(undefined);
    setError(null);
    setLoading(true);
  }, [currentProjectId]);

  const fetchComplianceData = async () => {
    if (!currentProjectId || !currentProjectFramework) return;

    try {
      const response = await getComplianceProgress({
        projectFrameworkId: currentProjectFramework,
      });
      setComplianceData(response.data);
    } catch (err) {
      console.error("ComplianceTracker: Error fetching compliance data:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchControlCategories = async () => {
    // Only fetch if project has EU AI Act framework assigned
    if (!currentProjectId || !currentProjectFramework) return;

    try {
      const response = await getEntityById({
        routeUrl: `/eu-ai-act/controlCategories?projectFrameworkId=${currentProjectFramework}`,
      });
      setControlCategories(response);
    } catch (err) {
      console.error("ComplianceTracker: Error fetching control categories:", err);
      setError(err);
    }
  };

  useEffect(() => {
    if (currentProjectId && currentProjectFramework) {
      fetchComplianceData();
      fetchControlCategories();
    } else if (currentProjectId) {
      // No EU AI Act framework - just stop loading
      setLoading(false);
    }
    // Also re-fetch when the project's role or risk classification changes,
    // because the server filters categories by those fields. Without this
    // dependency, editing the use-case settings wouldn't refresh the
    // visible list until the user navigates away and back.
  }, [
    currentProjectId,
    currentProjectFramework,
    project?.type_of_high_risk_role,
    project?.ai_risk_classification,
  ]);

  if (loading) {
    return (
      <Stack className="compliance-tracker" sx={{ gap: "16px" }}>
        <Typography sx={pageHeadingStyle}>Requirements tracker</Typography>
        <CustomizableSkeleton
          variant="rectangular"
          minWidth={300}
          width="100%"
          maxHeight={"1400px"}
          minHeight={82}
        />
      </Stack>
    );
  }

  if (error) {
    return <Typography>Error loading compliance data</Typography>;
  }

  if (!currentProjectId) {
    return (
      <Stack className="compliance-tracker" sx={{ gap: "16px" }}>
        <Typography sx={pageHeadingStyle}>Requirements tracker</Typography>
        <Typography>Please select a project to view compliance data</Typography>
      </Stack>
    );
  }

  return (
    <Stack className="compliance-tracker" sx={{ gap: "16px" }}>
      <PageTour
        run={runComplianceTour}
        steps={ComplianceSteps}
        onFinish={() => {
          localStorage.setItem("compliance-tour", "true");
          setRunComplianceTour(false);
        }}
        tourKey="compliance-tour"
      />
      {complianceData && (
        <Stack ref={refs[1]} data-joyride-id="compliance-progress-bar">
          <StatsCard
            completed={complianceData.allDonesubControls}
            total={complianceData.allsubControls}
            title="Controls"
            progressbarColor={brand.primary}
          />
        </Stack>
      )}
      <Typography sx={pageHeadingStyle}>Compliance status overview</Typography>
      {controlCategories &&
        controlCategories
          .sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0))
          .map((controlCategory: ControlCategoryModel, index) =>
            index === 0 ? (
              <div ref={refs[2]} data-joyride-id="control-groups" key={controlCategory.id}>
                <ControlCategoryTile
                  controlCategory={controlCategory}
                  onComplianceUpdate={fetchComplianceData}
                  projectId={currentProjectId}
                  projectFrameworkId={currentProjectFramework}
                  statusFilter={statusFilter}
                  ownerFilter={ownerFilter}
                  approverFilter={approverFilter}
                  dueDateFilter={dueDateFilter}
                  initialControlCategoryId={initialControlCategoryId}
                />
              </div>
            ) : (
              <ControlCategoryTile
                key={controlCategory.id}
                controlCategory={controlCategory}
                onComplianceUpdate={fetchComplianceData}
                projectId={currentProjectId}
                projectFrameworkId={currentProjectFramework}
                statusFilter={statusFilter}
                ownerFilter={ownerFilter}
                approverFilter={approverFilter}
                dueDateFilter={dueDateFilter}
                initialControlCategoryId={initialControlCategoryId}
              />
            ),
          )}
    </Stack>
  );
};

export default ComplianceTracker;
