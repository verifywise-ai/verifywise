import { useEffect, useRef, useState } from "react";
import type { FC, ReactNode } from "react";
import { TableContainer } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

interface ScrollableTableContainerProps {
  /** Names the region once it takes keyboard focus. */
  ariaLabel: string;
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * TableContainer that becomes a keyboard-focusable region only while its table
 * overflows. A scrolling region with nothing focusable inside is unreachable by
 * keyboard (axe: scrollable-region-focusable); when the table fits, there is no
 * extra tab stop or landmark.
 */
export const ScrollableTableContainer: FC<ScrollableTableContainerProps> = ({
  ariaLabel,
  children,
  sx,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setOverflows(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <TableContainer
      ref={ref}
      sx={sx}
      {...(overflows ? { "tabIndex": 0, "role": "region", "aria-label": ariaLabel } : {})}
    >
      {children}
    </TableContainer>
  );
};

export default ScrollableTableContainer;
