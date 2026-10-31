/* eslint-disable */
"use strict";

/**
 * A throwaway PostgreSQL cluster for one-off checks. It runs initdb into a
 * temporary directory, starts the server on a free TCP port with no Unix
 * socket (so long temp paths are fine), hands the caller a pg Client and a
 * Sequelize instance, then stops the server and deletes the directory. It
 * never touches the dev database.
 *
 * Needs `initdb` and `pg_ctl` on PATH. Set CHECK_PG_BIN to their directory if
 * they are elsewhere (for example /opt/homebrew/opt/postgresql@16/bin).
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { Client } = require("pg");
const { Sequelize } = require("sequelize");

function bin(name) {
  return process.env.CHECK_PG_BIN ? path.join(process.env.CHECK_PG_BIN, name) : name;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(config) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const client = new Client(config);
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("The throwaway Postgres did not start");
}

/**
 * Run `fn({ client, sequelize })` against a fresh cluster. The `postgres`
 * database gets a `verifywise` schema, and new sessions use it first on the
 * search_path, so unqualified application SQL resolves as it does in the app.
 */
async function withThrowawayPostgres(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-pg-"));
  const dataDir = path.join(dir, "data");
  const port = await freePort();
  execFileSync(bin("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust"], {
    stdio: "ignore",
  });
  execFileSync(
    bin("pg_ctl"),
    [
      "-D",
      dataDir,
      "-o",
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,
      "-l",
      path.join(dir, "log"),
      "-w",
      "start",
    ],
    { stdio: "ignore" },
  );
  const config = { host: "127.0.0.1", port, user: "postgres", database: "postgres" };
  let client;
  let sequelize;
  try {
    await waitForServer(config);
    client = new Client(config);
    await client.connect();
    await client.query(
      "CREATE SCHEMA verifywise; ALTER DATABASE postgres SET search_path TO verifywise, public;",
    );
    await client.query("SET search_path TO verifywise, public;");
    sequelize = new Sequelize("postgres", "postgres", "", {
      host: "127.0.0.1",
      port,
      dialect: "postgres",
      logging: false,
    });
    await fn({ client, sequelize });
  } finally {
    if (sequelize) await sequelize.close();
    if (client) await client.end();
    try {
      execFileSync(bin("pg_ctl"), ["-D", dataDir, "-m", "immediate", "stop"], {
        stdio: "ignore",
      });
    } catch {
      // Already stopped.
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { withThrowawayPostgres };
