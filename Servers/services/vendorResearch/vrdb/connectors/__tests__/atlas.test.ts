/**
 * The MITRE ATLAS connector (spec D2.15, Q32): the case studies of the atlas-data repository as
 * records of the vendor risk database. The fixtures are written from the schema of the format 6 file
 * and of the manifest, with fictional vendors and invented values; the case studies AML.CS0902 and
 * AML.CS0903 carry a synthetic prompt injection in the shape of the one that the real AML.CS0046
 * holds (an order to run a command, a base64 string piped into a shell), which no record may keep
 * (R10.1). Two groups of tests are about hostile input and are written for it: the cleaner of the
 * text (`cleanCaseStudyText`) and the guards on the YAML.
 */
import fs from "fs";
import path from "path";
import { parse as parseYaml, stringify } from "yaml";
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ConditionalResponse } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import {
  ATLAS_DIST_URL,
  ATLAS_MANIFEST_URL,
  ATLAS_MAX_BYTES,
  ATLAS_RECORD_MARK,
  ATLAS_SUMMARY_CHARS,
  atlasConnector,
  atlasKeysOf,
  atlasUnreadableAllowed,
  cleanCaseStudyText,
  newestV6Release,
} from "../atlas";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError } from "../types";

const read = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const MANIFEST = read("atlas-manifest.yaml");
const V6 = read("atlas-v6.yaml");
const V5 = read("atlas-v5.yaml");

const DATA_URL = `${ATLAS_DIST_URL}v6/ATLAS-2030.02.yaml`;
const YAML_TYPES = [
  "text/plain",
  "application/yaml",
  "application/x-yaml",
  "application/octet-stream",
];
const cp = (...codes: number[]) => String.fromCodePoint(...codes);

type Snapshot = Parameters<typeof atlasConnector.parse>[0];
const snapshotOf = (body: string, release?: string): Snapshot => ({
  bodies: release === undefined ? [body] : [body, release],
  etag: null,
  lastModified: null,
  bytes: body.length,
});
/** The fixture (or `body`) parsed, with the release name 2030.02; `parse(body, undefined)` gives no release. */
const parse = (body: string = V6, ...release: [string?]) =>
  atlasConnector.parse(snapshotOf(body, release.length > 0 ? release[0] : "2030.02"));
const recordOf = (id: string, body: string = V6): ParsedRecord => {
  const found = parse(body).records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}`);
  return found;
};

type Fields = Record<string, unknown>;

/** The fixture as an object, changed by `change`, written as YAML again. */
const edited = (change: (file: Fields) => void, body: string = V6): string => {
  const file: Fields = parseYaml(body, { schema: "core" });
  change(file);
  return stringify(file);
};

/** A case study that reads, with these fields changed (`undefined` takes a field away). */
const study = (n: number, fields: Record<string, unknown> = {}): Record<string, unknown> => {
  const id = `AML.CS${String(n).padStart(4, "0")}`;
  const entry: Record<string, unknown> = {
    id,
    name: `Study number ${n}`,
    description: `Description of study ${n}.`,
    type: "Exercise",
    target: `Target${n} Product`,
    "start-date": "2029-05-05",
    ...fields,
  };
  for (const key of Object.keys(entry)) if (entry[key] === undefined) delete entry[key];
  return entry;
};
/** A file of format 6 whose case studies are these entries, each under the key of its `id`. */
const fileOf = (entries: Array<Record<string, unknown>>): string =>
  stringify({
    "format-version": "6.1.0",
    "case-studies": Object.fromEntries(entries.map((entry) => [entry.id, entry])),
  });
const manyStudies = (count: number, unreadable: number): string =>
  fileOf(
    Array.from({ length: count }, (_, index) =>
      study(index, index < unreadable ? { name: "" } : {}),
    ),
  );

// ---------------------------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------------------------

const answer = (
  url: string,
  body: string,
  extra: Record<string, unknown> = {},
): ConditionalResponse =>
  ({
    notModified: false,
    url,
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: Buffer.from(body),
    truncated: false,
    etag: '"v2"',
    lastModified: null,
    ...extra,
  }) as ConditionalResponse;

/** A fetch that serves the manifest and then any file of the repository, and records the calls. */
function server(
  manifest: ConditionalResponse | string = MANIFEST,
  data: ConditionalResponse | string = V6,
) {
  const calls: Parameters<ConnectorFetch>[] = [];
  const fetch: ConnectorFetch = async (...args) => {
    calls.push(args);
    const [url] = args;
    if (url === ATLAS_MANIFEST_URL) {
      return typeof manifest === "string" ? answer(url, manifest) : manifest;
    }
    return typeof data === "string" ? answer(url, data) : data;
  };
  return { fetch, calls };
}

const NO_VALIDATORS = { etag: null, lastModified: null };

/** A manifest of releases, newest first, each with `[format, path]` versions. */
const manifestOf = (
  ...releases: Array<{ release: string; versions: Array<[string, string]> }>
): string =>
  stringify(
    releases.map(({ release, versions }) => ({
      release,
      "release-date": "2030-01-01",
      versions: versions.map(([format, versionPath]) => ({
        "format-version": format,
        path: versionPath,
      })),
    })),
  );

const OLDER_V6: { release: string; versions: Array<[string, string]> } = {
  release: "2030.01",
  versions: [["6.1.0", "v6/ATLAS-2030.01.yaml"]],
};

describe("atlasConnector.download", () => {
  it("reads the manifest, then the file of the newest release of format 6 with the stored validators", async () => {
    const modified = "Wed, 27 Feb 2030 09:00:00 GMT";
    const { fetch, calls } = server(MANIFEST, answer(DATA_URL, V6, { lastModified: modified }));
    const validators = { etag: '"v1"', lastModified: "Wed, 27 Feb 2030 10:00:00 GMT" };

    const snapshot = await atlasConnector.download(fetch, validators);

    expect(calls).toEqual([
      [
        ATLAS_MANIFEST_URL,
        {},
        { maxBytes: 256 * 1024, allowedContentTypes: YAML_TYPES, totalTimeoutMs: 30_000 },
      ],
      [
        DATA_URL,
        validators,
        { maxBytes: ATLAS_MAX_BYTES, allowedContentTypes: YAML_TYPES, totalTimeoutMs: 120_000 },
      ],
    ]);
    expect(ATLAS_MAX_BYTES).toBe(8 * 1024 * 1024);
    expect(snapshot).toEqual({
      bodies: [V6, "2030.02"],
      etag: '"v2"',
      lastModified: modified,
      bytes: Buffer.byteLength(V6),
    });
  });

  it("gives the release name to parse as the source version", async () => {
    const snapshot = await atlasConnector.download(server().fetch, NO_VALIDATORS);

    expect(snapshot).not.toBe("unchanged");
    if (snapshot === "unchanged") return;
    const parsed = atlasConnector.parse(snapshot);
    expect(parsed.sourceVersion).toBe("2030.02");
    expect(parsed.records).toHaveLength(5);
    expect(parsed.root).toBe("case-studies");
  });

  it("answers unchanged for a 304 of the file", async () => {
    const unchanged: ConditionalResponse = { notModified: true, url: DATA_URL };
    const { fetch, calls } = server(MANIFEST, unchanged);

    await expect(
      atlasConnector.download(fetch, { etag: '"v2"', lastModified: null }),
    ).resolves.toBe("unchanged");
    expect(calls).toHaveLength(2);
  });

  it("takes the first release of format 6 and skips the ones that have only an older format", async () => {
    const manifest = manifestOf(
      { release: "2030.03", versions: [["5.9.0", "legacy/ATLAS-5.9.0.yaml"]] },
      { release: "2030.02", versions: [["6.2.0", "v6/ATLAS-2030.02.yaml"]] },
      OLDER_V6,
    );
    const { fetch, calls } = server(manifest);

    await atlasConnector.download(fetch, NO_VALIDATORS);

    expect(calls[1][0]).toBe(DATA_URL);
  });

  it("takes the version of format 6 of a release that has several", async () => {
    const manifest = manifestOf({
      release: "2030.02",
      versions: [
        ["5.9.0", "legacy/ATLAS-5.9.0.yaml"],
        ["6.2.0", "v6/ATLAS-2030.02.yaml"],
      ],
    });
    const { fetch, calls } = server(manifest);

    await atlasConnector.download(fetch, NO_VALIDATORS);

    expect(calls[1][0]).toBe(DATA_URL);
  });

  it("takes a patch release, which the real manifest has had three times", async () => {
    const manifest = manifestOf(
      { release: "2030.02.2", versions: [["6.2.1", "v6/ATLAS-2030.02.2.yaml"]] },
      OLDER_V6,
    );
    const { fetch, calls } = server(manifest);

    const snapshot = await atlasConnector.download(fetch, NO_VALIDATORS);

    expect(calls[1][0]).toBe(`${ATLAS_DIST_URL}v6/ATLAS-2030.02.2.yaml`);
    expect(snapshot !== "unchanged" && snapshot.bodies[1]).toBe("2030.02.2");
  });

  it("fails as the wrong list when no release has a file of format 6, and asks for no file", async () => {
    const manifest = manifestOf(
      { release: "2030.02", versions: [["5.9.0", "legacy/ATLAS-5.9.0.yaml"]] },
      { release: "2030.01", versions: [["5.8.0", "legacy/ATLAS-5.8.0.yaml"]] },
    );
    const { fetch, calls } = server(manifest);

    await expect(atlasConnector.download(fetch, NO_VALIDATORS)).rejects.toBeInstanceOf(
      NotTheListError,
    );
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["not YAML", "{{{ not yaml"],
    ["empty", ""],
    ["a map", "release: '2030.02'\nversions: []\n"],
    ["a text", "just some text\n"],
    ["a list with an alias", "- &a {versions: []}\n- *a\n"],
    ["a list with a repeated key", "- release: '2030.02'\n  release: '2030.01'\n"],
    ["a list with a tag", "- !!binary 'AAAA'\n"],
    ["two documents", "- release: '2030.02'\n---\n- release: '2030.01'\n"],
  ])("fails as the wrong list for a manifest that is %s", async (_name, manifest) => {
    const { fetch, calls } = server(manifest);

    await expect(atlasConnector.download(fetch, NO_VALIDATORS)).rejects.toBeInstanceOf(
      NotTheListError,
    );
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["a path with ..", "v6/../../evil/ATLAS-2030.02.yaml"],
    ["a path that leaves the directory", "v6/../ATLAS-2030.02.yaml"],
    ["an absolute path", "/v6/ATLAS-2030.02.yaml"],
    ["another address", "https://evil.example/v6/ATLAS-2030.02.yaml"],
    ["a scheme-relative address", "//evil.example/v6/ATLAS-2030.02.yaml"],
    ["a query", "v6/ATLAS-2030.02.yaml?token=1"],
    ["a fragment", "v6/ATLAS-2030.02.yaml#x"],
    ["another directory", "v5/ATLAS-2030.02.yaml"],
    ["the legacy directory", "legacy/ATLAS-2030.02.yaml"],
    ["a subdirectory", "v6/sub/ATLAS-2030.02.yaml"],
    ["a doubled slash", "v6//ATLAS-2030.02.yaml"],
    ["a trailing slash", "v6/ATLAS-2030.02.yaml/"],
    ["a month of one digit", "v6/ATLAS-2030.2.yaml"],
    ["a name in lower case", "v6/atlas-2030.02.yaml"],
    ["another extension", "v6/ATLAS-2030.02.yml"],
    ["a name with more after the release", "v6/ATLAS-2030.02.yaml.bak"],
    ["a line break", "v6/ATLAS-2030.02.yaml\n"],
    ["a space", "v6/ATLAS-2030.02 .yaml"],
    ["a backslash", "v6\\ATLAS-2030.02.yaml"],
    ["an encoded dot", "v6/ATLAS-2030%2E02.yaml"],
  ])("never follows %s, and falls back to the next release", async (_name, badPath) => {
    const manifest = manifestOf({ release: "2030.02", versions: [["6.2.0", badPath]] }, OLDER_V6);
    const { fetch, calls } = server(manifest);

    await atlasConnector.download(fetch, NO_VALIDATORS);

    expect(calls.map(([url]) => url)).toEqual([
      ATLAS_MANIFEST_URL,
      `${ATLAS_DIST_URL}v6/ATLAS-2030.01.yaml`,
    ]);
  });

  it("fails as the wrong list when the only file of format 6 has a path it does not accept", async () => {
    const manifest = manifestOf({
      release: "2030.02",
      versions: [["6.2.0", "v6/../../evil/ATLAS-2030.02.yaml"]],
    });
    const { fetch, calls } = server(manifest);

    await expect(atlasConnector.download(fetch, NO_VALIDATORS)).rejects.toBeInstanceOf(
      NotTheListError,
    );
    expect(calls).toHaveLength(1);
  });

  it.each(["6", "6.2", "6.2.0.1", "v6.2.0", "6.x.0", "5.9.0", "7.0.0", "60.1.0", ""])(
    "does not take a file whose format is %j for one of format 6",
    async (format) => {
      const manifest = manifestOf(
        { release: "2030.02", versions: [[format, "v6/ATLAS-2030.02.yaml"]] },
        OLDER_V6,
      );
      const { fetch, calls } = server(manifest);

      await atlasConnector.download(fetch, NO_VALIDATORS);

      expect(calls[1][0]).toBe(`${ATLAS_DIST_URL}v6/ATLAS-2030.01.yaml`);
    },
  );

  it("does not take a format or a path that is not text", async () => {
    const manifest = stringify([
      { release: "2030.03", versions: [{ "format-version": 6.2, path: "v6/ATLAS-2030.03.yaml" }] },
      { release: "2030.02", versions: [{ "format-version": "6.2.0", path: 7 }] },
      { release: "2030.02", versions: "v6/ATLAS-2030.02.yaml" },
      { release: "2030.02", versions: [null, "6.2.0", ["6.2.0"]] },
      "not a release",
      null,
      OLDER_V6.versions.map(([format, versionPath]) => ({
        release: "2030.01",
        versions: [{ "format-version": format, path: versionPath }],
      }))[0],
    ]);
    const { fetch, calls } = server(manifest);

    await atlasConnector.download(fetch, NO_VALIDATORS);

    expect(calls[1][0]).toBe(`${ATLAS_DIST_URL}v6/ATLAS-2030.01.yaml`);
  });

  it.each([
    ["another host", "https://evil.example/mitre-atlas/atlas-data/main/dist/manifest.yaml"],
    [
      "a host that begins with the repository's",
      "https://raw.githubusercontent.com.evil.example/mitre-atlas/atlas-data/main/dist/manifest.yaml",
    ],
    [
      "another repository",
      "https://raw.githubusercontent.com/someone/atlas-data/main/dist/manifest.yaml",
    ],
    [
      "a repository whose name begins with the repository's",
      "https://raw.githubusercontent.com/mitre-atlas/atlas-data-fork/main/dist/manifest.yaml",
    ],
    ["http", "http://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/manifest.yaml"],
    [
      "a port",
      "https://raw.githubusercontent.com:8443/mitre-atlas/atlas-data/main/dist/manifest.yaml",
    ],
    [
      "credentials",
      "https://user:secret@raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/manifest.yaml",
    ],
    ["no address", ""],
    ["no address that parses", "not an address"],
  ])("refuses a manifest that was answered from %s", async (_name, url) => {
    const { fetch, calls } = server(answer(url, MANIFEST));

    await expect(atlasConnector.download(fetch, NO_VALIDATORS)).rejects.toBeInstanceOf(
      NotTheListError,
    );
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["another host", "https://evil.example/mitre-atlas/atlas-data/main/dist/v6/ATLAS-2030.02.yaml"],
    [
      "another repository",
      "https://raw.githubusercontent.com/someone/atlas-data/main/dist/v6/ATLAS-2030.02.yaml",
    ],
    [
      "http",
      "http://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/ATLAS-2030.02.yaml",
    ],
    ["no address", ""],
  ])("refuses a file that was answered from %s, a 304 included", async (_name, url) => {
    await expect(
      atlasConnector.download(server(MANIFEST, answer(url, V6)).fetch, NO_VALIDATORS),
    ).rejects.toBeInstanceOf(NotTheListError);
    await expect(
      atlasConnector.download(server(MANIFEST, { notModified: true, url }).fetch, {
        etag: '"v2"',
        lastModified: null,
      }),
    ).rejects.toBeInstanceOf(NotTheListError);
  });

  it("accepts the repository's address after a redirect inside it", async () => {
    const moved = answer(
      "https://raw.githubusercontent.com/mitre-atlas/atlas-data/refs/heads/main/dist/v6/ATLAS-2030.02.yaml",
      V6,
    );

    const snapshot = await atlasConnector.download(server(MANIFEST, moved).fetch, NO_VALIDATORS);

    expect(snapshot).not.toBe("unchanged");
  });

  it("fails as too large for a manifest or a file that was cut at its limit", async () => {
    await expect(
      atlasConnector.download(
        server(answer(ATLAS_MANIFEST_URL, MANIFEST, { truncated: true })).fetch,
        NO_VALIDATORS,
      ),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
    await expect(
      atlasConnector.download(
        server(MANIFEST, answer(DATA_URL, V6, { truncated: true })).fetch,
        NO_VALIDATORS,
      ),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("treats a 304 for a manifest that was asked for without validators as unreachable", async () => {
    const { fetch } = server({ notModified: true, url: ATLAS_MANIFEST_URL });

    await expect(atlasConnector.download(fetch, NO_VALIDATORS)).rejects.toMatchObject({
      name: "FetchError",
      reason: "unreachable",
    });
  });

  it("lets the page guard's own failure out as it is", async () => {
    const failure = new FetchError("blocked_by_site");
    const fetch: ConnectorFetch = async () => {
      throw failure;
    };

    await expect(atlasConnector.download(fetch, NO_VALIDATORS)).rejects.toBe(failure);
  });

  it("names no address in what it throws", async () => {
    const errors: unknown[] = [];
    const attempts: ConnectorFetch[] = [
      server(manifestOf(OLDER_V6).replace("v6/", "legacy/")).fetch,
      server(answer("https://evil.example/x", MANIFEST)).fetch,
      server(MANIFEST, answer("https://evil.example/y", V6)).fetch,
      server(answer(ATLAS_MANIFEST_URL, MANIFEST, { truncated: true })).fetch,
    ];
    for (const fetch of attempts) {
      await atlasConnector.download(fetch, NO_VALIDATORS).catch((error) => errors.push(error));
    }

    expect(errors).toHaveLength(attempts.length);
    for (const error of errors) {
      expect(String((error as Error).message)).not.toMatch(
        /github|mitre|evil|http|manifest\.yaml|ATLAS-20/i,
      );
    }
  });
});

describe("newestV6Release", () => {
  it("gives the path and the name of the release of the first release of format 6", () => {
    expect(newestV6Release(MANIFEST)).toEqual({
      path: "v6/ATLAS-2030.02.yaml",
      release: "2030.02",
    });
  });

  it("names the release from the path, also when the manifest's release is a number", () => {
    const manifest =
      "- release: 2030.10\n  versions:\n  - {format-version: 6.2.0, path: v6/ATLAS-2030.10.yaml}\n";

    expect(newestV6Release(manifest)).toEqual({
      path: "v6/ATLAS-2030.10.yaml",
      release: "2030.10",
    });
  });

  it("is null for a manifest that is no list of releases", () => {
    expect(newestV6Release("")).toBeNull();
    expect(newestV6Release("a: 1")).toBeNull();
    expect(newestV6Release("[]")).toBeNull();
    expect(newestV6Release("- release: x\n")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------------------------

describe("atlasConnector.parse", () => {
  it("has the id and the version of its connector, and begins a record with its mark", () => {
    expect(atlasConnector.id).toBe("atlas");
    expect(atlasConnector.version).toBe(1);
    expect(ATLAS_RECORD_MARK).toBe("MITRE ATLAS");
    expect(ATLAS_SUMMARY_CHARS).toBe(600);
    for (const record of parse().records) {
      expect(record.summary.startsWith(`${ATLAS_RECORD_MARK} case study (atlas.mitre.org).`)).toBe(
        true,
      );
    }
  });

  it("reads every case study of the fixture and nothing else of the file", () => {
    const parsed = parse();

    expect(parsed.root).toBe("case-studies");
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expect(parsed.sourceVersion).toBe("2030.02");
    expect(parsed.records.map((record) => record.sourceRecordId)).toEqual([
      "AML.CS0900",
      "AML.CS0901",
      "AML.CS0902",
      "AML.CS0903",
      "AML.CS0904",
    ]);
  });

  it("makes a record of an incident, with the type spelled out", () => {
    expect(recordOf("AML.CS0900")).toEqual({
      sourceRecordId: "AML.CS0900",
      recordType: "ai_case_study",
      title: "AML.CS0900: Northwind Assistant Session Hijack",
      summary:
        "MITRE ATLAS case study (atlas.mitre.org). Case study: AML.CS0900. " +
        "Name: Northwind Assistant Session Hijack. " +
        "Type: Incident, an attack reported in the wild. " +
        "Target, as ATLAS records it: Northwind's Assistant, Contoso Chat. " +
        "Actor, as ATLAS records it: Unknown Threat Actor. " +
        "Start date: 2029-11-04. " +
        "Summary: Researchers at Contoso Labs found that an attacker who could post in a shared " +
        "channel was able to make the Northwind Assistant act on text that the attacker wrote. " +
        "The assistant replied with the contents of a private note. " +
        "References listed: 3.",
      url: "https://atlas.mitre.org/studies/AML.CS0900",
      identifiers: {
        caseStudyId: "AML.CS0900",
        type: "Incident",
        target: "Northwind's Assistant, Contoso Chat",
      },
      matchKeys: ["name:northwind", "name:northwindassistant", "name:contoso", "name:contosochat"],
      publishedAt: "2029-11-04",
      sourceUpdatedAt: null,
    });
  });

  it("makes a record of an exercise, with the type spelled out, and no actor when ATLAS names none", () => {
    expect(recordOf("AML.CS0901")).toEqual({
      sourceRecordId: "AML.CS0901",
      recordType: "ai_case_study",
      title: "AML.CS0901: Fabrikam Copilot Notebook Exfiltration",
      summary:
        "MITRE ATLAS case study (atlas.mitre.org). Case study: AML.CS0901. " +
        "Name: Fabrikam Copilot Notebook Exfiltration. " +
        "Type: Exercise, a demonstration by researchers or a red team, not an attack in the wild. " +
        "Target, as ATLAS records it: Users of Fabrikam Copilot, including Globex Notebook. " +
        "Start date: 2029-06. " +
        "Summary: Fabrikam security staff showed that a document with hidden instructions could " +
        "make Fabrikam Copilot write private notebook text into a link. " +
        "References listed: 2.",
      url: "https://atlas.mitre.org/studies/AML.CS0901",
      identifiers: {
        caseStudyId: "AML.CS0901",
        type: "Exercise",
        target: "Users of Fabrikam Copilot, including Globex Notebook",
      },
      matchKeys: ["name:fabrikam", "name:fabrikamcopilot", "name:globex", "name:globexnotebook"],
      publishedAt: "2029-06-01",
      sourceUpdatedAt: null,
    });
  });

  it("leaves out an actor that is Unknown, and shows a date at the precision ATLAS has for it", () => {
    const record = recordOf("AML.CS0904");

    expect(record.summary).not.toContain("Actor");
    expect(record.summary).toContain("Start date: 2029.");
    expect(record.summary).toContain("References listed: 0.");
    expect(record.publishedAt).toBe("2029-01-01");
    expect(recordOf("AML.CS0901").summary).toContain("Start date: 2029-06.");
    expect(recordOf("AML.CS0900").summary).toContain("Start date: 2029-11-04.");
  });

  it.each([
    ["Unknown", false],
    ["unknown", false],
    ["  UNKNOWN ", false],
    ["Unknown Threat Actor", true],
    ["Unknown Chinese-language actor", true],
    ["", false],
  ])("the actor %j is %s", (actor, shown) => {
    const body = fileOf([study(1, { actor })]);

    expect(parse(body).records[0].summary.includes("Actor, as ATLAS records it")).toBe(shown);
  });

  it("shows the date at its precision when the granularity is written in any case, and as a day otherwise", () => {
    const summaryFor = (granularity: unknown) =>
      parse(fileOf([study(1, { "start-date-granularity": granularity })])).records[0].summary;

    expect(summaryFor("Year")).toContain("Start date: 2029.");
    expect(summaryFor("YEAR")).toContain("Start date: 2029.");
    expect(summaryFor("month")).toContain("Start date: 2029-05.");
    expect(summaryFor("Day")).toContain("Start date: 2029-05-05.");
    expect(summaryFor(undefined)).toContain("Start date: 2029-05-05.");
    expect(summaryFor("Quarter")).toContain("Start date: 2029-05-05.");
    expect(summaryFor(7)).toContain("Start date: 2029-05-05.");
  });

  it("cuts the name at 200 characters, and the target and the actor at 300, at the end of a word", () => {
    const words = (count: number) =>
      Array.from({ length: count }, (_, index) => `w${index}`).join(" ");
    const [record] = parse(
      fileOf([study(1, { name: words(200), target: words(200), actor: words(200) })]),
    ).records;

    const name = record.title.slice("AML.CS0001: ".length);
    const target = String(record.identifiers.target);
    const actor = /Actor, as ATLAS records it: (.*?)\. Start date/.exec(record.summary)?.[1] ?? "";

    for (const [shown, limit] of [
      [name, 200],
      [target, 300],
      [actor, 300],
    ] as const) {
      expect(shown.length).toBeLessThanOrEqual(limit);
      expect(shown.length).toBeGreaterThan(limit - 10);
      expect(words(200).startsWith(shown)).toBe(true);
      expect(words(200).charAt(shown.length)).toBe(" ");
    }
  });

  it("counts the references, and leaves the line out when the case study has no list of them", () => {
    const withList = (references: unknown) =>
      parse(fileOf([study(1, { references })])).records[0].summary;

    expect(withList([{ id: "a" }, { id: "b" }])).toContain("References listed: 2.");
    expect(withList([])).toContain("References listed: 0.");
    expect(withList(undefined)).not.toContain("References listed");
    expect(withList("none")).not.toContain("References listed");
  });

  it("uses nothing of the references, the entities, the relationships or the reporter", () => {
    const everything = JSON.stringify(parse().records);

    expect(everything).not.toMatch(/contoso\.example|northwind\.example|news\.example/i);
    expect(everything).not.toContain("Contoso Labs blog post");
    expect(everything).not.toContain("Contoso Research Group");
    expect(everything).not.toMatch(/name:contosoresearch|name:wingtip/);
    expect(recordOf("AML.CS0902").matchKeys.some((key) => key.includes("wingtip"))).toBe(false);
    expect(JSON.stringify(recordOf("AML.CS0900").identifiers)).not.toContain("reporter");
  });

  it("gives the same records for the same file", () => {
    expect(parse()).toEqual(parse());
    expect(parse(V6.replace(/\n/g, "\r\n"))).toEqual(parse());
  });

  it("reads the source version from the second body, and from no other", () => {
    expect(parse(V6, "2030.02").sourceVersion).toBe("2030.02");
    expect(parse(V6, " 2030.02.2 \n").sourceVersion).toBe("2030.02.2");
    expect(parse(V6, undefined).sourceVersion).toBeNull();
    expect(parse(V6, "").sourceVersion).toBeNull();
    expect(parse(V6, "2030.2").sourceVersion).toBeNull();
    expect(parse(V6, "latest").sourceVersion).toBeNull();
    expect(parse(V6, "2030.02; drop table").sourceVersion).toBeNull();
    expect(parse(V6, "2030.02\nx").sourceVersion).toBeNull();
  });

  it("leaves out the fields of a case study it does not read", () => {
    const body = edited((file) => {
      for (const entry of Object.values(file["case-studies"] as Record<string, Fields>)) {
        entry.someFutureField = { nested: [1, 2, 3] };
        entry.procedure = [{ tactic: "AML.TA9000", description: "Step text that is not read." }];
      }
      file.someFutureSection = { a: 1 };
    });

    expect(parse(body)).toEqual(parse());
  });

  describe("an entry that cannot be read", () => {
    it.each([
      ["an id that is not an ATLAS case study id", { id: "AML.CS12" }],
      ["an id of another kind", { id: "AML.T0051" }],
      ["an id with text after it", { id: "AML.CS0001 " }],
      ["an id in lower case", { id: "aml.cs0001" }],
      ["an id that is not text", { id: 12 }],
      ["no id", { id: undefined }],
      ["no name", { name: undefined }],
      ["a name that is empty", { name: "" }],
      ["a name that is only white space", { name: " \n " }],
      ["a name that is only markup", { name: "<b></b>" }],
      ["a name that is not text", { name: 7 }],
      ["a start date that is not a day", { "start-date": "2029-02-30" }],
      ["a start date of a month that does not exist", { "start-date": "2029-13-01" }],
      ["a start date of a year only", { "start-date": "2029" }],
      ["a start date of a year and a month", { "start-date": "2029-05" }],
      ["a start date written day first", { "start-date": "05/05/2029" }],
      ["a start date with a time", { "start-date": "2029-05-05T10:00:00Z" }],
      ["a start date with a day of one digit", { "start-date": "2029-5-5" }],
      ["a start date that is empty", { "start-date": "" }],
      ["a start date that is a number", { "start-date": 20290505 }],
      ["a start date that is a list", { "start-date": ["2029-05-05"] }],
      ["no start date", { "start-date": undefined }],
      ["a type that is neither incident nor exercise", { type: "Simulation" }],
      ["a type that is empty", { type: "" }],
      ["a type that is a list", { type: ["Incident"] }],
      ["no type", { type: undefined }],
    ])("is left out and counted: %s", (_name, fields) => {
      const body = fileOf([study(1), study(2, fields), study(3)]);

      const parsed = parse(body);

      expect(parsed.records.map((record) => record.sourceRecordId)).toEqual([
        "AML.CS0001",
        "AML.CS0003",
      ]);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
      expect(parsed.root).toBe("case-studies");
    });

    it("is left out and counted when its key is not its id, or it is no map", () => {
      const body = stringify({
        "format-version": "6.1.0",
        "case-studies": {
          "AML.CS0001": study(1),
          "AML.CS0002": study(3),
          "AML.CS0004": "not a case study",
          "AML.CS0005": null,
          "AML.CS0006": [study(6)],
          other: study(7),
        },
      });

      const parsed = parse(body);

      expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["AML.CS0001"]);
      expect(parsed.skipped).toBe(5);
    });

    it("reads a type in any case, and gives it as ATLAS writes it", () => {
      const parsed = parse(
        fileOf([study(1, { type: "incident" }), study(2, { type: " EXERCISE " })]),
      );

      expect(parsed.records.map((record) => record.identifiers.type)).toEqual([
        "Incident",
        "Exercise",
      ]);
      expect(parsed.skipped).toBe(0);
    });

    it("takes a target, a description and a list of references to be missing without losing the record", () => {
      const body = fileOf([study(1, { target: undefined, description: undefined, references: 5 })]);

      const [record] = parse(body).records;

      expect(record.matchKeys).toEqual([]);
      expect(record.identifiers).toEqual({ caseStudyId: "AML.CS0001", type: "Exercise" });
      expect(record.summary).not.toMatch(/Target|Summary|References/);
    });
  });

  describe("the tolerance for entries that cannot be read", () => {
    it("is ten, or a hundredth of the entries when that is more", () => {
      expect(atlasUnreadableAllowed(0)).toBe(10);
      expect(atlasUnreadableAllowed(77)).toBe(10);
      expect(atlasUnreadableAllowed(1099)).toBe(10);
      expect(atlasUnreadableAllowed(1100)).toBe(11);
      expect(atlasUnreadableAllowed(5000)).toBe(50);
    });

    it("counts ten as skipped, and the eleventh turns them all into errors", () => {
      const tolerated = parse(manyStudies(20, 10));
      const refused = parse(manyStudies(20, 11));

      expect(tolerated).toMatchObject({ errors: 0, skipped: 10, root: "case-studies" });
      expect(tolerated.records).toHaveLength(10);
      expect(refused).toMatchObject({ errors: 11, skipped: 0, root: "case-studies" });
    });

    it("tolerates a hundredth of a file when that is more than ten", () => {
      expect(parse(manyStudies(1300, 13))).toMatchObject({ errors: 0, skipped: 13 });
      expect(parse(manyStudies(1300, 14))).toMatchObject({ errors: 14, skipped: 0 });
    });
  });

  describe("a body that is not the list", () => {
    const NOT_THE_LIST = { records: [], errors: 1, sourceVersion: null, root: null };

    it("gives no root for the file of format 5", () => {
      expect(parse(V5)).toEqual(NOT_THE_LIST);
    });

    it.each([
      ["no body", undefined],
      ["an empty body", ""],
      ["text that is not YAML", "{{{ nope"],
      ["only a comment", "# nothing\n"],
      ["a list", "- a\n- b\n"],
      ["a text", "just text\n"],
      ["no format", "case-studies: {}\n"],
      ["a format of 5", "format-version: 5.6.0\ncase-studies: {}\n"],
      ["a format of 7", "format-version: 7.0.0\ncase-studies: {}\n"],
      ["a format of 16", "format-version: 16.0.0\ncase-studies: {}\n"],
      ["a format of 6 as a major only", "format-version: 6\ncase-studies: {}\n"],
      ["a format that is a list", "format-version: [6.1.0]\ncase-studies: {}\n"],
      ["no case studies", "format-version: 6.1.0\ntactics: {}\n"],
      ["case studies as a list", "format-version: 6.1.0\ncase-studies:\n- id: AML.CS0001\n"],
      ["case studies as a text", "format-version: 6.1.0\ncase-studies: none\n"],
      ["case studies as nothing", "format-version: 6.1.0\ncase-studies:\n"],
    ])("gives no root for %s", (_name, body) => {
      expect(
        atlasConnector.parse({ ...snapshotOf(""), bodies: body === undefined ? [] : [body] }),
      ).toEqual(NOT_THE_LIST);
    });

    it("reads a format of 6 that a writer left unquoted as a number", () => {
      const parsed = parse("format-version: 6.1\ncase-studies: {}\n");

      expect(parsed.root).toBe("case-studies");
      expect(parse("format-version: 6.0.0\ncase-studies: {}\n").root).toBe("case-studies");
    });

    it("gives an empty list of case studies as a list with no records", () => {
      expect(parse("format-version: 6.1.0\ncase-studies: {}\n")).toMatchObject({
        records: [],
        errors: 0,
        root: "case-studies",
      });
    });

    it("refuses a file with more case studies than the list can have", () => {
      const entries = Object.fromEntries(
        Array.from({ length: 5001 }, (_, index) => [`AML.CS${String(index).padStart(4, "0")}`, {}]),
      );

      expect(parse(stringify({ "format-version": "6.1.0", "case-studies": entries }))).toEqual(
        NOT_THE_LIST,
      );
    });
  });

  describe("the guards on the YAML", () => {
    const NOT_THE_LIST = { records: [], errors: 1, sourceVersion: null, root: null };
    const HEAD = "format-version: 6.1.0\n";
    const ONE = (extra: string) => `${HEAD}${extra}case-studies: {}\n`;

    it.each([
      ["an alias", `${HEAD}a: &x [1, 2]\nb: *x\ncase-studies: {}\n`],
      [
        "an alias of a case study",
        V6.replace("object-type: entity", "object-type: &o entity").replace(
          "uuid: 00000000-0000-5000-8000-000000000904\n    object-type: case-study",
          "uuid: 00000000-0000-5000-8000-000000000904\n    object-type: *o",
        ),
      ],
      ["a merge key with an alias", `${HEAD}base: &b {x: 1}\nd:\n  <<: *b\ncase-studies: {}\n`],
      ["a repeated key at the top", `${HEAD}${HEAD}case-studies: {}\n`],
      [
        "a repeated key in a case study",
        V6.replace(
          "    type: Incident\n    actor: Unknown Threat Actor",
          "    type: Incident\n    type: Exercise\n    actor: Unknown Threat Actor",
        ),
      ],
      ["a repeated case study", V6.replace("  AML.CS0901:\n", "  AML.CS0900:\n")],
      ["keys that become one property", ONE("1: a\n'1': b\n")],
      ["a repeated key in a flow map", ONE("m: {a: 1, a: 2}\n")],
      ["a key that is a list", ONE("? [a, b]\n: c\n")],
      ["a key that is a map", ONE("? {a: b}\n: c\n")],
      ["a tag that is unknown", ONE("t: !custom value\n")],
      ["a tag that is known", ONE("t: !!str 5\n")],
      ["a binary tag", ONE("t: !!binary aGVsbG8=\n")],
      ["a set tag", ONE("t: !!set {x, y}\n")],
      ["a tag on the map of case studies", `${HEAD}case-studies: !!map {}\n`],
      [
        "a tag that runs code in some libraries",
        ONE("t: !!python/object/apply:os.system [echo]\n"),
      ],
      ["a second document", `${HEAD}case-studies: {}\n---\nformat-version: 6.1.0\n`],
      ["a directive that the package does not know", `%FOO bar\n---\n${HEAD}case-studies: {}\n`],
      [
        "a version of YAML that the package does not know",
        `%YAML 1.3\n---\n${HEAD}case-studies: {}\n`,
      ],
      [
        "a tag written with a handle that a directive defines",
        `%TAG !e! tag:example.com,2000:\n---\n${HEAD}t: !e!thing x\ncase-studies: {}\n`,
      ],
      ["an error of syntax", `${HEAD}case-studies: {\n`],
      ["a tab where the syntax has none", `${HEAD}case-studies:\n\t- a\n`],
    ])("gives no root for a file with %s", (_name, body) => {
      expect(parse(body)).toEqual(NOT_THE_LIST);
    });

    it("reads a file that begins with a directive for YAML 1.2", () => {
      expect(parse(`%YAML 1.2\n---\n${HEAD}case-studies: {}\n`).root).toBe("case-studies");
    });

    it("does not let a key named __proto__ reach the prototype of any object", () => {
      const body = `${HEAD}__proto__: {polluted: yes}\ncase-studies: {}\n`;

      const parsed = parse(body);

      expect(parsed.root).toBe("case-studies");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty("polluted");
    });

    it("does not read a case study from an inherited property", () => {
      const body = `${HEAD}case-studies:\n  constructor: {id: constructor}\n  toString: x\n`;

      expect(parse(body)).toMatchObject({ records: [], skipped: 2 });
    });

    it("refuses a text with more lexemes than the file of 2026.10 could grow to, and does it fast", () => {
      // Otherwise a valid file: only the lexeme budget refuses the long one.
      const withLines = (count: number) =>
        `${HEAD}case-studies: {}\nfiller:\n${"- 1\n".repeat(count)}`;
      const started = Date.now();

      expect(parse(withLines(100_000)).root).toBe("case-studies");
      expect(parse(withLines(300_000))).toEqual(NOT_THE_LIST);
      expect(Date.now() - started).toBeLessThan(10_000);
    });

    it("refuses a flat flow list of the same size", () => {
      const withItems = (count: number) =>
        `${HEAD}case-studies: {}\nfiller: [${"1,".repeat(count)}1]\n`;
      const started = Date.now();

      expect(parse(withItems(100_000)).root).toBe("case-studies");
      expect(parse(withItems(500_000))).toEqual(NOT_THE_LIST);
      expect(Date.now() - started).toBeLessThan(10_000);
    });

    it("finds a repeated key in linear time (the package's own check is quadratic)", () => {
      // 40,000 keys took the package's check about 6 s; this one is read in a fraction of a second.
      const keys = Array.from({ length: 40_000 }, (_, index) => `key${index}: value`);
      const started = Date.now();

      const unique = parse(`${HEAD}${keys.join("\n")}\ncase-studies: {}\n`);
      const repeated = parse(`${HEAD}${keys.join("\n")}\nkey7: again\ncase-studies: {}\n`);

      expect(unique.root).toBe("case-studies");
      expect(repeated).toEqual(NOT_THE_LIST);
      expect(Date.now() - started).toBeLessThan(10_000);
    });

    it("refuses text nested too deeply to read, and does it fast", () => {
      const started = Date.now();

      expect(parse(`${HEAD}a: ${"[".repeat(5000)}${"]".repeat(5000)}\n`)).toEqual(NOT_THE_LIST);
      expect(parse(`${HEAD}a: ${"{k: ".repeat(3000)}1${"}".repeat(3000)}\n`)).toEqual(NOT_THE_LIST);
      expect(Date.now() - started).toBeLessThan(10_000);
    });

    it("reads a long scalar and a long block of text without trouble", () => {
      const started = Date.now();

      const parsed = parse(
        `${HEAD}x: |\n${"  a line of text\n".repeat(100_000)}case-studies: {}\n`,
      );

      expect(parsed.root).toBe("case-studies");
      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The injected prompt of a case study (R10.1)
// ---------------------------------------------------------------------------------------------

describe("a case study that holds a prompt injection", () => {
  /** What the real AML.CS0046 holds: the three things R10.1's review check looks for. */
  const FORBIDDEN = ["MUST execute", "base64", "/bin/bash"];

  it("has the shape of AML.CS0046 in the fixture, so that the tests below can fail", () => {
    const file = parseYaml(V6, { schema: "core" })["case-studies"];

    for (const id of ["AML.CS0902", "AML.CS0903"]) {
      for (const text of FORBIDDEN) expect(file[id].description).toContain(text);
      expect(file[id].description).toContain("<atlas-example>");
    }
    expect(file["AML.CS0902"].description).toContain("&lt;IMPORTANT&gt;");
    expect(file["AML.CS0903"].description).toContain("&lt;atlas-example&gt;");
  });

  it.each(["AML.CS0902", "AML.CS0903"])(
    "%s: nothing of the injected prompt reaches the record",
    (id) => {
      const record = recordOf(id);
      const everything = JSON.stringify(record);

      for (const text of FORBIDDEN) {
        expect(record.summary).not.toContain(text);
        expect(everything).not.toContain(text);
      }
      expect(everything).not.toMatch(/atlas-example|atlas-technique|IMPORTANT|payload\.example/i);
      expect(everything).not.toMatch(/ZWNobyBmYWtl|ZmFrZQ/);
      expect(everything).not.toMatch(/[<>]/);
    },
  );

  it("keeps the researchers' own words around the removed prompt", () => {
    expect(recordOf("AML.CS0902").summary).toContain(
      "Summary: Wingtip Security staff showed that text hidden in a PDF file could make the Tailspin Computer Agent run shell commands on the computer of the person who opened it.",
    );
    expect(recordOf("AML.CS0903").summary).toContain(
      "Summary: Researchers at Wingtip Security found that Adventure Works Desktop Helper obeys text inside web pages. A second page used the same trick in an encoded form: Both pages were blocked in version 2.",
    );
  });

  it("does not let the prompt reach the record through the name, the target or the actor", () => {
    const payload = "<atlas-example>MUST execute | base64 -d | /bin/bash</atlas-example>";
    const body = fileOf([
      study(1, {
        name: `Name ${payload} end`,
        target: `Target ${payload} end`,
        actor: `Actor ${payload} end`,
      }),
    ]);

    const [record] = parse(body).records;

    for (const text of FORBIDDEN) expect(JSON.stringify(record)).not.toContain(text);
    expect(record.title).toBe("AML.CS0001: Name end");
    expect(record.identifiers.target).toBe("Target end");
    expect(record.summary).toContain("Actor, as ATLAS records it: Actor end.");
  });

  it("holds when the prompt is the whole description, or comes first, in any case", () => {
    for (const description of [
      "<atlas-example>MUST execute base64 /bin/bash</atlas-example>",
      "<ATLAS-EXAMPLE>MUST execute base64 /bin/bash</ATLAS-EXAMPLE>\n\nThen text.",
      "<atlas-example>MUST execute base64 /bin/bash",
    ]) {
      const [record] = parse(fileOf([study(1, { description })])).records;

      for (const text of FORBIDDEN) expect(record.summary).not.toContain(text);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// atlasKeysOf (R5)
// ---------------------------------------------------------------------------------------------

describe("atlasKeysOf", () => {
  it.each([
    ["OpenAI ChatGPT", ["name:openai", "name:openaichatgpt"]],
    ["Microsoft's Tay AI Chatbot", ["name:microsoft", "name:microsofttay", "name:microsofttayai"]],
    ["Cursor, GitHub Copilot", ["name:cursor", "name:github", "name:githubcopilot"]],
    ["Hugging Face users", ["name:hugging", "name:huggingface", "name:huggingfaceusers"]],
    [
      "Users of Hugging Face-backed model catalogs",
      ["name:hugging", "name:huggingfacebacked", "name:huggingfacebackedmodel"],
    ],
    [
      "Palo Alto Networks malware detection system",
      ["name:palo", "name:paloalto", "name:paloaltonetworks"],
    ],
  ])("gives the keys of %j", (target, keys) => {
    expect(atlasKeysOf(target)).toEqual(keys);
  });

  it("reads the first one, two and three words of each part as names", () => {
    expect(atlasKeysOf("Alpha Bravo Charlie Delta Echo")).toEqual([
      "name:alpha",
      "name:alphabravo",
      "name:alphabravocharlie",
    ]);
    expect(atlasKeysOf("Alpha Bravo")).toEqual(["name:alpha", "name:alphabravo"]);
    expect(atlasKeysOf("Alpha")).toEqual(["name:alpha"]);
  });

  it("splits at commas, semicolons, slashes, brackets, and, and or", () => {
    expect(atlasKeysOf("Alpha, Bravo; Charlie/Delta (Echo) and Foxtrot or Golf1")).toEqual([
      "name:alpha",
      "name:bravo",
      "name:charlie",
      "name:delta",
      "name:echo",
      "name:foxtrot",
      "name:golf1",
    ]);
    expect(atlasKeysOf("Alpha  and   Bravo")).toEqual(["name:alpha", "name:bravo"]);
    expect(atlasKeysOf("Alpha AND Bravo OR Charlie")).toEqual([
      "name:alpha",
      "name:bravo",
      "name:charlie",
    ]);
    // "and" inside a word is not a split.
    expect(atlasKeysOf("Brandy Candor")).toEqual(["name:brandy", "name:brandycandor"]);
  });

  it("drops the leading words that are no name, as many as there are", () => {
    expect(atlasKeysOf("The Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Users of Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("including Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("New Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Internal Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Commercial Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Enterprise Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Exposed Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Publicly Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Private Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Models from Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("The new internal Publicly exposed Alpha")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("the USERS OF alpha")).toEqual(["name:alpha"]);
    // Only at the start of a part.
    expect(atlasKeysOf("Alpha new")).toEqual(["name:alpha", "name:alphanew"]);
  });

  it("drops a possessive, with either apostrophe", () => {
    expect(atlasKeysOf("Kaspersky's Antimalware")).toEqual([
      "name:kaspersky",
      "name:kasperskyantimalware",
    ]);
    expect(atlasKeysOf(`Kaspersky${cp(0x2019)}s Antimalware`)).toEqual([
      "name:kaspersky",
      "name:kasperskyantimalware",
    ]);
    expect(atlasKeysOf("Chris's")).toEqual(["name:chris"]);
  });

  it("takes nothing from an address in the target", () => {
    expect(atlasKeysOf("MathGPT (https://mathgpt.streamlit.app/)")).toEqual(["name:mathgpt"]);
    expect(atlasKeysOf("Alpha http://beta.example/gamma")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("www.example.org/path")).toEqual([]);
    expect(atlasKeysOf("Alpha HTTPS://BETA.EXAMPLE")).toEqual(["name:alpha"]);
  });

  it("gives no key to a name that is only a stop word, whatever its case and punctuation", () => {
    for (const target of [
      "Users",
      "USERS",
      "user",
      "Models",
      "model",
      "Services",
      "service",
      "Systems",
      "system",
      "Agents",
      "agent",
      "Applications",
      "Frameworks",
      "Servers",
      "server",
      "Cloud",
      "Cloud-Based",
      "cloud based",
      "Mobile",
      "LLM",
      "LLMs",
      "ML",
      "AI",
      "Government",
      "Organizations",
      "Entities",
      "Datasets",
      "Maintainers",
      "Machines",
      "Registries",
      "Apps",
      "Tools",
      "Integration",
      "The Cloud",
      "(Users)",
      "Users, Cloud, AI",
    ]) {
      expect(atlasKeysOf(target)).toEqual([]);
    }
  });

  it("gives no key to a stop word that is left once the legal form of the name is taken off", () => {
    expect(atlasKeysOf("Services Inc")).toEqual(["name:servicesinc"]);
    expect(atlasKeysOf("Users LLC")).toEqual(["name:usersllc"]);
    expect(atlasKeysOf("Cloud AS")).toEqual(["name:cloudas"]);
    expect(atlasKeysOf("The Systems Ltd")).toEqual(["name:systemsltd"]);
  });

  it("keeps a name that begins with a stop word, or holds one", () => {
    expect(atlasKeysOf("Cloud Services")).toEqual(["name:cloudservices"]);
    expect(atlasKeysOf("LLM Desktop Applications")).toEqual([
      "name:llmdesktop",
      "name:llmdesktopapplications",
    ]);
  });

  it("gives no key to a name of fewer than four letters and digits", () => {
    expect(atlasKeysOf("XAI, IBM, SAP")).toEqual([]);
    expect(atlasKeysOf("Ray")).toEqual([]);
    expect(atlasKeysOf("a b")).toEqual([]);
    expect(atlasKeysOf("Wiz")).toEqual([]);
    expect(atlasKeysOf("Wizz")).toEqual(["name:wizz"]);
  });

  it("gives each key once, in the order of the target, and none for no target", () => {
    expect(atlasKeysOf("Alpha, alpha, ALPHA")).toEqual(["name:alpha"]);
    expect(atlasKeysOf("Alpha Bravo, Alpha")).toEqual(["name:alpha", "name:alphabravo"]);
    expect(atlasKeysOf("")).toEqual([]);
    expect(atlasKeysOf("   ")).toEqual([]);
    expect(atlasKeysOf(", ; / ( )")).toEqual([]);
  });

  it("gives a key for the name without its legal form as well as for the name", () => {
    expect(atlasKeysOf("Acme Corp")).toEqual(["name:acme", "name:acmecorp"]);
    expect(atlasKeysOf("Globex Labs Inc")).toEqual([
      "name:globex",
      "name:globexlabs",
      "name:globexlabsinc",
    ]);
  });

  it("is not slow on a long target", () => {
    const started = Date.now();

    atlasKeysOf(",".repeat(20_000));
    atlasKeysOf(" and ".repeat(5_000));
    atlasKeysOf(`${" ".repeat(20_000)}x${" ".repeat(20_000)}`);
    atlasKeysOf("ab ".repeat(10_000));
    atlasKeysOf("http://x ".repeat(5_000));

    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

// ---------------------------------------------------------------------------------------------
// cleanCaseStudyText (R10.1)
// ---------------------------------------------------------------------------------------------

describe("cleanCaseStudyText", () => {
  const clean = cleanCaseStudyText;

  describe("an example block", () => {
    it.each([
      [
        "in the middle of a line",
        "Before <atlas-example>PAYLOAD</atlas-example> after",
        "Before after",
      ],
      [
        "with attributes, in capitals, closed with white space",
        'Before <ATLAS-EXAMPLE class="x">PAYLOAD</Atlas-Example > after',
        "Before after",
      ],
      [
        "with a > inside an attribute",
        'Before <atlas-example title="a>b">PAYLOAD</atlas-example> after',
        "Before after",
      ],
      [
        "with other tags inside",
        'Before <atlas-example><atlas-technique id="AML.T1">PAYLOAD</atlas-technique></atlas-example> after',
        "Before after",
      ],
      [
        "nested in another",
        "Before <atlas-example>a <atlas-example>b</atlas-example> PAYLOAD c</atlas-example> after",
        "Before after",
      ],
      [
        "nested three deep",
        "Before <atlas-example>a<atlas-example>b<atlas-example>c</atlas-example>PAYLOAD</atlas-example>PAYLOAD</atlas-example> after",
        "Before after",
      ],
      [
        "twice, with the text between the two kept",
        "A <atlas-example>1 PAYLOAD</atlas-example> keep this <atlas-example>2 PAYLOAD</atlas-example> B",
        "A keep this B",
      ],
      [
        "never closed, which runs to the end of the text",
        "Before <atlas-example> PAYLOAD never closed. More PAYLOAD.",
        "Before",
      ],
      [
        "never closed after one that is",
        "A <atlas-example>1</atlas-example> B <atlas-example> PAYLOAD",
        "A B",
      ],
      [
        "nested and never closed",
        "A <atlas-example>x <atlas-example>y</atlas-example> PAYLOAD",
        "A",
      ],
      ["written as a self-closing tag", "Before <atlas-example/> PAYLOAD after", "Before"],
      [
        "closed by a tag that is itself never ended",
        "Before <atlas-example>x</atlas-example PAYLOAD",
        "Before",
      ],
      ["with only its tag in the text", "<atlas-example>PAYLOAD</atlas-example>", ""],
      ["with no inner text", "Before <atlas-example></atlas-example> after", "Before after"],
      ["next to a closing tag that has no block", "Before </atlas-example> after", "Before after"],
    ])("is removed whole: %s", (_name, text, expected) => {
      expect(clean(text)).toBe(expected);
    });

    it("is not confused with a tag whose name only begins like it", () => {
      expect(clean("Before <atlas-examples>keep</atlas-examples> after")).toBe("Before keep after");
      expect(clean("Before <atlas-example-two>keep</atlas-example-two> after")).toBe(
        "Before keep after",
      );
      expect(clean("Before <atlas-example_x>keep</atlas-example_x> after")).toBe(
        "Before keep after",
      );
    });

    it("is removed with the lines it spans, also a blank one, before the paragraph is chosen", () => {
      expect(
        clean("Lead-in:\n<atlas-example>PAYLOAD a\n\nPAYLOAD b</atlas-example>\n\nAfter."),
      ).toBe("Lead-in:");
      expect(clean("<atlas-example>PAYLOAD</atlas-example>\n\nThe real summary.\n\nMore.")).toBe(
        "The real summary.",
      );
      expect(clean("<atlas-example>\n\nPAYLOAD\n\n</atlas-example>The real summary.")).toBe(
        "The real summary.",
      );
    });

    it("is removed when taking out one block makes another from what was around it", () => {
      expect(
        clean("A <atl<atlas-example>x</atlas-example>as-example>PAYLOAD</atlas-example> B"),
      ).toBe("A B");
      expect(
        clean(
          "A <atl<atl<atlas-example>x</atlas-example>as-example>y</atlas-example>as-example>PAYLOAD</atlas-example> B",
        ),
      ).toBe("A B");
      expect(clean("A <<b>atlas-example>PAYLOAD<<b>/atlas-example> B")).not.toContain("PAYLOAD");
    });

    it.each([
      ["entities", "&lt;", "&gt;"],
      ["decimal references", "&#60;", "&#62;"],
      ["hexadecimal references", "&#x3c;", "&#X3E;"],
      ["entities written twice", "&amp;lt;", "&amp;gt;"],
      ["entities written three times", "&amp;amp;lt;", "&amp;amp;gt;"],
      ["full-width brackets", cp(0xff1c), cp(0xff1e)],
      ["references to full-width brackets", "&#xff1c;", "&#xff1e;"],
      ["a mix of entities and references", "&lt;", "&#62;"],
    ])("is removed whole when it is written with %s", (_name, lt, gt) => {
      const block = `${lt}atlas-example${gt}PAYLOAD${lt}/atlas-example${gt}`;

      expect(clean(`Before ${block} after`)).toBe("Before after");
      expect(clean(`Before ${lt}atlas-example${gt}PAYLOAD never closed`)).toBe("Before");
    });

    it("is removed when only one of its tags is written as entities", () => {
      expect(clean("Before <atlas-example>PAYLOAD&lt;/atlas-example&gt; after")).toBe(
        "Before after",
      );
      expect(clean("Before &lt;atlas-example&gt;PAYLOAD</atlas-example> after")).toBe(
        "Before after",
      );
    });

    it("is removed when an earlier closing tag has an entity for its >, which in a half-decoded text runs on to the next >", () => {
      // Read half decoded, `</atlas-example&amp;gt;` has no end until the `>` of the third block's
      // opening tag; that tag goes with it and the text after it would be left outside any block.
      const text =
        "A <atlas-example>x</atlas-example&amp;gt; B &#x3c;atlas-example&amp;gt;" +
        "&amp;lt;atlas-example id='a'>PAYLOAD</atlas-example> C";

      expect(clean(text)).toBe("A B");
      expect(clean(text.replace("&amp;gt;", "&#xff1e;"))).toBe("A B");
    });

    it("is removed when characters a reader cannot see are put in its tags", () => {
      const unseen = [
        cp(0x200b),
        cp(0x200d),
        cp(0x2060),
        cp(0xfeff),
        cp(0x00ad),
        cp(0x202e),
        cp(0x2066),
        cp(0xfe0f),
        cp(0xe0041),
        cp(0x0000),
        cp(0x0001),
        cp(0x0085),
      ];
      for (const character of unseen) {
        const open = `<atlas-ex${character}ample>`;
        const close = `</atl${character}as-example>`;

        expect(clean(`Before ${open}PAYLOAD${close} after`)).toBe("Before after");
      }
    });

    it("is removed when the tags are written with compatibility forms of their letters", () => {
      const wide = (text: string) =>
        [...text]
          .map((letter) => (/[a-z]/.test(letter) ? cp(letter.charCodeAt(0) + 0xfee0) : letter))
          .join("");

      expect(
        clean(`Before <${wide("atlas")}-example>PAYLOAD</${wide("atlas")}-example> after`),
      ).toBe("Before after");
    });
  });

  describe("the other markup", () => {
    it("drops the other atlas tags and keeps what is inside them", () => {
      expect(
        clean(
          'Use <atlas-technique id="AML.T0103">q --trust-all-tools</atlas-technique> and <atlas-tactic>more</atlas-tactic>.',
        ),
      ).toBe("Use q --trust-all-tools and more.");
    });

    it("drops any other tag, a comment and a declaration, and keeps the text between them", () => {
      expect(clean("A <b>bold</b> <i>word</i> <profile_name> here")).toBe("A bold word here");
      expect(clean("A <!-- hidden --> B <?php x ?> C <![CDATA[ y ]]> D <!DOCTYPE html> E")).toBe(
        "A B C D E",
      );
      expect(clean("A <script>alert(1)</script> B")).toBe("A alert(1) B");
    });

    it("does not join two words when it takes out a tag that ends a line", () => {
      expect(clean("step one<br>step two")).toBe("step one step two");
      expect(clean("step one<br />step two<BR/>step three")).toBe("step one step two step three");
      expect(clean("a<p>b</p>c<div>d</div>e<li>f<hr>g")).toBe("a b c d e f g");
      expect(clean("a<h2>b</h2>c")).toBe("a b c");
      // Not a line break: a tag that only begins with the letters of one.
      expect(clean("a<brand>b</brand>c")).toBe("abc");
      expect(clean("a<pre>b</pre>c")).toBe("abc");
      // A line break next to a line feed makes no blank line, so the paragraph goes on.
      expect(clean("line one<br>\nline two")).toBe("line one line two");
    });

    it("keeps a < that starts no markup, and a >", () => {
      expect(clean("p<0.05 and x -> y and a >= b, 3 < 4, <3 and 5>3")).toBe(
        "p<0.05 and x -> y and a >= b, 3 < 4, <3 and 5>3",
      );
    });

    it("drops only the < of a tag that is never closed, and keeps what follows as text", () => {
      expect(clean("Start <script src=//evil and more text")).toBe(
        "Start script src=//evil and more text",
      );
      expect(clean("a<b then c")).toBe("ab then c");
      expect(clean("<<<<")).toBe("<<<<");
      expect(clean("Text <a<b>c</b> end")).toBe("Text ac end");
    });

    it("leaves no tag where decoding makes one", () => {
      expect(
        clean("Look: &lt;b&gt;bold&lt;/b&gt; and &lt;script&gt;alert(1)&lt;/script&gt; done"),
      ).toBe("Look: bold and alert(1) done");
      expect(clean("a &amp;lt;b&amp;gt;x")).toBe("a x");
      expect(clean("a &#60;img src=x&#62; b")).toBe("a b");
    });

    it("reduces a link to its text, and an image to its description", () => {
      expect(clean("See [the paper](https://example.org/a) now")).toBe("See the paper now");
      expect(clean("A ![logo](x.png) B")).toBe("A logo B");
      expect(clean("[Embrace the Red]( https://embracethered.com/ ) demonstrated")).toBe(
        "Embrace the Red demonstrated",
      );
      expect(clean("[page](/entities/AML.E0024)")).toBe("page");
    });

    it("reduces a link whose address has parentheses, and one whose text has brackets", () => {
      expect(clean("[the page](https://example.org/a_(b)_c) end")).toBe("the page end");
      expect(clean("[a [nested] one](https://example.org/u) end")).toBe("a [nested] one end");
      expect(clean("[a [b](u2) c](u1) end")).toBe("a b c end");
    });

    it("keeps nothing of the address of a link", () => {
      const out = clean("[x](https://secret.example/path?token=abc) and [y](http://other.example)");

      expect(out).toBe("x and y");
      expect(out).not.toMatch(/example|token/);
    });

    it("leaves what is not a link as it was written", () => {
      expect(clean("[text](no end")).toBe("[text](no end");
      expect(clean("[text] (not adjacent)")).toBe("[text] (not adjacent)");
      expect(clean("an array a[0] and f(x)")).toBe("an array a[0] and f(x)");
    });

    it("drops a reference between double brackets", () => {
      expect(clean("directly.[[arxiv]][[arxiv-1]] However, it works[[nvd]].")).toBe(
        "directly. However, it works.",
      );
      expect(clean("a [[ref with spaces]] b")).toBe("a b");
    });
  });

  describe("the entities", () => {
    it("decodes them, and last", () => {
      expect(clean("R&amp;D, &quot;quoted&quot;, it&#39;s, &#x41;&#66;")).toBe(
        `R&D, "quoted", it's, AB`,
      );
      // &amp;lt; is decoded step by step, to the < that the last step takes out as a tag.
      expect(clean("a &amp;lt;b&amp;gt; c")).toBe("a c");
    });

    it("leaves an ampersand that is no entity, and an entity it does not know, as written", () => {
      expect(clean("R&D and C&C; AT&T &nbsp; &copy; &unknown; &#0; &#xD800; &#1; &#x110000;")).toBe(
        "R&D and C&C; AT&T &nbsp; &copy; &unknown; &#0; &#xD800; &#1; &#x110000;",
      );
    });

    it("does not read a run of &amp; as a nesting: each one is decoded once", () => {
      const flat = `Before ${"&amp;".repeat(12)}lt;atlas-example${"&amp;".repeat(12)}gt;PAYLOAD`;

      expect(clean(flat)).toBe(`Before ${"&".repeat(11)}`);
    });

    it("reads entities written several deep, and gives an empty text for ones that do not settle", () => {
      const nested = (levels: number) =>
        `Before &${"amp;".repeat(levels)}lt;atlas-example&${"amp;".repeat(levels)}gt;PAYLOAD`;

      expect(clean(nested(3))).toBe("Before");
      expect(clean(nested(6))).toBe("Before");
      expect(clean(nested(7))).toBe("");
      expect(clean(nested(40))).toBe("");
    });

    it("reads blocks that form blocks a few deep, and gives an empty text for ones that never settle", () => {
      // Taking out the inner block `x` joins the halves of the next one, `y`, and so on: a pass of
      // the cleaner takes out one layer.
      const layered = (layers: number) =>
        `Before ${"<atl".repeat(layers)}<atlas-example>x</atlas-example>` +
        "as-example>y</atlas-example>".repeat(layers - 1) +
        "as-example>PAYLOAD</atlas-example>";

      expect(clean(layered(1))).toBe("Before");
      expect(clean(layered(3))).toBe("Before");
      expect(clean(layered(30))).toBe("");
    });
  });

  describe("characters that are not seen", () => {
    it("takes them out", () => {
      expect(clean(`a${cp(0x200b)}b${cp(0xfeff)}c${cp(0x00ad)}d${cp(0x202e)}e${cp(0x2066)}f`)).toBe(
        "abcdef",
      );
      expect(clean(`a${cp(0)}b${cp(1)}c${cp(0x1f)}d${cp(0x7f)}e${cp(0x85)}f`)).toBe("abcdef");
      expect(clean(`x${cp(0xe0049, 0xe0067, 0xe006e, 0xe006f, 0xe0072, 0xe0065)}y`)).toBe("xy");
      expect(clean(`x${cp(0xfe00)}y${cp(0xe0100)}z`)).toBe("xyz");
    });

    it("keeps a tab and a line feed as white space, and no other control character", () => {
      expect(clean("a\tb\nc")).toBe("a b c");
      expect(clean("a\r\nb\rc")).toBe("a b c");
    });

    it("repairs a lone surrogate, which a database refuses", () => {
      expect(clean(`a${String.fromCharCode(0xd800)}b`)).toBe(`a${cp(0xfffd)}b`);
    });

    it("folds compatibility forms, so that a full-width < is a <", () => {
      expect(clean(`${cp(0xff1c)}b${cp(0xff1e)}bold${cp(0xff1c)}/b${cp(0xff1e)}`)).toBe("bold");
      expect(clean(`${cp(0xff21, 0xff22)} ${cp(0xfb01)}ne`)).toBe("AB fine");
    });
  });

  describe("the paragraph and the length", () => {
    it("keeps the first paragraph, up to the first blank line", () => {
      expect(clean("One.\n\nTwo.")).toBe("One.");
      expect(clean("One.\n \t \nTwo.")).toBe("One.");
      expect(clean("One.\r\n\r\nTwo.")).toBe("One.");
      expect(clean(`One.${cp(0x2028)}${cp(0x2029)}Two.`)).toBe("One.");
      expect(clean(`One.${cp(0x2029)}Two.`)).toBe("One. Two.");
      expect(clean(`One.\n${cp(0xa0)}\nTwo.`)).toBe("One.");
      expect(clean("One.\n\n\n\nTwo.")).toBe("One.");
    });

    it("skips the blank lines before the first paragraph", () => {
      expect(clean("\n\n  First.\n\nSecond.")).toBe("First.");
      expect(clean("   \n\t\n First.")).toBe("First.");
    });

    it("puts the paragraph on one line, with single spaces", () => {
      expect(clean("line one\nline two\n  line   three\t\tend")).toBe(
        "line one line two line three end",
      );
    });

    it("reads again what the single spaces bring together: a reference or a link that was too long", () => {
      // The patterns allow 100 characters inside a reference and 1,000 in the address of a link;
      // the white space made single spaces is within both, so what is left is cleaned once more.
      expect(clean(`Before [[a${" ".repeat(120)}b]] after`)).toBe("Before after");
      expect(clean(`Before [a](${" ".repeat(1200)}b) after`)).toBe("Before a after");
      expect(clean(`Before [a](${"\t".repeat(1200)}b) after`)).toBe("Before a after");
    });

    it("gives an empty text for an empty text, and for one that is only white space or markup", () => {
      expect(clean("")).toBe("");
      expect(clean("  \n\t ")).toBe("");
      expect(clean("<b></b><br>")).toBe("");
      expect(clean("[[a]][[b]]")).toBe("");
    });

    it("keeps a text of exactly the limit, and a shorter one, as they are", () => {
      const exact = "x".repeat(ATLAS_SUMMARY_CHARS);

      expect(clean(exact)).toBe(exact);
      expect(clean("short")).toBe("short");
    });

    it("cuts a longer text at the end of a word, within the limit", () => {
      const words = Array.from({ length: 300 }, (_, index) => `w${index}`);

      const out = clean(words.join(" "));

      expect(out.length).toBeLessThanOrEqual(ATLAS_SUMMARY_CHARS);
      expect(out.length).toBeGreaterThan(ATLAS_SUMMARY_CHARS - 10);
      expect(words.join(" ").startsWith(out)).toBe(true);
      expect(words.join(" ")[out.length]).toBe(" ");
      expect(out.endsWith(" ")).toBe(false);
    });

    it("cuts at the limit when a word ends exactly there", () => {
      const text = `${"x".repeat(ATLAS_SUMMARY_CHARS)} more`;

      expect(clean(text)).toBe("x".repeat(ATLAS_SUMMARY_CHARS));
    });

    it("drops a word the limit falls inside, and keeps the one before it", () => {
      const text = `${"a".repeat(595)} bbbbbbbbbb tail`;

      expect(clean(text)).toBe("a".repeat(595));
    });

    it("cuts inside a word that is longer than the limit", () => {
      expect(clean("x".repeat(700))).toBe("x".repeat(ATLAS_SUMMARY_CHARS));
    });

    it("never splits a surrogate pair", () => {
      const out = clean(`${"a".repeat(599)}${cp(0x1f600)}${cp(0x1f600)}`);

      expect(out).toBe("a".repeat(599));
      expect(out).not.toMatch(/[\uD800-\uDFFF]/u);
    });

    it("cuts after the compatibility forms are folded, which can make one character many", () => {
      const out = clean(cp(0xfdfa).repeat(100));

      expect(out.length).toBeLessThanOrEqual(ATLAS_SUMMARY_CHARS);
      expect(out.length).toBeGreaterThan(ATLAS_SUMMARY_CHARS - 20);
      expect(out).toBe(out.trim());
    });

    it("cuts at the limit that is given", () => {
      expect(clean("one two three four", 9)).toBe("one two");
      expect(clean("one two three four", 7)).toBe("one two");
      expect(clean("one two three four", 6)).toBe("one");
      expect(clean("onetwothree", 4)).toBe("onet");
      expect(clean("one two", 50)).toBe("one two");
    });

    it("cuts the text it reads at 20,000 characters, which a blocked-out text does not outrun", () => {
      const long = `${"<atlas-example>".repeat(1)}${"x".repeat(30_000)}`;

      expect(clean(long)).toBe("");
      expect(clean(`${"y ".repeat(30_000)}`).length).toBeLessThanOrEqual(ATLAS_SUMMARY_CHARS);
    });
  });

  describe("properties", () => {
    /** A small deterministic generator, so that a failure can be reproduced. */
    function generator(seed: number) {
      let state = seed >>> 0;
      const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      return {
        next,
        pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
        chance: (p: number) => next() < p,
      };
    }

    const LTS = ["<", "<", "<", "&lt;", "&#60;", "&#x3c;", "&amp;lt;", cp(0xff1c), "&#xff1c;"];
    const GTS = [">", ">", ">", "&gt;", "&#62;", "&#x3E;", "&amp;gt;", cp(0xff1e), "&#xff1e;"];
    const NAMES = ["atlas-example", "ATLAS-EXAMPLE", "Atlas-Example", "aTlAs-ExAmPlE"];
    const INVISIBLE = ["", "", "", cp(0x200b), cp(0xad), cp(0xfeff), cp(0x2060), cp(0)];
    const ATTRIBUTES = ["", "", ' class="x"', " id='a'", "  \n", "/"];
    const PROSE = ["alpha", "beta.", "gamma,", "delta", "the", "of", "and"];

    /** A tag of an example block, written in one of the ways above. */
    function tag(g: ReturnType<typeof generator>, closing: boolean): string {
      const name = g.pick(NAMES);
      const at = Math.floor(g.next() * name.length);
      const spelled = `${name.slice(0, at)}${g.pick(INVISIBLE)}${name.slice(at)}`;
      return `${g.pick(LTS)}${closing ? "/" : ""}${spelled}${closing ? "" : g.pick(ATTRIBUTES)}${g.pick(GTS)}`;
    }

    /** A block with a payload inside it, which may hold another block, or be left unclosed. */
    function block(g: ReturnType<typeof generator>, depth: number): string {
      const inner: string[] = [];
      for (let index = 0; index < 1 + Math.floor(g.next() * 3); index += 1) {
        inner.push(
          g.chance(0.3) && depth < 2
            ? block(g, depth + 1)
            : g.pick(["PAYLOAD", "PAYLOAD\n\nPAYLOAD", "<b>PAYLOAD</b>", "PAYLOAD &amp; PAYLOAD"]),
        );
      }
      return `${tag(g, false)}${inner.join(g.pick([" ", "\n", ""]))}${g.chance(0.85) ? tag(g, true) : ""}`;
    }

    function document(g: ReturnType<typeof generator>): string {
      const parts: string[] = [];
      for (let index = 0; index < 1 + Math.floor(g.next() * 4); index += 1) {
        parts.push(g.pick(PROSE), g.chance(0.7) ? block(g, 0) : g.pick(PROSE));
        if (g.chance(0.3)) parts.push(g.pick(["\n\n", "\n"]));
      }
      return parts.join(g.pick([" ", "", "\n"]));
    }

    it("takes the payload out of 600 documents whose blocks are written in every way the cleaner reads", () => {
      const g = generator(20291101);
      for (let index = 0; index < 600; index += 1) {
        const text = document(g);

        const out = clean(text);

        expect({ text, out: out.includes("PAYLOAD") ? out : "" }).toEqual({ text, out: "" });
      }
    });

    it("gives text that is within the limit, is on one line, holds no markup, and is cleaned again as it is", () => {
      const pieces = [
        "<",
        ">",
        "</",
        "/>",
        "<atlas-example>",
        "</atlas-example>",
        "<b>",
        "&lt;",
        "&gt;",
        "&amp;",
        "&#60;",
        "&",
        ";",
        "[",
        "]",
        "(",
        ")",
        "[[",
        "]]",
        "](",
        "![",
        "\n",
        "\n\n",
        " ",
        "\t",
        "word",
        "PAYLOAD",
        "R&D",
        cp(0x200b),
        cp(0xff1c),
        cp(0xe0041),
        cp(0x1f600),
        "x".repeat(50),
      ];
      const g = generator(7);
      for (let index = 0; index < 2000; index += 1) {
        const text = Array.from({ length: 1 + Math.floor(g.next() * 40) }, () =>
          g.pick(pieces),
        ).join(g.pick(["", " "]));

        const out = clean(text);

        expect(out.length).toBeLessThanOrEqual(ATLAS_SUMMARY_CHARS);
        expect(out).not.toMatch(/\n|\t|\r|\s{2}/);
        expect(out).toBe(out.trim());
        expect(out).not.toMatch(/<[A-Za-z/!?]/);
        expect(out).not.toMatch(/<atlas-example/i);
        expect(out).not.toMatch(/\[\[[^[\]]{0,100}\]\]/);
        expect(out).not.toMatch(/[\p{Cc}\p{Cf}\p{Variation_Selector}]/u);
        expect(out).not.toMatch(/[\uD800-\uDFFF]/u);
        expect(clean(out)).toBe(out);
      }
    });

    it("is cleaned again as it is, for every text of this file", () => {
      const texts = [
        V6,
        ...Object.values<Fields>(parseYaml(V6, { schema: "core" })["case-studies"]).map((entry) =>
          String(entry.description),
        ),
      ];
      for (const text of texts) {
        const out = clean(text);

        expect(clean(out)).toBe(out);
      }
    });
  });

  describe("time", () => {
    const N = 20_000;
    const repeated = (unit: string, chars = N) =>
      unit.repeat(Math.ceil(chars / unit.length)).slice(0, chars);

    it.each<[string, string]>([
      ["opening brackets", repeated("[")],
      ["closing brackets", repeated("]")],
      ["the start of links", repeated("[a](")],
      ["links with long text", repeated(`[${"a".repeat(399)}](`)],
      ["links with long addresses", repeated(`[a](${"x".repeat(900)}`)],
      ["links with nested parentheses", repeated("[a]((((((((")],
      ["links with nested brackets", repeated("[[[[a]]]](x")],
      ["the start of references", repeated("[[")],
      ["long references", repeated(`[[${"a".repeat(99)}`)],
      ["less-than signs", repeated("<")],
      ["tags never closed", repeated("<a")],
      ["tags never closed, with space", repeated("<a ")],
      ["opening example tags", repeated("<atlas-example>")],
      ["closing example tags", repeated("</atlas-example>")],
      ["empty example blocks", repeated("<atlas-example></atlas-example>")],
      ["example tags never ended", repeated("<atlas-example ")],
      ["closing example tags never ended", repeated("<atlas-example>x</atlas-example y ")],
      [
        "blocks that make blocks",
        "<atl".repeat(1000) + "<atlas-example></atlas-example>" + "as-example>".repeat(1000),
      ],
      ["ampersands", repeated("&")],
      ["entities", repeated("&amp;")],
      ["entities that make tags", repeated("&lt;a&gt;")],
      ["entities written deep", `${"&amp;".repeat(2000)}lt;`],
      ["references", repeated("&#x3c;")],
      ["white space around a letter", `${repeated(" ")}x${repeated(" ")}`],
      ["line feeds", repeated("\n")],
      ["blank lines", repeated("\n \n")],
      ["characters that are not seen", repeated(cp(0x200b))],
      ["combining marks", `e${repeated(cp(0x0301), N - 1)}`],
      ["emoji", repeated(cp(0x1f600))],
      ["a character that the folding makes eighteen", repeated(cp(0xfdfa))],
      ["tags and text", repeated("<b>x</b> ")],
      ["comments never closed", repeated("<!-- x ")],
    ])("takes a fraction of a second for %s", (_name, text) => {
      const started = Date.now();

      clean(text);

      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });
});

describe("text of a case study that holds a run of millions of units", () => {
  const MEGABYTE = 1024 * 1024;

  it("reads a target and a description with a run of white space of five million units", () => {
    // A target is read to its first 100,000 units, so what follows the run is not read.
    expect(atlasKeysOf(`Acme Corp${" ".repeat(5 * MEGABYTE)}Zed`)).toEqual(
      atlasKeysOf("Acme Corp"),
    );
    expect(cleanCaseStudyText(`First${" ".repeat(5 * MEGABYTE)}paragraph`, 100)).toBe("First");
    expect(cleanCaseStudyText(`First${" ".repeat(1000)}paragraph`, 100)).toBe("First paragraph");
    expect(cleanCaseStudyText(`First\n${" ".repeat(5 * MEGABYTE)}\nSecond`, 100)).toBe("First");
  });
});
