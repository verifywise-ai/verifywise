import useTranslation from "../../../application/hooks/useTranslation";
import { inkPalette as ink } from "./inkPalette";

interface MovedStripProps {
  item: string;
  before: string;
  now: string;
}

/** Animated before/now strip of the moved variant (board B5). Scales to the card width. */
export default function MovedStrip({ item, before, now }: MovedStripProps) {
  const { t } = useTranslation();
  const itemLabel = t(item);
  const beforeLabel = t(before);
  const nowLabel = t(now);
  const label = `${itemLabel}. ${t("Before")}: ${beforeLabel}. ${t("Now")}: ${nowLabel}.`;
  const chipWidth = Math.min(92, Math.max(60, itemLabel.length * 5 + 18));
  const text = { fontFamily: "inherit" };

  return (
    <svg
      role="img"
      aria-label={label}
      width="100%"
      viewBox="0 0 344 104"
      fill="none"
      style={{ display: "block" }}
    >
      <rect
        x="0.5"
        y="0.5"
        width="140"
        height="103"
        rx="4"
        fill={ink.panel}
        stroke={ink.panelBorder}
      />
      <text x="10" y="16" style={text} fontSize="9" fontWeight="500" fill={ink.panelText}>
        {t("Before")}
      </text>
      <rect x="10" y="26" width="80" height="6" rx="2" fill={ink.panelBorder} />
      <rect x="10" y="40" width="64" height="6" rx="2" fill={ink.panelBorder} />
      <text x="10" y="64" style={text} fontSize="8" fill={ink.panelText}>
        {beforeLabel}
      </text>
      <rect
        className="cn-ghost"
        x="18.5"
        y="76.5"
        width={chipWidth - 1}
        height="15"
        rx="3"
        stroke={ink.panelDash}
        strokeDasharray="3 2"
      />

      <rect
        x="203.5"
        y="0.5"
        width="140"
        height="103"
        rx="4"
        fill={ink.panel}
        stroke={ink.panelBorder}
      />
      <text x="214" y="16" style={text} fontSize="9" fontWeight="500" fill={ink.mint}>
        {t("Now")}
      </text>
      <rect x="214" y="26" width="80" height="6" rx="2" fill={ink.panelBorder} />
      <text x="214" y="46" style={text} fontSize="8" fontWeight="500" fill={ink.label}>
        {nowLabel}
      </text>
      <rect className="cn-slot" x="222" y="62" width="112" height="18" rx="3" fill={ink.tile} />
      <rect x="222" y="86" width="70" height="6" rx="2" fill={ink.panelBorder} />

      <path
        className="cn-arrow"
        d="M112 84 C 158 84 172 71 214 71 M209 66.5 L214 71 L209 75.5"
        stroke={ink.mint}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g className="cn-chip">
        <rect x="18" y="76" width={chipWidth} height="16" rx="3" fill={ink.mint} />
        <text x="26" y="87" style={text} fontSize="8" fontWeight="600" fill={ink.mintText}>
          {itemLabel}
        </text>
      </g>
    </svg>
  );
}
