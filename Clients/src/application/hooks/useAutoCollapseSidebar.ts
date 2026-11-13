import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMediaQuery } from "@mui/material";
import { setSidebarCollapsed } from "../redux/ui/uiSlice";
import type { RootState } from "../redux/store";

/**
 * Collapses the sidebar while the viewport is narrower than `minWidth`.
 *
 * Only undoes its own work: when the viewport widens again, or the component
 * using the hook unmounts, the sidebar is expanded only if this hook collapsed
 * it. Once the user expands the sidebar by hand, the hook lets go, so a later
 * manual collapse is the user's and stays.
 */
export function useAutoCollapseSidebar(minWidth = 1024) {
  const dispatch = useDispatch();
  const collapsed = useSelector((state: RootState) => Boolean(state.ui?.sidebar?.collapsed));
  const isNarrow = useMediaQuery(`(max-width:${minWidth - 0.02}px)`);
  const autoCollapsed = useRef(false);
  const collapsedRef = useRef(collapsed);

  // Declared first so it runs before the collapse effect on the same commit.
  useEffect(() => {
    collapsedRef.current = collapsed;
    if (!collapsed) autoCollapsed.current = false;
  }, [collapsed]);

  useEffect(() => {
    if (isNarrow && !collapsedRef.current) {
      autoCollapsed.current = true;
      dispatch(setSidebarCollapsed(true));
    } else if (!isNarrow && autoCollapsed.current) {
      autoCollapsed.current = false;
      dispatch(setSidebarCollapsed(false));
    }
  }, [isNarrow, dispatch]);

  useEffect(
    () => () => {
      if (autoCollapsed.current) dispatch(setSidebarCollapsed(false));
    },
    [dispatch],
  );
}
