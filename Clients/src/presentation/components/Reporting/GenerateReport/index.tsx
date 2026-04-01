import React, {
  useState,
  lazy,
  Suspense,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { Box, Stack, Typography } from "@mui/material";
import StandardModal from "../../Modals/StandardModal";
import { CustomizableButton } from "../../button/customizable-button";
const GenerateReportFrom = lazy(() => import("./GenerateReportFrom"));
const SectionSelector = lazy(() => import("./SectionSelector"));
const DownloadReportForm = lazy(() => import("./DownloadReportFrom"));
import { handleAutoDownload } from "../../../../application/tools/fileDownload";
import { handleAlert } from "../../../../application/tools/alertUtils";
import Alert from "../../Alert";
import { useProjects } from "../../../../application/hooks/useProjects";
import useUsers from "../../../../application/hooks/useUsers";
import { useIsAdmin } from "../../../../application/hooks/useIsAdmin";
import { useLLMKeyStatus } from "../../../../application/hooks/useLLMKeyStatus";
import AIKeyBanner from "./AIKeyBanner";
import {
  IGenerateReportProps,
  ReportFormat,
} from "../../../../domain/interfaces/i.widget";
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
  const [responseStatusCode, setResponseStatusCode] = useState<number>(200);
  const { users } = useUsers();
  const { data: projects } = useProjects();
  const isAdmin = useIsAdmin();
  const { data: llmKeyStatus } = useLLMKeyStatus();
  const hasKeys = llmKeyStatus?.hasKeys ?? false;
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const validateFormRef = useRef<(() => boolean) | null>(null);

  // Form values from Page 1
  const [basicFormValues, setBasicFormValues] = useState<BasicFormValues>({
    project: null,
    framework: 1,
    projectFrameworkId: 1,
    reportName: "",
    format: "pdf",
    aiEnhanced: false,
  });

  // Section selection for Page 2
  const [sectionSelection, setSectionSelection] = useState<
    Record<string, boolean>
  >({});

  // Determine if this is an organizational report
  const isOrganizational = reportType === "organization";

  // Initialize section selection when framework changes
  useEffect(() => {
    const savedPrefs = loadSectionPreferences();
    if (savedPrefs) {
      // Merge saved preferences with defaults for current framework
      const defaults = getDefaultSectionSelection(
        basicFormValues.framework,
        isOrganizational
      );
      const merged = { ...defaults };
      // Only apply saved preferences for sections that exist in current framework
      Object.keys(savedPrefs).forEach((key) => {
        if (key in defaults) {
          merged[key] = savedPrefs[key];
        }
      });
      setSectionSelection(merged);
    } else {
      setSectionSelection(
        getDefaultSectionSelection(basicFormValues.framework, isOrganizational)
      );
    }
  }, [basicFormValues.framework, isOrganizational]);

  // Check if any section is selected
  const hasAnySelection = useMemo(() => {
    return Object.values(sectionSelection).some((v) => v === true);
  }, [sectionSelection]);

  const handleToast = useCallback(
    (type: "success" | "info" | "warning" | "error", message: string) => {
      handleAlert({
        variant: type,
        body: message,
        setAlert,
      });
      clearTimerRef.current = setTimeout(() => {
        setAlert(null);
        // Only close modal on success, not on errors
        if (type === "success") {
          onClose();
        }
      }, 3000);
    },
    [onClose]
  );

  const handleGenerateReport = useCallback(async () => {
    // Handle null project case
    if (!basicFormValues.project) {
      handleToast("error", "Use case not selected");
      return;
    }

    const currentProject = projects?.find(
      (project: { id: number | null }) => project.id === basicFormValues.project
    );

    if (!currentProject) {
      handleToast("error", "Use case not found");
      return;
    }

    setCurrentPage("status");

    const owner = users.find(
      (user: { id: number }) => user.id === currentProject.owner
    );
    const currentProjectOwner = owner ? `${owner.name} ${owner.surname}` : "";

    // Convert section selection to backend format
    const selectedSections = selectionToBackendFormat(
      sectionSelection,
      basicFormValues.framework,
      isOrganizational
    );

    // Save preferences to localStorage
    saveSectionPreferences(sectionSelection);

    const body = {
      projectId: basicFormValues.project,
      projectTitle: currentProject.project_title,
      projectOwner: currentProjectOwner,
      reportType: selectedSections, // Now sends array of section keys
      reportName: basicFormValues.reportName,
      frameworkId: basicFormValues.framework,
      projectFrameworkId: basicFormValues.projectFrameworkId,
      format: basicFormValues.format,
      aiEnhanced: basicFormValues.aiEnhanced,
    };

    const reportDownloadResponse = await handleAutoDownload(body);
    setResponseStatusCode(reportDownloadResponse);

    if (reportDownloadResponse === 200) {
      handleToast("success", "Report successfully downloaded.");
      if (onReportGenerated) {
        onReportGenerated();
      }
    } else if (reportDownloadResponse === 403) {
      handleToast(
        "warning",
        "Access denied: Unauthorized user to download the report."
      );
    } else {
      handleToast(
        "error",
        "Unexpected error occurs while downloading the report."
      );
    }
  }, [
    basicFormValues,
    sectionSelection,
    projects,
    users,
    isOrganizational,
    onReportGenerated,
    handleToast,
  ]);

  const handleOnCloseModal = () => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
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
                minWidth: "80px",
                height: "34px",
                border: "1px solid #d0d5dd",
                color: "text.secondary",
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
                minWidth: "80px",
                height: "34px",
                backgroundColor: "brand.primary",
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
              minWidth: "80px",
              height: "34px",
              border: "1px solid #d0d5dd",
              color: "text.secondary",
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
                minWidth: "80px",
                height: "34px",
                border: "1px solid #d0d5dd",
                color: "text.secondary",
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
                minWidth: "120px",
                height: "34px",
                backgroundColor: "brand.primary",
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
              minWidth: "80px",
              height: "34px",
              backgroundColor: "brand.primary",
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
      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Box>
            <Alert
              variant={alert.variant}
              title={alert.title}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Box>
        </Suspense>
      )}

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
            <Suspense fallback={<div>Loading...</div>}>
              <DownloadReportForm
                statusCode={responseStatusCode}
                aiEnhanced={basicFormValues.aiEnhanced}
              />
            </Suspense>
          ) : currentPage === "sections" ? (
            <Suspense fallback={<div>Loading...</div>}>
              <SectionSelector
                frameworkId={basicFormValues.framework}
                isOrganizational={isOrganizational}
                selection={sectionSelection}
                onSelectionChange={setSectionSelection}
                aiEnhanced={basicFormValues.aiEnhanced}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<div>Loading...</div>}>
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
            </Suspense>
          )}
        </Stack>
      </StandardModal>
    </Stack>
  );
};

export default GenerateReportPopup;
