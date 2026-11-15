import { useNavigate } from "react-router";
import { useCan } from "../../../application/hooks/useCan";
import Alert from "../../components/Alert";

interface ExtensionSetupNoticeProps {
  /** Extension key, used for the settings route (`/extensions/<key>/settings`). */
  extensionKey: string;
  /** Product name shown to people who cannot set the extension up. */
  name: string;
  /** What an Admin reads before the settings link. */
  adminText: string;
}

/**
 * The "this extension is not set up yet" warning on an extension's model tab.
 * Only an Admin can change extension settings, so only an Admin gets the
 * link; everyone else is told who to ask.
 */
export default function ExtensionSetupNotice({
  extensionKey,
  name,
  adminText,
}: ExtensionSetupNoticeProps) {
  const canSetUp = useCan("extension.admin");
  const navigate = useNavigate();

  return (
    <Alert
      variant="warning"
      inline
      body={canSetUp ? adminText : `Ask an Admin to set up ${name}.`}
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
