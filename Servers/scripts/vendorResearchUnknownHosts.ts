#!/usr/bin/env ts-node
/**
 * Lists the hosts the source registry has not reviewed that findings cited (spec D3.3, Ruling 13 of
 * the M2 plan), for the maintainer who reviews the registry (services/vendorResearch/
 * sourceRegistry/): the trace of each completed run lists them, and the script counts, over the
 * runs of every organization in the last days, the runs that cited each host and their
 * organizations. It only reads, and it prints host names and counts, never an organization, a
 * vendor or an address. Runs from before the credibility rules have no such list and count for
 * nothing.
 *
 * Exit codes:
 *   0 - the hosts were printed, or there were none
 *   2 - an argument is not one of the options, or the database could not be read
 *
 * Usage:
 *   cd Servers && npx ts-node scripts/vendorResearchUnknownHosts.ts [--days N] [--limit N]
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

const USAGE =
  "Usage: npx ts-node scripts/vendorResearchUnknownHosts.ts [--days N (1 to 3650, default 90)] [--limit N (1 to 500, default 50)]";

/** Each option with its default and its greatest value; the least is 1. */
const OPTIONS = {
  "--days": { fallback: 90, max: 3650 },
  "--limit": { fallback: 50, max: 500 },
} as const;
type Option = keyof typeof OPTIONS;

/** A host and how often findings cited it: in how many runs, of how many organizations. */
export interface UnknownHost {
  host: string;
  runs: number;
  organizations: number;
}

/** The name of an error, never its message, which can hold the address of the database. */
const nameOf = (error: unknown): string => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z_$][\w$.]{0,59}$/.test(name) ? name : "unknown";
};

/**
 * The hosts in the traces of the completed runs of every organization created in the last `days`
 * days, each with the runs that cited it, once per run, and their organizations; most runs first,
 * then by name, at most `limit`. A SELECT across organizations (Ruling 13 of the M2 plan).
 */
export async function unknownHostsQuery(days: number, limit: number): Promise<UnknownHost[]> {
  const rows = await sequelize.query<{
    host: string;
    runs: string | number;
    organizations: string | number;
  }>(
    `SELECT h.host,
            COUNT(DISTINCT r.id) AS runs,
            COUNT(DISTINCT r.organization_id) AS organizations
       FROM vendor_research_runs AS r
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(r.trace -> 'cited' -> 'unreviewedHosts') = 'array'
             THEN r.trace -> 'cited' -> 'unreviewedHosts'
             ELSE '[]'::jsonb END
      ) AS h(host)
      WHERE r.status = 'completed'
        AND r.created_at >= NOW() - (:days * INTERVAL '1 day')
        AND h.host IS NOT NULL
      GROUP BY h.host
      ORDER BY runs DESC, h.host ASC
      LIMIT :limit`,
    { replacements: { days, limit }, type: QueryTypes.SELECT },
  );
  return rows.map((row) => ({
    host: row.host,
    runs: Number(row.runs),
    organizations: Number(row.organizations),
  }));
}

const isOption = (name: string): name is Option => name === "--days" || name === "--limit";

/** The options of the command line, or the reason they are refused. */
function optionsOf(argv: readonly string[]): { days: number; limit: number } | string {
  const given = new Map<Option, number>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (!isOption(option)) return `Unknown argument: ${option}.`;
    if (given.has(option)) return `${option} is given twice.`;
    const value = argv[index + 1] ?? "";
    // A whole number written as one, without a sign, a fraction or a leading zero.
    const number = /^[1-9]\d{0,3}$/.test(value) ? Number(value) : NaN;
    if (!(number >= 1 && number <= OPTIONS[option].max)) {
      return `${option} takes a whole number from 1 to ${OPTIONS[option].max}.`;
    }
    given.set(option, number);
  }
  return {
    days: given.get("--days") ?? OPTIONS["--days"].fallback,
    limit: given.get("--limit") ?? OPTIONS["--limit"].fallback,
  };
}

/** A host as a terminal prints it: a control character, which no host name holds, as "?". */
const printable = (host: string): string => host.replace(/[\u0000-\u001f\u007f-\u009f]/g, "?");

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export async function main(
  argv: string[],
  out: (text: string) => void = (text) => console.log(text),
  err: (text: string) => void = (text) => console.error(text),
  query: (days: number, limit: number) => Promise<UnknownHost[]> = unknownHostsQuery,
): Promise<number> {
  const options = optionsOf(argv);
  if (typeof options === "string") {
    err(`${options} ${USAGE}`);
    return 2;
  }
  const { days, limit } = options;
  let hosts: UnknownHost[];
  try {
    hosts = await query(days, limit);
  } catch (error) {
    err(`The hosts could not be read (${nameOf(error)}).`);
    return 2;
  }
  const window = days === 1 ? "the last day" : `the last ${days} days`;
  if (hosts.length === 0) {
    out(
      `No finding of a completed run in ${window} cited a host the source registry has not reviewed.`,
    );
    return 0;
  }
  out(
    `Hosts the source registry has not reviewed, cited by findings of completed runs in ${window} (at most ${limit}, by runs):`,
  );
  for (const { host, runs, organizations } of hosts) {
    out(`${printable(host)}: ${plural(runs, "run")}, ${plural(organizations, "organization")}`);
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error: unknown) => {
      console.error(`The hosts could not be read (${nameOf(error)}).`);
      return 2;
    })
    .then(async (code) => {
      await sequelize.close().catch(() => undefined);
      process.exit(code);
    });
}
