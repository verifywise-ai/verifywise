import { memo, type CSSProperties } from "react";
import { VW_ICONS, type VWIconName } from "./icons";

export type { VWIconName };

export interface VWIconProps {
  name: VWIconName;
  /** Rendered size in px. Sidebar 16, tabs 15, elsewhere 18. */
  size?: number;
  /** Defaults to currentColor so the icon follows the text colour. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; omit for decorative icons next to a text label. */
  title?: string;
}

/**
 * VerifyWise icon. Use for sidebar and tab icons; keep Lucide for small UI
 * icons such as chevrons, close and search.
 */
const VWIcon = ({
  name,
  size = 18,
  color = "currentColor",
  className,
  style,
  title,
}: VWIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ color, flexShrink: 0, ...style }}
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
  >
    {VW_ICONS[name]}
  </svg>
);

export default memo(VWIcon);
