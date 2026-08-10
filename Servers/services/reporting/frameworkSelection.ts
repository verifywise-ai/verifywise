/**
 * @fileoverview Parsing for a report's framework selection.
 *
 * Native frameworks (`frameworks`) and plugin/custom frameworks
 * (`custom_frameworks`) are separate tables with independent SERIAL ids, so a
 * bare `2` is ambiguous. Every stored selection therefore carries a namespace:
 *
 *   native:<frameworks.id>                      the four built-in frameworks
 *   plugin:<custom_framework_definitions.key>   portable; what a system template seeds
 *   custom:<custom_frameworks.id>               concrete; one organization's row
 *
 * A bare integer is accepted as `native:<n>` for forgiveness, never emitted.
 *
 * An empty selection means EVERY framework in scope. That is the whole
 * backward-compatibility story: schedules written before this column existed
 * carry NULL and must keep behaving exactly as they did.
 *
 * @module services/reporting/frameworkSelection
 */

export interface ParsedFrameworkSelection {
  /** frameworks.id values. */
  native: number[];
  /** custom_framework_definitions.plugin_key values. */
  plugin: string[];
  /** custom_frameworks.id values. */
  custom: number[];
  /** Entries matching no known form, kept so a caller can reject or report them. */
  invalid: string[];
}

const NATIVE = /^native:(\d+)$/;
const CUSTOM = /^custom:(\d+)$/;
// Lower-case only: plugin_key is a slug, and accepting "SOC2" as well as
// "soc2" would make two spellings of one framework look like two frameworks.
const PLUGIN = /^plugin:([a-z0-9][a-z0-9_-]*)$/;
const BARE = /^\d+$/;

function pushUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

export function parseFrameworkSelection(raw: unknown): ParsedFrameworkSelection {
  const out: ParsedFrameworkSelection = { native: [], plugin: [], custom: [], invalid: [] };
  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    const text =
      typeof entry === "number" ? String(entry) : typeof entry === "string" ? entry.trim() : null;
    if (text === null) {
      pushUnique(out.invalid, String(entry));
      continue;
    }

    // An id of 0 is rejected everywhere below. collectAllData gates framework
    // sections on === 1/2/3/4, so a 0 silently empties every one of them.
    const bare = BARE.exec(text);
    if (bare) {
      const id = Number(bare[0]);
      id > 0 ? pushUnique(out.native, id) : pushUnique(out.invalid, text);
      continue;
    }

    const native = NATIVE.exec(text);
    if (native) {
      const id = Number(native[1]);
      id > 0 ? pushUnique(out.native, id) : pushUnique(out.invalid, text);
      continue;
    }

    const custom = CUSTOM.exec(text);
    if (custom) {
      const id = Number(custom[1]);
      id > 0 ? pushUnique(out.custom, id) : pushUnique(out.invalid, text);
      continue;
    }

    const plugin = PLUGIN.exec(text);
    if (plugin) {
      pushUnique(out.plugin, plugin[1]);
      continue;
    }

    pushUnique(out.invalid, text);
  }

  return out;
}

/** True when nothing resolvable was selected — i.e. "every framework in scope". */
export function isEmptySelection(p: ParsedFrameworkSelection): boolean {
  return p.native.length === 0 && p.plugin.length === 0 && p.custom.length === 0;
}
