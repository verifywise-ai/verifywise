/**
 * The command line of the evaluation (`npm run eval:vendor-research`).
 *
 * By default it replays the cases of eval/cases and prints one block of measures for each, then
 * exits 1 if something needs a person: a target that is missed and is not a declared gap (a
 * regression), or a declared gap that is met (to be deleted from the case). `--live` runs one
 * vendor for real, with the organization's LLM key, the live search feed and the live pages, and
 * prints the same measures and the findings that stayed; with `--record <file>` it also writes what
 * the model and the web answered, as the start of a new case, and with `--trace <file>` the trace
 * of the run (every step with its time, every model call with its tokens), which is what the
 * budgets are tuned from.
 */
import { writeFileSync } from "fs";
import {
  VENDOR_BUSINESS_CRITICALITY_ENUM,
  VENDOR_DATA_SENSITIVITY_ENUM,
  VENDOR_REGULATORY_EXPOSURE_ENUM,
} from "../../../utils/validations/vendorValidation.utils";
import { EVAL_CASES } from "./cases";
import { type CaseReport, formatReport, isClean, reportCase } from "./report";
import { type CaseRun, runEvalCase } from "./runCase";
import type { EvalCase, EvalVendor, Recording } from "./types";

export interface LiveOptions {
  orgId: number;
  vendor: string;
  website: string;
  provides: string;
  /** The answers of the vendor's scorecard that were given; absent when none was. */
  scorecard?: NonNullable<EvalVendor["scorecard"]>;
}

export interface CliOptions {
  cases: string[] | null;
  json: boolean;
  live: LiveOptions | null;
  record: string | null;
  trace: string | null;
  help: boolean;
}

export type Parsed = { ok: true; options: CliOptions } | { ok: false; message: string };

export const USAGE = [
  "Usage: npm run eval:vendor-research -- [options]",
  "",
  "  --cases <id,id>      Run only these cases (default: all)",
  "  --json               Print the reports as JSON",
  "  --live               Run one vendor for real, with the key of an organization",
  "    --org <id>           The organization whose LLM key is used",
  "    --vendor <name>      The vendor's name",
  "    --website <domain>   The vendor's website (optional)",
  "    --provides <text>    What the vendor provides (optional)",
  "    --data-sensitivity <text>, --business-criticality <text>, --regulatory-exposure <text>",
  "                         The vendor's scorecard answers, worded as the vendor form words them",
  "                         (optional); the analysis reads them as the materiality of the vendor",
  "    --record <file>      Write what the model and the web answered, as a case to complete",
  "    --trace <file>       Write the trace of the run: its steps, model calls and times",
  "  --help               Print this text",
  "",
  "Exit code: 0 when nothing needs a person, 1 for a regression or a gap that is already met,",
  "2 for arguments that cannot be used.",
].join("\n");

/** The scorecard options, each with the field it fills and the values the vendor form offers. */
const SCORECARD_OPTIONS = [
  ["--data-sensitivity", "data_sensitivity", VENDOR_DATA_SENSITIVITY_ENUM],
  ["--business-criticality", "business_criticality", VENDOR_BUSINESS_CRITICALITY_ENUM],
  ["--regulatory-exposure", "regulatory_exposure", VENDOR_REGULATORY_EXPOSURE_ENUM],
] as const;

const VALUE_OPTIONS = [
  "--cases",
  "--org",
  "--vendor",
  "--website",
  "--provides",
  "--record",
  "--trace",
  ...SCORECARD_OPTIONS.map(([option]) => option),
];

export function parseArgs(argv: string[]): Parsed {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (VALUE_OPTIONS.includes(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, message: `${arg} needs a value` };
      }
      values.set(arg, value);
      index += 1;
    } else if (arg === "--json" || arg === "--live" || arg === "--help") {
      flags.add(arg);
    } else {
      return { ok: false, message: `Unknown option ${arg}` };
    }
  }

  const live = flags.has("--live");
  if (values.has("--record") && !live) return { ok: false, message: "--record needs --live" };
  if (values.has("--trace") && !live) return { ok: false, message: "--trace needs --live" };
  const scorecard: NonNullable<EvalVendor["scorecard"]> = {};
  for (const [option, field, allowed] of SCORECARD_OPTIONS) {
    const value = values.get(option);
    if (value === undefined) continue;
    if (!live) return { ok: false, message: `${option} needs --live` };
    if (!(allowed as readonly string[]).includes(value)) {
      return { ok: false, message: `${option} must be one of: ${allowed.join(", ")}` };
    }
    Object.assign(scorecard, { [field]: value });
  }
  let liveOptions: LiveOptions | null = null;
  if (live) {
    if (values.has("--cases")) return { ok: false, message: "--live runs a vendor, not --cases" };
    const org = values.get("--org");
    if (org === undefined) return { ok: false, message: "--live needs --org <id>" };
    if (!/^[1-9]\d*$/.test(org)) return { ok: false, message: "--org must be a whole number" };
    const vendor = values.get("--vendor");
    if (vendor === undefined) return { ok: false, message: "--live needs --vendor <name>" };
    liveOptions = {
      orgId: Number(org),
      vendor,
      website: values.get("--website") ?? "",
      provides: values.get("--provides") ?? "",
      ...(Object.keys(scorecard).length > 0 ? { scorecard } : {}),
    };
  }

  return {
    ok: true,
    options: {
      cases: values.has("--cases") ? values.get("--cases")!.split(",") : null,
      json: flags.has("--json"),
      live: liveOptions,
      record: values.get("--record") ?? null,
      trace: values.get("--trace") ?? null,
      help: flags.has("--help"),
    },
  };
}

export interface CliDeps {
  cases?: readonly EvalCase[];
  out?: (text: string) => void;
  err?: (text: string) => void;
  writeFile?: (path: string, text: string) => void;
  runLive?: (
    options: LiveOptions,
    record: boolean,
  ) => Promise<{ run: CaseRun; recording: Recording | null }>;
}

/** The findings that stayed after a live run, one block each, for a person to judge. */
function describeFindings(run: CaseRun): string[] {
  if (run.kept.length === 0) return ["No finding stayed."];
  return run.kept.flatMap((finding, index) => [
    `${index + 1}. [${finding.category}] ${finding.risk_level}, confidence ${finding.confidence}, ` +
      `credibility ${run.credibility[index]?.label ?? "-"}: ${finding.risk_description}`,
    ...finding.sources.map((source) => `     ${source.url}`),
  ]);
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.out ?? ((text: string) => console.log(text));
  const err = deps.err ?? ((text: string) => console.error(text));

  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    err(`${parsed.message}\n\n${USAGE}`);
    return 2;
  }
  const { options } = parsed;
  if (options.help) {
    out(USAGE);
    return 0;
  }

  if (options.live) {
    try {
      const runLive = deps.runLive ?? (await import("./live")).runLive;
      const { run, recording } = await runLive(options.live, options.record !== null);
      const report = reportCase(run);
      out(options.json ? JSON.stringify([report], null, 2) : formatReport([report]));
      if (!options.json) out(["", ...describeFindings(run)].join("\n"));
      if (options.trace !== null) {
        (deps.writeFile ?? writeFileSync)(options.trace, JSON.stringify(run.trace, null, 2));
        out(`Trace written to ${options.trace}`);
      }
      if (options.record !== null && recording !== null) {
        const { vendor } = options.live;
        const write = deps.writeFile ?? writeFileSync;
        write(
          options.record,
          JSON.stringify(
            {
              vendor: {
                name: vendor,
                website: options.live.website,
                provides: options.live.provides,
                ...(options.live.scorecard ? { scorecard: options.live.scorecard } : {}),
              },
              now: run.evalCase.now,
              ...(run.evalCase.gather ? { gather: true } : {}),
              ...(run.evalCase.perCategory ? { perCategory: true } : {}),
              ...(run.evalCase.verifier ? { verifier: true } : {}),
              recording,
            },
            null,
            2,
          ),
        );
        out(`Recording written to ${options.record}`);
      }
      return 0;
    } catch (error) {
      err(`The live run failed: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  const all = deps.cases ?? EVAL_CASES;
  let selected = all;
  if (options.cases !== null) {
    const unknown = options.cases.find((id) => !all.some((evalCase) => evalCase.id === id));
    if (unknown !== undefined) {
      err(
        `Unknown case "${unknown}". The cases are: ${all.map((evalCase) => evalCase.id).join(", ")}`,
      );
      return 2;
    }
    selected = all.filter((evalCase) => options.cases!.includes(evalCase.id));
  }

  const reports: CaseReport[] = [];
  for (const evalCase of selected) reports.push(reportCase(await runEvalCase(evalCase)));
  out(options.json ? JSON.stringify(reports, null, 2) : formatReport(reports));
  return isClean(reports) ? 0 : 1;
}
