/**
 * The config columns of a report template version, with the value a first
 * version gets when the caller sends none.
 *
 * This is the one list of them: createTemplateVersionQuery inserts these
 * columns, the template controller treats any of them in a PATCH body as
 * "append a version", and duplicateTemplate copies them. It lives in its own
 * module so tests that mock reportTemplate.utils still see the real list.
 */
export const VERSION_JSON_COLUMNS: ReadonlyArray<{ column: string; fallback: string }> = [
  { column: "sections_config", fallback: "jsonb_build_object('sections', jsonb_build_array())" },
  { column: "ai_blocks_config", fallback: "'{}'::jsonb" },
  { column: "framework_config", fallback: "'{}'::jsonb" },
  { column: "parameters_config", fallback: "'{}'::jsonb" },
  { column: "format_config", fallback: "'{}'::jsonb" },
  { column: "branding_config", fallback: "'{}'::jsonb" },
  { column: "schedule_defaults", fallback: "'{}'::jsonb" },
  { column: "delivery_defaults", fallback: "'{}'::jsonb" },
];

export const VERSION_CONFIG_COLUMNS: readonly string[] = VERSION_JSON_COLUMNS.map((c) => c.column);
