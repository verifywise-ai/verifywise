/**
 * Compatibility export. New screens should import StatusBadge.
 * Existing call sites keep `import Chip from ".../Chip"`.
 */
export { default, VARIANT_COLORS, getChipColors } from "./StatusBadge";
