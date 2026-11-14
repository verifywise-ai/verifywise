import { isClassicUi } from "../../themes/uiStyle";

/**
 * Height of a sidebar row: nav items, sub-items and the footer rows
 * (demo data, Settings, Management). The new look uses 30px; classic keeps 32px.
 * Popover menu items opened from the footer keep their own height.
 */
export const SIDEBAR_ROW_HEIGHT = isClassicUi() ? "32px" : "30px";
