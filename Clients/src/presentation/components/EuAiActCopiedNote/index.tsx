import Alert from "../Alert";
import StatusBadge from "../StatusBadge";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { isCopiedForReview } from "../../../application/constants/frameworks";

const COPIED_TEMPLATE =
  "Copied from {useCase} when this moved to the organization. Review it, then save.";

type CopiedMarker = {
  copied_from_project_id?: number | null;
  copied_from_use_case?: string | null;
};

/**
 * One line at the top of an EU AI Act (organization) drawer when the upgrade
 * copied this item from a use case and nobody has saved it since. Saving clears
 * the marker on the server.
 */
export const EuAiActCopiedNote = ({ useCase }: { useCase?: string | null }) => {
  const { t } = useTranslation();
  if (!useCase) return null;
  return (
    <Alert
      variant="info"
      inline
      hasIcon={false}
      body={fill(t(COPIED_TEMPLATE), { useCase })}
      sx={{ "& .MuiTypography-root": { fontSize: "13px" } }}
    />
  );
};

/** "Review" badge on a requirement or question row that still carries the marker. */
export const EuAiActReviewBadge = ({ item }: { item?: CopiedMarker | null }) =>
  isCopiedForReview(item) ? <StatusBadge label="Review" variant="info" /> : null;
