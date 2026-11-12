import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMediaQuery } from "@mui/material";
import { toggleSidebar } from "../redux/ui/uiSlice";

/**
 * Collapses the sidebar while the viewport is narrower than `minWidth`.
 *
 * Only undoes its own work: when the viewport widens again, or the page using
 * the hook unmounts, the sidebar is expanded only if this hook collapsed it and
 * it is still collapsed. A sidebar the user collapsed by hand stays collapsed.
 */
export function useAutoCollapseSidebar(minWidth = 1024) {
  const dispatch = useDispatch();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collapsed: boolean = useSelector((state: any) => Boolean(state.ui?.sidebar?.collapsed));
  const isNarrow = useMediaQuery(`(max-width:${minWidth - 0.02}px)`);
  const autoCollapsed = useRef(false);
  const collapsedRef = useRef(collapsed);

  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  useEffect(() => {
    if (isNarrow && !collapsedRef.current) {
      collapsedRef.current = true;
      autoCollapsed.current = true;
      dispatch(toggleSidebar());
    } else if (!isNarrow && autoCollapsed.current) {
      autoCollapsed.current = false;
      if (collapsedRef.current) {
        collapsedRef.current = false;
        dispatch(toggleSidebar());
      }
    }
  }, [isNarrow, dispatch]);

  useEffect(
    () => () => {
      if (autoCollapsed.current && collapsedRef.current) dispatch(toggleSidebar());
    },
    [dispatch],
  );
}
