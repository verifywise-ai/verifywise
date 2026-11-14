import { useId, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import useTranslation from "../../../application/hooks/useTranslation";
import type { ChangeNoticeEntry } from "../../../domain/types/changeNotice.types";
import { inkPalette as ink } from "./inkPalette";
import MovedStrip from "./MovedStrip";
import WelcomePreview from "./WelcomePreview";
import "./changeNotice.css";

export interface ChangeNoticeCardProps {
  entry: ChangeNoticeEntry;
  onDismiss: () => void;
  onShowMe: () => void;
  showMeActive: boolean;
  canShowMe: boolean;
  onOpenGuide: () => void;
  /** Welcome variant: keep the new look (dismiss without an Undo strip). */
  onKeep?: () => void;
  /** Welcome variant: record the dismissal, then switch to the classic look. */
  onSwitchBack?: () => void;
}

const buttonBase: CSSProperties = {
  height: 34,
  border: 0,
  borderRadius: 4,
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

const primaryButton = (mint: boolean): CSSProperties => ({
  ...buttonBase,
  padding: "0 16px",
  background: mint ? ink.mint : ink.white,
  color: mint ? ink.mintText : ink.whiteText,
});

const guideButton: CSSProperties = {
  ...buttonBase,
  padding: "0 10px",
  background: "transparent",
  color: ink.label,
  fontWeight: 500,
};

function CheckList({ items, indent }: { items: string[]; indent: boolean }) {
  return (
    <ul
      style={{
        margin: 0,
        padding: indent ? "0 0 0 48px" : 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 9,
        color: ink.body,
        lineHeight: 1.45,
      }}
    >
      {items.slice(0, 3).map((item, index) => (
        <li key={item} style={{ display: "flex", gap: 10 }}>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ flexShrink: 0, marginTop: 3 }}
          >
            <path
              className={`cn-check cn-check-${index + 1}`}
              d="M2.5 7.5l3 3 6-7"
              stroke={ink.mint}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DismissButton({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t("Dismiss")}
      data-testid="change-notice-dismiss"
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        border: 0,
        background: "transparent",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={ink.dismissIcon}
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function IconTile() {
  return (
    <div
      aria-hidden="true"
      style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 6, background: ink.tile }}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="10" stroke={ink.tileLine} strokeWidth="1.5" />
        <circle cx="18" cy="18" r="5" stroke={ink.tileLine} strokeWidth="1.5" />
        <g className="cn-sweep">
          <path d="M18 18 L18 8" stroke={ink.mint} strokeWidth="1.75" strokeLinecap="round" />
        </g>
        <circle className="cn-ping" cx="24" cy="12" r="1.8" fill={ink.mint} />
      </svg>
    </div>
  );
}

export default function ChangeNoticeCard({
  entry,
  onDismiss,
  onShowMe,
  showMeActive,
  canShowMe,
  onOpenGuide,
  onKeep,
  onSwitchBack,
}: ChangeNoticeCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const titleId = useId();
  const { variant } = entry;
  const title = t(entry.title);
  const body = entry.body ? t(entry.body) : null;
  const items = (entry.items ?? []).map((item) => t(item));

  const label = (
    <div style={{ fontSize: 12, fontWeight: 500, color: ink.label }}>{t("What's changed")}</div>
  );
  const titleStyle: CSSProperties = { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.3 };

  const guide = entry.guidePath ? (
    <button
      type="button"
      data-testid="change-notice-guide"
      onClick={onOpenGuide}
      style={guideButton}
    >
      {t("Read the guide")}
    </button>
  ) : null;

  const showMe =
    entry.showMeTestId && canShowMe ? (
      <button
        type="button"
        data-testid="change-notice-show-me"
        onClick={onShowMe}
        style={primaryButton(variant === "standard")}
      >
        {showMeActive ? t("Got it") : t("Show me")}
      </button>
    ) : null;

  let content: ReactNode;
  let padding = 18;
  let gap = 14;

  if (variant === "rename" && entry.rename) {
    padding = 14;
    gap = 10;
    content = (
      <>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: ink.label, flex: "1 1 auto" }}>
            {t("What's changed")}
          </span>
          <DismissButton onClick={onDismiss} style={{ margin: "-6px -6px -6px 0" }} />
        </div>
        <h2
          id={titleId}
          style={{
            ...titleStyle,
            fontSize: 19,
            lineHeight: 1.35,
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <span>{t("New name:")}</span>
          <span
            style={{
              display: "inline-grid",
              alignItems: "baseline",
              overflow: "hidden",
              paddingRight: 2,
            }}
          >
            <span
              className="cn-old"
              style={{ gridArea: "1 / 1", color: ink.muted, textDecoration: "line-through" }}
            >
              {t(entry.rename.from)}
            </span>
            <span className="cn-new" style={{ gridArea: "1 / 1", color: ink.mint }}>
              {t(entry.rename.to)}
            </span>
          </span>
        </h2>
        {body && <p style={{ margin: 0, color: ink.body, lineHeight: 1.45 }}>{body}</p>}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            data-testid="change-notice-got-it"
            onClick={onDismiss}
            style={primaryButton(false)}
          >
            {t("Got it")}
          </button>
          {guide}
        </div>
      </>
    );
  } else if (variant === "moved" && entry.moved) {
    padding = 0;
    gap = 0;
    content = (
      <>
        <div
          style={{
            padding: "16px 18px 12px",
            background: ink.stripGround,
            borderBottom: `1px solid ${ink.stripDivider}`,
          }}
        >
          <MovedStrip item={entry.moved.item} before={entry.moved.before} now={entry.moved.now} />
        </div>
        <div
          style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {label}
              <h2 id={titleId} style={titleStyle}>
                {title}
              </h2>
              {body && (
                <p style={{ margin: "2px 0 0", color: ink.body, lineHeight: 1.45 }}>{body}</p>
              )}
            </div>
            <DismissButton onClick={onDismiss} style={{ margin: "-6px -8px 0 0" }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {showMe}
            {guide}
          </div>
        </div>
      </>
    );
  } else if (variant === "welcome") {
    padding = 0;
    gap = 0;
    content = (
      <>
        <WelcomePreview />
        <div
          style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {label}
              <h2 id={titleId} style={titleStyle}>
                {title}
              </h2>
            </div>
            <DismissButton onClick={onDismiss} style={{ margin: "-6px -8px 0 0" }} />
          </div>
          <CheckList items={items} indent={false} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              data-testid="change-notice-keep"
              onClick={onKeep ?? onDismiss}
              style={primaryButton(false)}
            >
              {t("Keep the new look")}
            </button>
            <button
              type="button"
              data-testid="change-notice-switch-back"
              onClick={onSwitchBack}
              style={{
                ...buttonBase,
                padding: "0 14px",
                border: `1px solid ${ink.ghostBorder}`,
                background: "transparent",
                color: ink.title,
                fontWeight: 500,
              }}
            >
              {t("Switch back")}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: ink.smallPrint, lineHeight: 1.4 }}>
            {t("You can change this any time in Settings › Preferences.")}
          </p>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <IconTile />
          <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {label}
            <h2 id={titleId} style={titleStyle}>
              {title}
            </h2>
          </div>
          <DismissButton onClick={onDismiss} style={{ margin: "-6px -8px 0 0" }} />
        </div>
        {items.length > 0 && <CheckList items={items} indent />}
        {body && (
          <p style={{ margin: 0, paddingLeft: 48, color: ink.body, lineHeight: 1.45 }}>{body}</p>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 48 }}>
          {showMe}
          {guide}
        </div>
      </>
    );
  }

  return (
    <section
      role="status"
      aria-labelledby={titleId}
      data-testid="change-notice"
      className="cn-card"
      style={{
        position: "fixed",
        right: 40,
        bottom: 40,
        width: 432,
        maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
        zIndex: theme.zIndex.modal - 1,
        background: ink.card,
        color: ink.title,
        borderRadius: 6,
        boxShadow: ink.cardShadow,
        fontSize: 14,
        overflow: padding === 0 ? "hidden" : undefined,
        padding,
        display: "flex",
        flexDirection: "column",
        gap,
      }}
    >
      {content}
    </section>
  );
}
