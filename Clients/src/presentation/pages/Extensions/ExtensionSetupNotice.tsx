import { useNavigate } from "react-router";
import { useCan } from "../../../application/hooks/useCan";
import { VWLink } from "../../components/Link";

interface ExtensionSetupNoticeProps {
  /** Extension key, used for the settings route (`/extensions/<key>/settings`). */
  extensionKey: string;
  /** Product name shown to people who cannot set the extension up. */
  name: string;
  /** What an Admin reads before the settings link. */
  adminText: string;
}

/**
 * The "this extension is not set up yet" text on an extension's model tab.
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

  if (!canSetUp) {
    return <>{`Ask an Admin to set up ${name}.`}</>;
  }
  return (
    <>
      {adminText}{" "}
      <VWLink
        onClick={() => navigate(`/extensions/${extensionKey}/settings`)}
        showIcon={false}
        testId={`${extensionKey}-settings`}
      >
        Open settings
      </VWLink>
    </>
  );
}
