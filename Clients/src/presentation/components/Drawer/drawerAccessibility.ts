export const DRAWER_TITLE_ID = "framework-drawer-title";

export const drawerAccessibilityProps = {
  slotProps: {
    root: {
      "aria-labelledby": DRAWER_TITLE_ID,
    },
  },
} as const;
