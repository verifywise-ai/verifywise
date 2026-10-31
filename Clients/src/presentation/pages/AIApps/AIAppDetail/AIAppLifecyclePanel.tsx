import LifecyclePanel from "../../../components/LifecycleTabs/LifecyclePanel";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useMyPermissions } from "../../../../application/hooks/useMyPermissions";
import {
  useAiAppLifecycle,
  useAiAppLifecycleActions,
} from "../../../../application/hooks/useAiAppLifecycle";
import { canManageLifecycle } from "../../../../application/utils/useCaseLifecycle";
import { AiAppStatus } from "../../../../domain/enums/aiApp.enum";

/** Only an app approved for use (with or without restrictions) can go live. */
const CAN_GO_LIVE: AiAppStatus[] = [AiAppStatus.APPROVED, AiAppStatus.RESTRICTED];

/** Built-in roles holding aiApp.edit; only stands in until permissions load. */
const AI_APP_EDIT_ROLES = ["Admin", "Editor"];

/**
 * Lifecycle strip on the AI app detail page (#5193): the shared
 * LifecyclePanel, fed by /api/v1/ai-app-lifecycle/:id.
 */
const AIAppLifecyclePanel = ({ appId, status }: { appId: number; status: AiAppStatus }) => {
  const { userRoleName, userId } = useAuth();
  const { data: lifecycle } = useAiAppLifecycle(appId);
  const { goLive, retire, confirm } = useAiAppLifecycleActions(appId);
  const { permissions } = useMyPermissions();

  if (!lifecycle) return null;

  const canEdit = permissions
    ? permissions.includes("aiApp.edit")
    : AI_APP_EDIT_ROLES.includes(userRoleName);
  const canManage = canManageLifecycle(userRoleName, userId, lifecycle.owner ?? undefined, canEdit);

  return (
    <LifecyclePanel
      testId="ai-app-lifecycle-panel"
      stage={lifecycle.lifecycle_stage}
      goLiveDate={lifecycle.go_live_date}
      lastConfirmedAt={lifecycle.last_confirmed_at}
      retiredAt={lifecycle.retired_at}
      canManage={canManage}
      isStale={lifecycle.is_stale}
      goLiveBlockedReason={
        CAN_GO_LIVE.includes(status)
          ? undefined
          : "Approve this AI app before marking it as live. Change its status to Approved or Restricted below."
      }
      goLive={goLive}
      retire={retire}
      confirm={confirm}
      copy={{
        staleMessage:
          "Nobody has confirmed this AI app is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.",
        goLiveDescription:
          "Record the date this AI app went into use. Owners are asked to confirm it is still live at the interval set in Settings.",
        retireTitle: "Retire AI app",
        retireDescription:
          "A retired AI app stays in the inventory under Retired, with its history, but is no longer checked for being live.",
      }}
    />
  );
};

export default AIAppLifecyclePanel;
