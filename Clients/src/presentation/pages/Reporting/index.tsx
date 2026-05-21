import { useState, useCallback } from "react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import GenerateReport from "./GenerateReport";
import ReportLists from "./Reports";
import PageTour from "../../components/PageTour";
import ReportingSteps from "./ReportingSteps";

const Reporting = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleReportGenerated = useCallback(() => {
    // Increment refresh key to trigger re-render of Reports component
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <PageHeaderExtended
      title="Reporting"
      description="Want a report? We'll create one using the info from your Compliance, Assessment, and Vendor/Risk sections."
      helpArticlePath="reporting/generating-reports"
      tipBoxEntity="reporting"
    >
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

      <PageTour steps={ReportingSteps} run={true} tourKey="reporting-tour" />
    </PageHeaderExtended>
  );
};

export default Reporting;
