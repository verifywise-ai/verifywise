import { useNavigate } from "react-router";
import { useCan } from "../../../application/hooks/useCan";
import Alert from "../../components/Alert";

interface ExtensionSetupNoticeProps {
  /** Extension key, used for the settings route (`/extensions/<key>/settings`). */
  extensionKey: string;
  /** What an Admin reads before the settings link. */
  adminText: string;
  /**
   * What everyone else reads, as one full sentence
   * (e.g. "Ask an Admin to set up MLflow.") so it translates as a whole.
   */
  askAdminText: string;
}

/**
 * The "this extension is not set up yet" warning on an extension's model tab.
 * Only an Admin can change extension settings, so only an Admin gets the
 * link; everyone else is told who to ask.
 */
export default function ExtensionSetupNotice({
  extensionKey,
  adminText,
  askAdminText,
}: ExtensionSetupNoticeProps) {
  const canSetUp = useCan("extension.admin");
  const navigate = useNavigate();

  return (
    <Alert
      variant="warning"
      inline
      body={canSetUp ? adminText : askAdminText}
      action={
        canSetUp
          ? {
              label: "Open settings",
              onClick: () => navigate(`/extensions/${extensionKey}/settings`),
            }
          : undefined
      }
      sx={{ mb: "16px" }}
    />
  );
}
