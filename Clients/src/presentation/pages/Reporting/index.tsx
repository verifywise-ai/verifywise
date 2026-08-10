import { useState, useCallback, useMemo } from "react";
import { Box } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { Plus } from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import TabBar from "../../components/TabBar";
import type { TabItem } from "../../components/TabBar";
import { CustomizableButton } from "../../components/button/customizable-button";
import GenerateReport from "./GenerateReport";
import ReportRunsTable from "./ReportRunsTable";
import PageTour from "../../components/PageTour";
import ReportingSteps from "./ReportingSteps";
import TemplatesTab from "./TemplatesTab";
import ScheduledReportsTab from "./ScheduledReportsTab";
import ArchiveTab from "./ArchiveTab";
import ConfigureReportWizard from "./ConfigureReportWizard";
import TemplateBuilder from "./TemplateBuilder";
import { getTemplate } from "../../../application/repository/reporting.repository";
import { useScheduledReports } from "../../../application/hooks/useReporting";
import { showAlert } from "../../../infrastructure/api/customAxios";

/**
 * Each tab carries the same icon its own empty state uses, so the tab and the
 * table behind it read as one thing.
 */
const REPORTING_TABS: TabItem[] = [
  { label: "Generate", value: "generate", icon: "FileText" },
  { label: "Templates", value: "templates", icon: "LayoutTemplate" },
  { label: "Scheduled", value: "scheduled", icon: "CalendarClock" },
  { label: "Archive", value: "archive", icon: "Archive" },
];

const Reporting = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("generate");

  /**
   * Only Scheduled carries a count. "Is anything scheduled?" is the one question
   * you cannot answer without opening the tab, and useScheduledReports takes no
   * params, so the badge reads the same cache entry ScheduledReportsTab does.
   * Cost is one GET on page load; opening the tab still refetches, as it did
   * before (that query sets no staleTime).
   *
   * The other three are bare on purpose: Generate already prints its own
   * "Showing X - Y of Z" row, Templates would be dominated by the ~21 system
   * templates and never meaningfully move, and counting either of those or
   * Archive means holding a runs query up here — which drags
   * useReportRunsPage's 5s poll onto every tab, not just its own.
   */
  const { data: scheduledReports = [], isLoading: scheduledLoading } = useScheduledReports();

  const tabs = useMemo<TabItem[]>(
    () =>
      REPORTING_TABS.map((tab) =>
        tab.value === "scheduled"
          ? { ...tab, count: scheduledReports.length, isLoading: scheduledLoading }
          : tab,
      ),
    [scheduledReports.length, scheduledLoading],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wizardTemplate, setWizardTemplate] = useState<any | null>(null);
  const [wizardMode, setWizardMode] = useState<"schedule" | "run-now">("schedule");
  const [builderOpen, setBuilderOpen] = useState(false);

  const handleReportGenerated = useCallback(() => {
    // Increment refresh key to trigger re-render of Reports component
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setActiveTab(value);
  };

  const handleUseTemplate = useCallback(
    async (templateId: number, mode: "schedule" | "run-now" = "schedule") => {
      try {
        const template = await getTemplate(templateId);
        setWizardMode(mode);
        setWizardTemplate(template);
      } catch (error: any) {
        showAlert({
          variant: "error",
          body: error?.message || "Failed to load template.",
          isToast: true,
        });
      }
    },
    [],
  );

  const handleWizardClose = useCallback(() => {
    setWizardTemplate(null);
    // A schedule belongs on the Scheduled tab; a run-now report belongs in the
    // Generate list, so send the user where their result actually landed.
    setActiveTab(wizardMode === "run-now" ? "generate" : "scheduled");
  }, [wizardMode]);

  return (
    <PageHeaderExtended
      title="Reporting"
      description="Want a report? We'll create one using the info from your Compliance, Assessment, and Vendor/Risk sections."
      helpArticlePath="reporting/generating-reports"
      tipBoxEntity="reporting"
    >
      {/* TabList needs a TabContext ancestor — see style guide § Tabs. */}
      <TabContext value={activeTab}>
        <TabBar tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
      </TabContext>

      {activeTab === "generate" && (
        <div data-joyride-id="reports-list">
          <Box sx={{ display: "flex", justifyContent: "flex-end", my: 2 }}>
            <div data-joyride-id="generate-report-button">
              <GenerateReport onReportGenerated={handleReportGenerated} />
            </div>
          </Box>
          <ReportRunsTable key={refreshKey} variant="live" />
        </div>
      )}

      {activeTab === "templates" && (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            {/* Style guide § Buttons: primary actions carry an icon. */}
            <CustomizableButton
              variant="contained"
              text="New template"
              icon={<Plus size={16} />}
              onClick={() => setBuilderOpen(true)}
            />
          </Box>
          <TemplatesTab onUse={handleUseTemplate} />
        </Box>
      )}

      {activeTab === "scheduled" && (
        <Box>
          <ScheduledReportsTab />
        </Box>
      )}

      {activeTab === "archive" && (
        <Box>
          <ArchiveTab />
        </Box>
      )}

      {/* Both wizards are StepperModals now — they carry their own overlay,
          header and footer, so there is no Drawer to wrap them in. */}
      {wizardTemplate && (
        <ConfigureReportWizard
          template={wizardTemplate}
          mode={wizardMode}
          onClose={handleWizardClose}
        />
      )}

      {builderOpen && <TemplateBuilder onClose={() => setBuilderOpen(false)} />}

      <PageTour steps={ReportingSteps} run={true} tourKey="reporting-tour" />
    </PageHeaderExtended>
  );
};

export default Reporting;
