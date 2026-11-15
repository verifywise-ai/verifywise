import { body } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

/** Far more than the dashboard has widgets; keeps the stored JSON bounded. */
export const MAX_DASHBOARD_LAYOUT_ENTRIES = 200;

const ENTRY_FIELDS = new Set(["widgetKey", "visible", "position"]);
// e.g. "operations.task-radar". The registry that owns the keys is in the
// frontend, and an unknown key is ignored there, so only the form is checked.
const WIDGET_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const hasDuplicates = (values: unknown[]) => new Set(values).size !== values.length;

const isEntry = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const validateUpdateDashboardPreferences = [
  body("layout")
    .isArray({ max: MAX_DASHBOARD_LAYOUT_ENTRIES })
    .withMessage(`layout must be an array of at most ${MAX_DASHBOARD_LAYOUT_ENTRIES} entries`)
    .bail()
    .custom((layout: unknown[]) => {
      const entries = layout.filter(isEntry);
      return (
        !hasDuplicates(entries.map((entry) => entry.widgetKey)) &&
        !hasDuplicates(entries.map((entry) => entry.position))
      );
    })
    .withMessage("layout must not repeat a widgetKey or a position"),
  body("layout.*")
    .custom((entry) => isEntry(entry) && Object.keys(entry).every((key) => ENTRY_FIELDS.has(key)))
    .withMessage("each layout entry must be an object with widgetKey, visible and position only"),
  body("layout.*.widgetKey")
    .isString()
    .isLength({ min: 1, max: 100 })
    .matches(WIDGET_KEY_PATTERN)
    .withMessage("widgetKey must be 1-100 lower case letters, digits, dots or hyphens"),
  body("layout.*.visible")
    .custom((visible) => typeof visible === "boolean")
    .withMessage("visible must be a boolean"),
  body("layout.*.position")
    .custom(
      (position) =>
        Number.isInteger(position) && position >= 0 && position < MAX_DASHBOARD_LAYOUT_ENTRIES,
    )
    .withMessage(`position must be an integer from 0 to ${MAX_DASHBOARD_LAYOUT_ENTRIES - 1}`),
  handleValidationErrors,
];
