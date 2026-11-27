import { useState, useEffect, useMemo, useCallback } from "react";
import { useDispatch } from "react-redux";
import { Box, Alert } from "@mui/material";
import CustomizableSkeleton from "../../../components/Skeletons";
import GenericFramework from "../../../pages/Framework/Generic";
import { Project } from "../../../../domain/types/Project";
import { Framework } from "../../../../domain/types/Framework";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import AddFrameworkModal from "../AddNewFramework";
import useMultipleOnScreen from "../../../../application/hooks/useMultipleOnScreen";
import { setComponentVisibility } from "../../../../application/redux/ui/uiSlice";
import { ButtonToggle } from "../../../components/button-toggle";

import { containerStyle, headerContainerStyle } from "./styles";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { useCanCheck } from "../../../../application/hooks/useCan";
import { useSearchParams } from "react-router";
import { text, palette as vwPalette } from "../../../themes/palette";
import OrganizationObligationsStatus from "./OrganizationObligationsStatus";
import EuAiActTrackers, { EuAiActTrackerTab } from "../EuAiActTrackers";

export const FRAMEWORK_IDS = {
  EU_AI_ACT: 1,
} as const;

type TrackerTab = EuAiActTrackerTab;

/** Toggle values for imported frameworks; bundled ones keep their index ("0", "1", ...). */
const IMPORTED_TOGGLE_PREFIX = "imp-";

/**
 * Frameworks the readiness engine can score, keyed by framework name.
 * The backend silently falls back to EU AI Act controls for unknown types, so the
 * readiness tab is only offered for names listed here.
 */
const READINESS_FRAMEWORK_TYPES: Record<string, string> = {
  "EU AI Act": "eu_ai_act",
  "ISO 42001": "iso_42001",
};

const ProjectFrameworks = ({
  project,
  triggerRefresh,
  initialFrameworkId,
}: {
  project: Project;
  triggerRefresh?: (isTrigger: boolean, toastMessage?: string) => void;
  /** undefined when the project has no framework to preselect. */
  initialFrameworkId?: number;
}) => {
  // Stable reference — avoids re-triggering useFrameworks memo + downstream
  // re-renders on every parent render.
  const projectFrameworkList = useMemo(() => project.framework ?? [], [project.framework]);
  const { filteredFrameworks, loading, error, refreshFilteredFrameworks, allFrameworks } =
    useFrameworks({
      listOfFrameworks: projectFrameworkList,
    });
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<number | undefined>(
    initialFrameworkId,
  );
  const [selectedFramework, setSelectedFramework] = useState<number>(0);
  // projects_imported_frameworks id of the imported framework on screen, or
  // null while a bundled framework is selected.
  const [selectedImportedLinkId, setSelectedImportedLinkId] = useState<number | null>(null);
  const [tracker, setTracker] = useState<TrackerTab>("compliance");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const dispatch = useDispatch();
  const can = useCanCheck();

  const { refs, allVisible } = useMultipleOnScreen<HTMLElement>({
    countToTrigger: 1,
  });

  const isManagingFrameworksDisabled = !can("framework.edit");

  // Filter out organizational frameworks
  const nonOrganizationalFrameworks = useMemo(() => {
    return allFrameworks.filter((framework: Framework) => !framework.is_organizational);
  }, [allFrameworks]);

  useEffect(() => {
    dispatch(setComponentVisibility({ component: "projectFrameworks", value: allVisible }));
    dispatch(
      setComponentVisibility({
        component: "compliance",
        value: tracker === "compliance" && allVisible,
      }),
    );
  }, [allVisible, tracker, dispatch]);

  // ?addFramework=1 (the "Add EU AI Act" button on the FRIA and CE marking
  // note) opens the add framework dialog once, for roles that may use it.
  useEffect(() => {
    if (searchParams.get("addFramework") !== "1") return;
    if (!isManagingFrameworksDisabled) setIsModalOpen(true);
    searchParams.delete("addFramework");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, isManagingFrameworksDisabled]);

  const associatedFrameworkIds = project.framework?.map((f) => f.framework_id) || [];

  // Organization-imported frameworks attached to this use case (#5254).
  const importedLinks = useMemo(
    () => project.imported_frameworks ?? [],
    [project.imported_frameworks],
  );
  const activeImportedLink = importedLinks.find(
    (link) => link.project_imported_framework_id === selectedImportedLinkId,
  );

  const projectFrameworks = useMemo(
    () =>
      filteredFrameworks.filter((fw: Framework) => associatedFrameworkIds.includes(Number(fw.id))),
    [filteredFrameworks, associatedFrameworkIds],
  );

  useEffect(() => {
    if (!loading && projectFrameworks.length > 0 && !hasInitialized) {
      const validIds = projectFrameworks.map((fw: Framework) => Number(fw.id));
      const subtabParam = searchParams.get("subtab");

      // If initialFrameworkId is provided and valid, use it
      if (initialFrameworkId && validIds.includes(initialFrameworkId)) {
        setSelectedFrameworkId(initialFrameworkId);
        const index = projectFrameworks.findIndex(
          (fw: Framework) => Number(fw.id) === initialFrameworkId,
        );
        setSelectedFramework(index >= 0 ? index : 0);
        // Check for subtab parameter first, then controlId, default to assessment
        if (
          subtabParam === "compliance" ||
          subtabParam === "assessment" ||
          subtabParam === "readiness"
        ) {
          setTracker(subtabParam as TrackerTab);
        } else {
          setTracker(searchParams.get("controlId") ? "compliance" : "assessment");
        }
      }
      // Otherwise, use the default logic
      else if (!selectedFrameworkId || !validIds.includes(selectedFrameworkId)) {
        const initialFramework = projectFrameworks[0];
        setSelectedFrameworkId(Number(initialFramework.id));
        setSelectedFramework(0);
        setTracker("compliance");
      }

      setHasInitialized(true);
    }
  }, [
    loading,
    projectFrameworks,
    selectedFrameworkId,
    initialFrameworkId,
    hasInitialized,
    searchParams,
  ]);

  const handleFrameworkSelect = (index: number) => {
    searchParams.delete("framework");
    searchParams.delete("topicId");
    searchParams.delete("questionId");
    setSearchParams(searchParams);
    setSelectedImportedLinkId(null);
    setSelectedFramework(index);
    setSelectedFrameworkId(Number(projectFrameworks[index]?.id));
    setTracker("compliance");
  };

  const handleToggleChange = (value: string) => {
    if (value.startsWith(IMPORTED_TOGGLE_PREFIX)) {
      searchParams.delete("framework");
      searchParams.delete("topicId");
      searchParams.delete("questionId");
      setSearchParams(searchParams);
      setSelectedImportedLinkId(Number(value.slice(IMPORTED_TOGGLE_PREFIX.length)));
      return;
    }
    handleFrameworkSelect(parseInt(value));
  };

  // Keep the imported selection valid: show the first imported framework when
  // the use case has no bundled one, and drop a selection whose link is gone.
  useEffect(() => {
    if (loading) return;
    if (selectedImportedLinkId !== null && !activeImportedLink) {
      setSelectedImportedLinkId(
        projectFrameworks.length === 0 && importedLinks.length > 0
          ? importedLinks[0].project_imported_framework_id
          : null,
      );
    } else if (
      selectedImportedLinkId === null &&
      projectFrameworks.length === 0 &&
      importedLinks.length > 0
    ) {
      setSelectedImportedLinkId(importedLinks[0].project_imported_framework_id);
    }
  }, [
    loading,
    selectedImportedLinkId,
    activeImportedLink,
    projectFrameworks.length,
    importedLinks,
  ]);

  const isEUAIAct = Number(selectedFrameworkId) === FRAMEWORK_IDS.EU_AI_ACT;

  const readinessFrameworkType = useMemo(() => {
    const selected = projectFrameworks.find(
      (fw: Framework) => Number(fw.id) === Number(selectedFrameworkId),
    );
    return selected ? READINESS_FRAMEWORK_TYPES[selected.name] : undefined;
  }, [projectFrameworks, selectedFrameworkId]);

  // Only EU AI Act has an assessment tracker, and only some frameworks are scored
  // by the readiness engine — offering those tabs elsewhere renders a blank panel.
  const isTabAvailable = useCallback(
    (tab: TrackerTab) => {
      if (tab === "assessment") return isEUAIAct;
      if (tab === "readiness") return Boolean(readinessFrameworkType);
      return true;
    },
    [isEUAIAct, readinessFrameworkType],
  );

  // Selecting a framework that doesn't offer the active tab (or landing on it via
  // ?subtab=) removes it — fall back to Requirements so the panel is never blank.
  useEffect(() => {
    if (!isTabAvailable(tracker)) {
      setTracker("compliance");
    }
  }, [tracker, isTabAvailable]);

  // Render built-in framework content
  const renderBuiltInContent = useCallback(() => {
    // Show empty state if no frameworks installed
    if (projectFrameworks.length === 0 && !loading) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 8,
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              backgroundColor: "background.hover",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke={text.disabled}
              strokeWidth="2"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </Box>
          <Box sx={{ fontSize: 18, fontWeight: 600, color: vwPalette.text.secondary, mb: 1 }}>
            No frameworks installed
          </Box>
          <Box sx={{ fontSize: 14, color: "status.default.text", maxWidth: 400, mb: 3 }}>
            This use case doesn't have any compliance frameworks yet. Add a framework to start
            tracking controls and assessments.
          </Box>
          <CustomizableButton
            variant="contained"
            onClick={() => setIsModalOpen(true)}
            isDisabled={isManagingFrameworksDisabled}
            text="Add Framework"
          />
        </Box>
      );
    }

    // The init effect below picks one from projectFrameworks; until it has,
    // nothing is selected and neither branch can be dispatched honestly.
    if (selectedFrameworkId === undefined) return null;

    if (!isEUAIAct) {
      console.debug("[fw] ProjectFrameworks dispatch → GenericFramework", {
        projectId: project.id,
        frameworkId: selectedFrameworkId,
      });
      return <GenericFramework projectId={Number(project.id)} frameworkId={selectedFrameworkId} />;
    }
    console.debug("[fw] ProjectFrameworks dispatch → ComplianceTracker (EU AI Act)", {
      projectId: project.id,
    });

    return (
      <>
        <OrganizationObligationsStatus />
        <EuAiActTrackers
          project={project}
          frameworkId={FRAMEWORK_IDS.EU_AI_ACT}
          tracker={tracker}
          onTrackerChange={setTracker}
          readinessFrameworkType={readinessFrameworkType}
          requirementsTabRef={refs[0]}
        />
      </>
    );
  }, [
    isEUAIAct,
    readinessFrameworkType,
    tracker,
    refs,
    project,
    selectedFrameworkId,
    projectFrameworks.length,
    loading,
    isManagingFrameworksDisabled,
    setIsModalOpen,
  ]);

  if (error) {
    return (
      <Box sx={containerStyle}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <CustomizableButton variant="contained" onClick={refreshFilteredFrameworks} text="Retry" />
      </Box>
    );
  }

  // Render the "Manage frameworks" button
  const renderManageButton = () => (
    <CustomizableButton
      variant="contained"
      onClick={() => setIsModalOpen(true)}
      isDisabled={isManagingFrameworksDisabled}
      text="Manage frameworks/regulations"
    />
  );

  return (
    <Box sx={containerStyle}>
      <Box sx={headerContainerStyle}>
        {loading ? (
          <CustomizableSkeleton variant="rectangular" width={200} height={40} />
        ) : projectFrameworks.length > 0 || importedLinks.length > 0 ? (
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              overflowX: "auto",
              overflowY: "hidden",
              pb: 0.5,
            }}
          >
            <ButtonToggle
              options={[
                ...projectFrameworks.map((fw: Framework, index: number) => ({
                  value: index.toString(),
                  label: fw.name,
                })),
                ...importedLinks.map((link) => ({
                  value: `${IMPORTED_TOGGLE_PREFIX}${link.project_imported_framework_id}`,
                  label: link.name,
                })),
              ]}
              value={
                activeImportedLink
                  ? `${IMPORTED_TOGGLE_PREFIX}${activeImportedLink.project_imported_framework_id}`
                  : selectedFramework.toString()
              }
              onChange={handleToggleChange}
              height={34}
            />
          </Box>
        ) : null}
        {renderManageButton()}
      </Box>

      <AddFrameworkModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        frameworks={nonOrganizationalFrameworks}
        project={project}
        onFrameworksChanged={(action, frameworkId?: number) => {
          if (triggerRefresh) {
            if (action === "add") triggerRefresh(true, "Framework added successfully");
            else if (action === "removeImported") {
              // The selection effect falls back once the refreshed project
              // no longer lists the removed link.
              triggerRefresh(true, "Framework removed successfully");
            } else if (action === "remove") {
              triggerRefresh(true, "Framework removed successfully");
              // Find a framework whose id is not the removed one, and set its id as selected
              const nextFramework = project.framework?.find(
                (f) => Number(f.framework_id) !== frameworkId,
              );
              if (nextFramework) {
                const index = projectFrameworks.findIndex(
                  (fw: Framework) => Number(fw.id) === nextFramework.framework_id,
                );
                handleFrameworkSelect(index >= 0 ? index : 0);
              }
            } else triggerRefresh(true);
          }
          refreshFilteredFrameworks();
        }}
      />

      {activeImportedLink ? (
        // Imported frameworks have no readiness or assessment tracker tabs.
        <GenericFramework
          key={activeImportedLink.project_imported_framework_id}
          source="imported"
          projectId={Number(project.id)}
          linkId={activeImportedLink.project_imported_framework_id}
        />
      ) : (
        projectFrameworks.length > 0 && renderBuiltInContent()
      )}

      {/* Empty state when no frameworks installed */}
      {projectFrameworks.length === 0 && importedLinks.length === 0 && !loading && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 8,
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              backgroundColor: "background.hover",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke={text.disabled}
              strokeWidth="2"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </Box>
          <Box sx={{ fontSize: 18, fontWeight: 600, color: vwPalette.text.secondary, mb: 1 }}>
            No frameworks installed
          </Box>
          <Box sx={{ fontSize: 14, color: "status.default.text", maxWidth: 400, mb: 3 }}>
            This use case doesn't have any compliance frameworks yet. Add a framework to start
            tracking controls and assessments.
          </Box>
          <CustomizableButton
            variant="contained"
            onClick={() => setIsModalOpen(true)}
            isDisabled={isManagingFrameworksDisabled}
            text="Add Framework"
          />
        </Box>
      )}
    </Box>
  );
};

export default ProjectFrameworks;
