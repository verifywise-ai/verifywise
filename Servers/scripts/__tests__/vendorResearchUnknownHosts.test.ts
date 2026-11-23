/**
 * The unknown-host script (M2 Task 11, Ruling 13 of the M2 plan): the hosts the source registry has
 * not reviewed that findings cited, read from the traces of completed runs, counted by runs and by
 * organizations. It prints host names and counts only. The query is a fake here; the integration
 * test runs the real one.
 */
jest.mock("../../database/db", () => ({ sequelize: { close: jest.fn(), query: jest.fn() } }));

import { type UnknownHost, main } from "../vendorResearchUnknownHosts";

function printed() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    write: (text: string) => out.push(text),
    error: (text: string) => err.push(text),
  };
}

const queryOf = (hosts: UnknownHost[]) => jest.fn().mockResolvedValue(hosts);

describe("vendorResearchUnknownHosts", () => {
  it("prints hosts with run and organization counts", async () => {
    const query = queryOf([
      { host: "blog.example", runs: 12, organizations: 3 },
      { host: "news.example", runs: 1, organizations: 1 },
    ]);
    const lines = printed();

    const code = await main([], lines.write, lines.error, query);

    expect(code).toBe(0);
    expect(query).toHaveBeenCalledWith(90, 50);
    expect(lines.out).toEqual([
      "Hosts the source registry has not reviewed, cited by findings of completed runs in the last 90 days (at most 50, by runs):",
      "blog.example: 12 runs, 3 organizations",
      "news.example: 1 run, 1 organization",
    ]);
    expect(lines.err).toEqual([]);
  });

  it("takes the days and the number of hosts", async () => {
    const query = queryOf([]);
    const lines = printed();

    await expect(
      main(["--days", "30", "--limit", "5"], lines.write, lines.error, query),
    ).resolves.toBe(0);
    await expect(
      main(["--limit", "500", "--days", "3650"], lines.write, lines.error, query),
    ).resolves.toBe(0);
    await expect(
      main(["--days", "1", "--limit", "1"], lines.write, lines.error, query),
    ).resolves.toBe(0);

    expect(query.mock.calls).toEqual([
      [30, 5],
      [3650, 500],
      [1, 1],
    ]);
  });

  it("refuses a bad --days", async () => {
    const query = queryOf([]);
    const lines = printed();

    for (const argv of [
      ["--days", "0"],
      ["--days", "3651"],
      ["--days", "x"],
      ["--days", "1.5"],
      ["--days", "-3"],
      ["--days", "07"],
      ["--days"],
      ["--days", "30", "--days", "40"],
      ["--limit", "0"],
      ["--limit", "501"],
      ["--organization", "3"],
      ["30"],
    ]) {
      expect(await main(argv, lines.write, lines.error, query)).toBe(2);
    }

    expect(query).not.toHaveBeenCalled();
    expect(lines.out).toEqual([]);
    expect(
      lines.err.every((line) =>
        line.endsWith(
          "Usage: npx ts-node scripts/vendorResearchUnknownHosts.ts [--days N (1 to 3650, default 90)] [--limit N (1 to 500, default 50)]",
        ),
      ),
    ).toBe(true);
  });

  it("says so when there is none", async () => {
    const lines = printed();

    await expect(main(["--days", "7"], lines.write, lines.error, queryOf([]))).resolves.toBe(0);

    expect(lines.out).toEqual([
      "No finding of a completed run in the last 7 days cited a host the source registry has not reviewed.",
    ]);
  });

  it("a database that fails exits 2 with the error's name, never its message", async () => {
    const failure = Object.assign(
      new Error("password authentication failed for user vw at db.internal"),
      {
        name: "SequelizeConnectionError",
      },
    );
    const lines = printed();

    await expect(
      main([], lines.write, lines.error, jest.fn().mockRejectedValue(failure)),
    ).resolves.toBe(2);

    expect(lines.err).toEqual(["The hosts could not be read (SequelizeConnectionError)."]);
    expect(lines.out).toEqual([]);
  });

  it("prints a host without the characters a terminal would act on", async () => {
    const lines = printed();
    const escape = String.fromCharCode(27);

    await main(
      [],
      lines.write,
      lines.error,
      queryOf([{ host: `evil${escape}[2J.example\nnext`, runs: 2, organizations: 1 }]),
    );

    expect(lines.out[1]).toBe("evil?[2J.example?next: 2 runs, 1 organization");
  });
});
