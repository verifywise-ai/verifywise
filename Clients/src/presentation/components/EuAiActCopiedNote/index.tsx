import Alert from "../Alert";
import StatusBadge from "../StatusBadge";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { isCopiedForReview } from "../../../application/constants/frameworks";
import { fontSize } from "../../themes/typography";

const COPIED_TEMPLATE =
  "Copied from {useCase} when this moved to the organization. Review it, then save.";
// The server leaves the use case out for a viewer who can't see it.
const COPIED_UNNAMED =
  "Copied from a use case when this moved to the organization. Review it, then save.";

type CopiedMarker = {
  copied_from_project_id?: number | null;
  copied_from_use_case?: string | null;
};

/**
 * One line at the top of an EU AI Act (organization) drawer when the upgrade
 * copied this item from a use case and nobody has saved it since. Saving clears
 * the marker on the server. The use case is named only when the server returns
 * its label, which it does for viewers who can see that use case.
 */
export const EuAiActCopiedNote = ({ item }: { item?: CopiedMarker | null }) => {
  const { t } = useTranslation();
  if (!isCopiedForReview(item)) return null;
  const useCase = item?.copied_from_use_case;
  return (
    <Alert
      variant="info"
      inline
      hasIcon={false}
      body={useCase ? fill(t(COPIED_TEMPLATE), { useCase }) : t(COPIED_UNNAMED)}
      sx={{ "& .MuiTypography-root": { fontSize: fontSize.base } }}
    />
  );
};

/** "Review" badge on a requirement or question row that still carries the marker. */
export const EuAiActReviewBadge = ({ item }: { item?: CopiedMarker | null }) =>
  isCopiedForReview(item) ? <StatusBadge label="Review" variant="info" /> : null;
