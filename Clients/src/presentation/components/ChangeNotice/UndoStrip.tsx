import { useTheme } from "@mui/material/styles";
import useTranslation from "../../../application/hooks/useTranslation";
import { inkPalette as ink } from "./inkPalette";

/** Shown for a few seconds after a dismissal so it can be taken back. */
export default function UndoStrip({
  onUndo,
  global = false,
}: {
  onUndo: () => void;
  global?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <div
      role="status"
      data-testid="change-notice-undo-strip"
      style={{
        position: "fixed",
        right: 40,
        bottom: 40,
        maxWidth: "calc(100vw - 80px)",
        boxSizing: "border-box",
        zIndex: theme.zIndex.modal - 1,
        background: ink.card,
        color: ink.body,
        borderRadius: 6,
        boxShadow: ink.cardShadow,
        padding: "8px 8px 8px 16px",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>
        {global ? t("You won't see this again.") : t("You won't see this again on this page.")}
      </span>
      <button
        type="button"
        data-testid="change-notice-undo"
        onClick={onUndo}
        style={{
          height: 34,
          padding: "0 12px",
          border: 0,
          borderRadius: 4,
          background: "transparent",
          color: ink.mint,
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("Undo")}
      </button>
    </div>
  );
}
