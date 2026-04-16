/**
 * Controls Hub — Master Control Drawer, History tab.
 *
 * Reuses the shared `HistorySidebar` component in `inline` mode so the
 * change-history timeline lives inside the drawer's tab panel rather than as
 * a side rail. Every master-control update and mapping event is already
 * recorded by `trackEntityChanges` on the backend (see
 * `Servers/controllers/masterControl.ctrl.ts`) under the `master_control`
 * entity type.
 */
import { HistorySidebar } from "../../../../components/Common/HistorySidebar";

interface HistoryTabProps {
  masterControlId: number;
}

export default function HistoryTab({ masterControlId }: HistoryTabProps) {
  return (
    <HistorySidebar
      isOpen={true}
      entityType="master_control"
      entityId={masterControlId}
      inline={true}
    />
  );
}
