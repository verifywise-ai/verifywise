/**
 * Archive tab — reports the user archived. The run history it used to show now
 * lives in the Generate tab, which lists non-archived runs.
 */
import ReportRunsTable from "./ReportRunsTable";

export default function ArchiveTab() {
  return <ReportRunsTable variant="archived" />;
}
