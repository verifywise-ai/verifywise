import { useState, useCallback } from "react";
import { Box, Tabs, Tab, Drawer } from "@mui/material";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import GenerateReport from "./GenerateReport";
import ReportLists from "./Reports";
import PageTour from "../../components/PageTour";
import ReportingSteps from "./ReportingSteps";
import TemplatesTab from "./TemplatesTab";
import ScheduledReportsTab from "./ScheduledReportsTab";
import ArchiveTab from "./ArchiveTab";
import ConfigureReportWizard from "./ConfigureReportWizard";
import { getTemplate } from "../../../application/repository/reporting.repository";
import { showAlert } from "../../../infrastructure/api/customAxios";

const Reporting = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wizardTemplate, setWizardTemplate] = useState<any | null>(null);

  const handleReportGenerated = useCallback(() => {
    // Increment refresh key to trigger re-render of Reports component
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleTabChange = (_: React.SyntheticEvent, value: number) => {
    setActiveTab(value);
  };

  const handleUseTemplate = useCallback(async (templateId: number) => {
    try {
      const template = await getTemplate(templateId);
      setWizardTemplate(template);
    } catch (error: any) {
      showAlert({
        variant: "error",
        body: error?.message || "Failed to load template.",
        isToast: true,
      });
    }
  }, []);

  const handleWizardClose = useCallback(() => {
    setWizardTemplate(null);
    setActiveTab(2); // jump to Scheduled tab so the new report is visible
  }, []);

  return (
    <PageHeaderExtended
      title="Reporting"
      description="Want a report? We'll create one using the info from your Compliance, Assessment, and Vendor/Risk sections."
      helpArticlePath="reporting/generating-reports"
      tipBoxEntity="reporting"
    >
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        indicatorColor="primary"
        textColor="primary"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Generate" disableRipple sx={{ textTransform: "none" }} />
        <Tab label="Templates" disableRipple sx={{ textTransform: "none" }} />
        <Tab label="Scheduled" disableRipple sx={{ textTransform: "none" }} />
        <Tab label="Archive" disableRipple sx={{ textTransform: "none" }} />
      </Tabs>

      {activeTab === 0 && (
        <div data-joyride-id="reports-list">
          <ReportLists
            refreshKey={refreshKey}
            generateReportButton={
              <div data-joyride-id="generate-report-button">
                <GenerateReport onReportGenerated={handleReportGenerated} />
              </div>
            }
          />
        </div>
      )}

      {activeTab === 1 && (
        <Box>
          <TemplatesTab onUse={handleUseTemplate} />
        </Box>
      )}

      {activeTab === 2 && (
        <Box>
          <ScheduledReportsTab />
        </Box>
      )}

      {activeTab === 3 && (
        <Box>
          <ArchiveTab />
        </Box>
      )}

      <Drawer anchor="right" open={!!wizardTemplate} onClose={handleWizardClose}>
        {wizardTemplate && (
          <ConfigureReportWizard template={wizardTemplate} onClose={handleWizardClose} />
        )}
      </Drawer>

      <PageTour steps={ReportingSteps} run={true} tourKey="reporting-tour" />
    </PageHeaderExtended>
  );
};

export default Reporting;
