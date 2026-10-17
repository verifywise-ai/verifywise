import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { Box, Stack, Typography } from "@mui/material";
import StandardModal from "../../Modals/StandardModal";
import { CustomizableButton } from "../../button/customizable-button";
import GenerateReportFrom from "./GenerateReportFrom";
import SectionSelector from "./SectionSelector";
import DownloadReportForm from "./DownloadReportFrom";
import { useGenerateReport, useReportRun } from "../../../../application/hooks/useReporting";
import { downloadReportRun } from "../../../../application/repository/reporting.repository";
import { showAlert } from "../../../../infrastructure/api/customAxios";
import { useProjects } from "../../../../application/hooks/useProjects";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import { logEngine } from "../../../../application/tools/log.engine";
import { useIsAdmin } from "../../../../application/hooks/useIsAdmin";
import { useLLMKeyStatus } from "../../../../application/hooks/useLLMKeyStatus";
import AIKeyBanner from "./AIKeyBanner";
import { IGenerateReportProps, ReportFormat } from "../../../../domain/interfaces/i.widget";
import type { GenerateReportRequestBody } from "../../../../domain/interfaces/i.reporting";
import {
  getDefaultSectionSelection,
  loadSectionPreferences,
  saveSectionPreferences,
  selectionToBackendFormat,
} from "./constants";

type ModalPage = "basic" | "sections" | "status";

interface BasicFormValues {
  project: number | null;
  framework: number;
  projectFrameworkId: number;
  reportName: string;
  format: ReportFormat;
  aiEnhanced: boolean;
}

const GenerateReportPopup: React.FC<IGenerateReportProps> = ({
  onClose,
  onReportGenerated,
  reportType,
}) => {
  const [currentPage, setCurrentPage] = useState<ModalPage>("basic");
  const {
    data: projects,
    dataUpdatedAt: projectsUpdatedAt,
    isFetching: projectsFetching,
    isStale: projectsStale,
  } = useProjects();
  // Read only to log it: the picker in GenerateReportFrom lists
  // dashboardValues.projects while the guard below checks useProjects(). When
  // they disagree, "Use case not found" is the symptom.
  const { dashboardValues } = useContext(VerifyWiseContext);
  const isAdmin = useIsAdmin();
  const { hasKeys } = useLLMKeyStatus();
  const validateFormRef = useRef<(() => boolean) | null>(null);

  // Async generate: enqueue a run, then poll it until it leaves "running".
  const generate = useGenerateReport();
  const [runId, setRunId] = useState<number | undefined>(undefined);
  const run = useReportRun(runId, runId != null);
  // Guard so each terminal run is handled exactly once.
  const handledRunIdRef = useRef<number | null>(null);
  // Parent passes fresh inline arrows every render; hold them in refs so the
  // terminal effect can depend only on run identity (not callback identity)
  // and never re-run — and thus never cancel — an in-flight download.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onReportGeneratedRef = useRef(onReportGenerated);
  onReportGeneratedRef.current = onReportGenerated;

  // Form values from Page 1
  const [basicFormValues, setBasicFormValues] = useState<BasicFormValues>({
    project: null,
    // 0 until a use case is picked and GenerateReportFrom resolves its real
    // pairing. These were 1/1, which is a live projects_frameworks id for
    // some project and submits as a real selection if nothing overwrites it.
    framework: 0,
    projectFrameworkId: 0,
    reportName: "",
    format: "pdf",
    aiEnhanced: false,
  });

  // Section selection for Page 2
  const [sectionSelection, setSectionSelection] = useState<Record<string, boolean>>({});

  // Determine if this is an organizational report
  const isOrganizational = reportType === "organization";

  // Initialize section selection when framework changes
  useEffect(() => {
    const savedPrefs = loadSectionPreferences();
    if (savedPrefs) {
      // Merge saved preferences with defaults for current framework
      const defaults = getDefaultSectionSelection(basicFormValues.framework, isOrganizational);
      const merged = { ...defaults };
      // Only apply saved preferences for sections that exist in current framework
      Object.keys(savedPrefs).forEach((key) => {
        if (key in defaults) {
          merged[key] = savedPrefs[key];
        }
      });
      setSectionSelection(merged);
    } else {
      setSectionSelection(getDefaultSectionSelection(basicFormValues.framework, isOrganizational));
    }
  }, [basicFormValues.framework, isOrganizational]);

  // Check if any section is selected
  const hasAnySelection = useMemo(() => {
    return Object.values(sectionSelection).some((v) => v === true);
  }, [sectionSelection]);

  const toast = useCallback((variant: "success" | "error", body: string) => {
    showAlert({ variant, body, isToast: true });
  }, []);

  const handleGenerateReport = useCallback(() => {
    // Handle null project case
    if (!basicFormValues.project) {
      toast("error", "Use case not selected");
      return;
    }

    const currentProject = projects?.find(
      (project: { id: number | null }) => project.id === basicFormValues.project,
    );

    if (!currentProject) {
      const contextProjects = Array.isArray(dashboardValues?.projects)
        ? dashboardValues.projects
        : [];
      logEngine({
        type: "error",
        // Template literal, not a quoted string: this is a developer
        // diagnostic, never rendered, and a dynamic message cannot be a
        // dictionary key — which is also why the i18n audit skips it.
        message: `Report generation blocked: use case ${basicFormValues.project} missing from useProjects()`,
        details: {
          selectedProjectId: basicFormValues.project,
          selectedProjectIdType: typeof basicFormValues.project,
          // The guard's list. id is typed string | number, and the lookup
          // below uses ===, so the runtime types matter as much as the values.
          useProjectsIds: (projects ?? []).map((p) => p.id),
          useProjectsIdTypes: [...new Set((projects ?? []).map((p) => typeof p.id))],
          useProjectsCount: projects?.length ?? 0,
          useProjectsUpdatedAt: new Date(projectsUpdatedAt).toISOString(),
          useProjectsAgeSeconds: Math.round((Date.now() - projectsUpdatedAt) / 1000),
          useProjectsIsFetching: projectsFetching,
          useProjectsIsStale: projectsStale,
          // The picker's list — what the user actually chose from.
          contextIds: contextProjects.map((p: { id: unknown }) => p.id),
          contextIdTypes: [...new Set(contextProjects.map((p: { id: unknown }) => typeof p.id))],
          contextCount: contextProjects.length,
          presentInContext: contextProjects.some(
            (p: { id: unknown }) => p.id === basicFormValues.project,
          ),
          // True when only strict equality is in the way.
          matchesLoosely: (projects ?? []).some(
            // eslint-disable-next-line eqeqeq
            (p) => p.id == basicFormValues.project,
          ),
        },
      });
      toast("error", "Use case not found");
      return;
    }

    // Convert section selection to backend format
    const selectedSections = selectionToBackendFormat(
      sectionSelection,
      basicFormValues.framework,
      isOrganizational,
    );

    // Save preferences to localStorage
    saveSectionPreferences(sectionSelection);

    setCurrentPage("status");

    const body: GenerateReportRequestBody = {
      projectId: basicFormValues.project,
      reportType: selectedSections, // Array of section keys
      reportName: basicFormValues.reportName,
      format: basicFormValues.format,
      aiEnhanced: basicFormValues.aiEnhanced,
      // Omitted entirely for a use case with no framework — there is no
      // pairing to name, and the route validates both as real ids when they
      // are present.
      ...(basicFormValues.framework > 0
        ? {
            frameworkId: basicFormValues.framework,
            projectFrameworkId: basicFormValues.projectFrameworkId,
          }
        : {}),
    };

    generate.mutate(body, {
      onSuccess: (res) => setRunId(res.runId),
      onError: () => {
        toast("error", "Failed to start report generation.");
        setCurrentPage("basic");
      },
    });
  }, [basicFormValues, sectionSelection, projects, isOrganizational, generate, toast]);

  // Poll result: download on success, toast + go back to the form on failure.
  useEffect(() => {
    if (!run.data || run.data.status === "running") return;
    if (handledRunIdRef.current === run.data.id) return; // already handled this run
    handledRunIdRef.current = run.data.id;

    // If the user closes mid-download the component unmounts; don't fire
    // onClose/toast/state on it.
    let cancelled = false;

    if (run.data.status === "success" && run.data.file_id != null) {
      const finishedRun = run.data;
      downloadReportRun(finishedRun.id)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = finishedRun.output_filename ?? "report";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast("success", "Report successfully downloaded.");
          onReportGeneratedRef.current?.();
          onCloseRef.current();
        })
        .catch(() => {
          if (cancelled) return;
          toast("error", "Failed to download the generated report.");
          setCurrentPage("basic");
        })
        .finally(() => {
          if (!cancelled) setRunId(undefined);
        });
    } else {
      if (run.data.status === "success") {
        // Terminal success but no file was produced.
        toast("error", "Report generated, but the file is not available to download.");
      } else {
        // failed | partial_success
        toast("error", run.data.error_message ?? "Report generation failed.");
      }
      setRunId(undefined);
      setCurrentPage("basic");
    }

    return () => {
      cancelled = true;
    };
    // Depend only on run identity/status — callbacks are read via refs so an
    // incidental parent re-render never re-runs (and never cancels) this effect.
  }, [run.data?.id, run.data?.status]);

  const handleOnCloseModal = () => {
    onClose();
  };

  const handleNextPage = () => {
    // Validate form before proceeding
    if (validateFormRef.current && !validateFormRef.current()) {
      return;
    }
    setCurrentPage("sections");
  };

  const handleBackPage = () => {
    setCurrentPage("basic");
  };

  // Get modal title and description based on current page
  const getModalContent = () => {
    const reportTypeLabel = isOrganizational ? "organization" : "use case";

    switch (currentPage) {
      case "basic":
        return {
          title: `Generate ${reportTypeLabel} report`,
          description: isOrganizational
            ? "Generate a comprehensive report for your entire organization."
            : "Select the use case and configure your report settings.",
        };
      case "sections":
        return {
          title: `Generate ${reportTypeLabel} report`,
          description: "Select which sections to include in your report.",
        };
      case "status":
        return {
          title: `Generate ${reportTypeLabel} report`,
          description: "Your report is being generated.",
        };
    }
  };

  const { title, description } = getModalContent();

  // Custom footer for multi-page navigation
  const renderCustomFooter = () => {
    if (currentPage === "status") {
      return null; // No footer during generation
    }

    if (currentPage === "basic") {
      return (
        <>
          <Box /> {/* Empty box for spacing */}
          <Stack direction="row" spacing={2}>
            <CustomizableButton
              variant="outlined"
              text="Cancel"
              onClick={handleOnCloseModal}
              sx={{
                "minWidth": "80px",
                "height": "34px",
                "border": "1px solid #d0d5dd",
                "color": "text.secondary",
                "&:hover": {
                  backgroundColor: "background.accent",
                  border: "1px solid #d0d5dd",
                },
              }}
            />
            <CustomizableButton
              variant="contained"
              text="Next"
              onClick={handleNextPage}
              sx={{
                "minWidth": "80px",
                "height": "34px",
                "backgroundColor": "brand.primary",
                "&:hover": {
                  backgroundColor: "brand.primaryHover",
                },
              }}
            />
          </Stack>
        </>
      );
    }

    if (currentPage === "sections") {
      return (
        <>
          <CustomizableButton
            variant="outlined"
            text="Back"
            onClick={handleBackPage}
            sx={{
              "minWidth": "80px",
              "height": "34px",
              "border": "1px solid #d0d5dd",
              "color": "text.secondary",
              "&:hover": {
                backgroundColor: "background.accent",
                border: "1px solid #d0d5dd",
              },
            }}
          />
          <Stack direction="row" spacing={2}>
            <CustomizableButton
              variant="outlined"
              text="Cancel"
              onClick={handleOnCloseModal}
              sx={{
                "minWidth": "80px",
                "height": "34px",
                "border": "1px solid #d0d5dd",
                "color": "text.secondary",
                "&:hover": {
                  backgroundColor: "background.accent",
                  border: "1px solid #d0d5dd",
                },
              }}
            />
            <CustomizableButton
              variant="contained"
              text="Generate report"
              onClick={handleGenerateReport}
              isDisabled={!hasAnySelection}
              sx={{
                "minWidth": "120px",
                "height": "34px",
                "backgroundColor": "brand.primary",
                "&:hover:not(.Mui-disabled)": {
                  backgroundColor: "brand.primaryHover",
                },
                "&.Mui-disabled": {
                  backgroundColor: "status.default.border",
                  color: "text.disabled",
                },
              }}
            />
          </Stack>
        </>
      );
    }

    return null;
  };

  // Show access denied message for non-admin users
  if (!isAdmin) {
    return (
      <StandardModal
        isOpen={true}
        onClose={onClose}
        title="Access Restricted"
        description=""
        hideFooter={false}
        maxWidth="400px"
        customFooter={
          <CustomizableButton
            variant="contained"
            text="Close"
            onClick={onClose}
            sx={{
              "minWidth": "80px",
              "height": "34px",
              "backgroundColor": "brand.primary",
              "&:hover": {
                backgroundColor: "brand.primaryHover",
              },
            }}
          />
        }
      >
        <Stack spacing={2} sx={{ py: 2, textAlign: "center" }}>
          <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
            Only administrators can generate and download reports.
          </Typography>
          <Typography sx={{ color: "text.icon", fontSize: 13 }}>
            Please contact your administrator if you need access to this feature.
          </Typography>
        </Stack>
      </StandardModal>
    );
  }

  return (
    <Stack>
      <StandardModal
        isOpen={true}
        onClose={handleOnCloseModal}
        title={title}
        description={description}
        customFooter={renderCustomFooter()}
        hideFooter={currentPage === "status"}
        maxWidth="500px"
      >
        <Stack sx={{ minHeight: currentPage === "status" ? "200px" : "auto" }}>
          {currentPage === "status" ? (
            <DownloadReportForm aiEnhanced={basicFormValues.aiEnhanced} />
          ) : currentPage === "sections" ? (
            <SectionSelector
              frameworkId={basicFormValues.framework}
              isOrganizational={isOrganizational}
              selection={sectionSelection}
              onSelectionChange={setSectionSelection}
              aiEnhanced={basicFormValues.aiEnhanced}
            />
          ) : (
            <>
              {!hasKeys && (
                <Box sx={{ mb: 3 }}>
                  <AIKeyBanner onClose={handleOnCloseModal} />
                </Box>
              )}
              <GenerateReportFrom
                reportType={reportType}
                values={basicFormValues}
                onValuesChange={setBasicFormValues}
                onValidateRef={validateFormRef}
                hasKeys={hasKeys}
              />
            </>
          )}
        </Stack>
      </StandardModal>
    </Stack>
  );
};

export default GenerateReportPopup;
