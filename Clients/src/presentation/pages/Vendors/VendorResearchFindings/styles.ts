/**
 * The house control height, 30px, for the buttons of this section. The shared button takes its
 * height from its `size` (28px small, 34px medium); this sets it right after, as `sx`.
 */
export const controlHeightSx = { height: "30px", minHeight: "30px" };

/** The same height for a button that is only an icon, which is square. */
export const iconControlSx = { ...controlHeightSx, width: "30px" };
