import { useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { inkPalette as ink } from "./inkPalette";

interface ShowMeHighlightProps {
  testId: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const findTarget = (testId: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

/** Pulsing ring around the element a notice points at ("Show me"). Pointer events pass through. */
export default function ShowMeHighlight({ testId }: ShowMeHighlightProps) {
  const theme = useTheme();
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const target = findTarget(testId);
    if (!target) return undefined;
    target.scrollIntoView?.({ block: "nearest" });

    const measure = () => {
      const box = target.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [testId]);

  if (!rect) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="change-notice-ring"
      className="cn-ring"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        outline: `2px solid ${ink.ring}`,
        outlineOffset: 2,
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: theme.zIndex.modal - 1,
      }}
    />
  );
}
