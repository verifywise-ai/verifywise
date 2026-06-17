import React from "react";
import VWTooltip from "../VWTooltip";
import { useTranslation } from "../../../application/hooks/useTranslation";

export type GovernanceTooltipPlacement = "top" | "bottom" | "left" | "right";

interface GovernanceTooltipProps {
  /** English header text. This exact string is used as the i18n key. */
  header: string;
  /** English description text. This exact string is used as the i18n key. */
  description?: string;
  /** Trigger element (must be a single React element). */
  children: React.ReactElement;
  /** Tooltip placement relative to the trigger. */
  placement?: GovernanceTooltipPlacement;
  /** Optional max width override. */
  maxWidth?: number;
}

/**
 * Rich, localised tooltip for the Governance module.
 *
 * The `header` and `description` props are English source strings; they are
 * looked up in the active language dictionary at render time so tooltips react
 * to language changes.
 */
const GovernanceTooltip: React.FC<GovernanceTooltipProps> = ({
  header,
  description,
  children,
  placement = "top",
  maxWidth,
}) => {
  const { t } = useTranslation();
  const translatedHeader = t(header);
  const translatedDescription = description ? t(description) : "";

  return (
    <VWTooltip
      header={translatedHeader}
      content={translatedDescription || translatedHeader}
      placement={placement}
      maxWidth={maxWidth}
    >
      {children}
    </VWTooltip>
  );
};

export default GovernanceTooltip;
