import useTranslation from "../../../application/hooks/useTranslation";
import { inkPalette as ink } from "./inkPalette";

const FLAT_LINES = ["70px", "56px", "64px", "48px", "72px", "60px", "52px", "66px", "58px"];

const line = (width: string | number, background: string = ink.previewLine) => ({
  height: 5,
  width,
  borderRadius: 2,
  background,
});

const groupLabel = {
  fontSize: 6,
  fontWeight: 600,
  color: ink.previewBrand,
  marginTop: 4,
} as const;

/** Old look wipes into the new one (board W2). Decorative, with a text label. */
export default function WelcomePreview() {
  const { t } = useTranslation();
  return (
    <div
      role="img"
      aria-label={t(
        "The old look, with an app switcher and a flat menu, gives way to the new look with one grouped sidebar",
      )}
      style={{
        position: "relative",
        height: 150,
        margin: "16px 16px 0",
        borderRadius: 4,
        overflow: "hidden",
        border: `1px solid ${ink.previewBorder}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: ink.previewOldGround,
          display: "flex",
        }}
      >
        <div
          style={{
            width: 22,
            background: ink.previewRail,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 7,
            paddingTop: 10,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{ width: 10, height: 10, borderRadius: 2, background: ink.previewRailDot }}
            />
          ))}
        </div>
        <div
          style={{
            width: 92,
            borderRight: `1px solid ${ink.previewEdge}`,
            background: ink.previewPaper,
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {FLAT_LINES.map((w, i) => (
            <div key={i} style={line(w)} />
          ))}
        </div>
        <div
          style={{
            flex: "1 1 auto",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{ width: 90, height: 7, borderRadius: 2, background: ink.previewLineStrong }}
          />
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                height: 46,
                border: `1px solid ${ink.previewEdge}`,
                borderRadius: 3,
                background: ink.previewPaper,
              }}
            />
          ))}
        </div>
      </div>

      <div
        className="cn-wipe"
        style={{ position: "absolute", inset: 0, background: ink.previewPaper, display: "flex" }}
      >
        <div
          style={{
            width: 114,
            borderRight: `1px solid ${ink.previewEdge}`,
            padding: "10px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{ ...line(54, ink.previewBrand), height: 6, marginBottom: 4 }} />
          <div style={line(60)} />
          <div
            style={{
              height: 9,
              borderRadius: 2,
              background: ink.previewBrandTint,
              display: "flex",
              alignItems: "center",
              paddingLeft: 4,
            }}
          >
            <div style={{ ...line(40, ink.previewBrand), height: 4 }} />
          </div>
          <div style={groupLabel}>{t("Record")}</div>
          <div style={line(66)} />
          <div style={line(52)} />
          <div style={groupLabel}>{t("Track")}</div>
          <div style={line(58)} />
          <div style={groupLabel}>{t("Enforce")}</div>
          <div style={line(62)} />
        </div>
        <div
          style={{
            flex: "1 1 auto",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ width: 70, height: 7, borderRadius: 2, background: ink.whiteText }} />
          <div
            style={{
              height: 52,
              border: `1px solid ${ink.previewEdge}`,
              borderRadius: 3,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: 8,
            }}
          >
            {[
              [ink.previewAlert, 110],
              [ink.previewNeutral, 90],
              [ink.previewAlert, 120],
            ].map(([dot, width], i) => (
              <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <div
                  style={{ width: 5, height: 5, borderRadius: "50%", background: dot as string }}
                />
                <div style={{ ...line(width as number, ink.previewLineStrong), height: 4 }} />
              </div>
            ))}
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{ height: 30, border: `1px solid ${ink.previewEdge}`, borderRadius: 3 }}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        className="cn-handle"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 2,
          marginLeft: -1,
          background: ink.mint,
          boxShadow: "0 0 10px rgba(111,207,166,.8)",
        }}
      />
      <span
        className="cn-before"
        style={{
          position: "absolute",
          left: 8,
          bottom: 6,
          padding: "1px 6px",
          borderRadius: 2,
          background: ink.previewBadgeGround,
          color: ink.title,
          fontSize: 10,
        }}
      >
        {t("Before")}
      </span>
      <span
        style={{
          position: "absolute",
          right: 8,
          bottom: 6,
          padding: "1px 6px",
          borderRadius: 2,
          background: ink.previewBrand,
          color: ink.title,
          fontSize: 10,
        }}
      >
        {t("Now")}
      </span>
    </div>
  );
}
