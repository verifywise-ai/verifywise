/**
 * MCP server installation, for the super admin console.
 *
 * The MCP server source ships alongside the backend (MCPServer/). "Installing"
 * it means running its dependency install and TypeScript build so that
 * dist/index.js exists and can be registered with an MCP client.
 *
 * In the published Docker image the build already happened at image build time
 * and npm is deliberately removed from the runtime layer, so there is nothing
 * to install and `canInstall` reports false. On a source checkout npm is
 * present and the install runs on demand.
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import logger from "./logger/fileLogger";

const execFileAsync = promisify(execFile);

/** npm install + tsc on a handful of files; generous, but not unbounded. */
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/** Name the server is registered under in Claude Code. */
export const MCP_CLIENT_NAME = "verifywise";

export interface McpServerStatus {
  /** The built entry point exists and can be registered with a client. */
  installed: boolean;
  /** Registered with the Claude Code CLI on this machine. */
  registered: boolean;
  /** The Claude Code CLI is on PATH, so registration can be managed here. */
  claudeCliAvailable: boolean;
  /** MCPServer/ source is present next to the running backend. */
  sourcePresent: boolean;
  /** Absolute path of dist/index.js, when the source was found. */
  entryPoint: string | null;
  /** npm is available, so an install can be run from here. */
  canInstall: boolean;
}

/**
 * Locate MCPServer/ relative to the running process.
 *
 * `/app/MCPServer` in the container (cwd is /app), `../MCPServer` from a source
 * checkout where the backend runs out of Servers/. Nothing is guessed beyond
 * these two: a wrong directory would mean running npm somewhere unexpected.
 */
export function locateMcpServer(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "MCPServer"),
    path.resolve(process.cwd(), "..", "MCPServer"),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, "package.json"))) ?? null;
}

async function isNpmAvailable(): Promise<boolean> {
  try {
    await execFileAsync("npm", ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function isClaudeCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync("claude", ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether Claude Code already knows about this server.
 *
 * `claude mcp get` exits non-zero for an unknown name, which is the whole test.
 */
async function isRegistered(): Promise<boolean> {
  try {
    await execFileAsync("claude", ["mcp", "get", MCP_CLIENT_NAME], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Register the built server with Claude Code at user scope, so it is available
 * in every project rather than only the directory the backend happens to run in.
 *
 * Re-registering an existing name fails, so an existing entry is removed first —
 * this also repoints a stale entry at a moved checkout.
 */
async function registerWithClaudeCode(entryPoint: string): Promise<void> {
  if (await isRegistered()) {
    await execFileAsync("claude", ["mcp", "remove", MCP_CLIENT_NAME], { timeout: 15_000 });
  }
  await execFileAsync(
    "claude",
    ["mcp", "add", "--scope", "user", MCP_CLIENT_NAME, "--", "node", entryPoint],
    { timeout: 30_000 },
  );
}

async function deregisterFromClaudeCode(): Promise<void> {
  if (await isRegistered()) {
    await execFileAsync("claude", ["mcp", "remove", MCP_CLIENT_NAME], { timeout: 15_000 });
  }
}

export async function getMcpServerStatus(): Promise<McpServerStatus> {
  const root = locateMcpServer();
  const claudeCliAvailable = await isClaudeCliAvailable();

  if (!root) {
    return {
      installed: false,
      registered: false,
      claudeCliAvailable,
      sourcePresent: false,
      entryPoint: null,
      canInstall: false,
    };
  }

  const entryPoint = path.join(root, "dist", "index.js");
  const installed = fs.existsSync(entryPoint);

  return {
    installed,
    registered: claudeCliAvailable ? await isRegistered() : false,
    claudeCliAvailable,
    sourcePresent: true,
    entryPoint,
    // Already built: nothing to install, so don't advertise the ability.
    canInstall: installed ? false : await isNpmAvailable(),
  };
}

/**
 * Run the MCP server's install and build.
 *
 * Fixed commands in a fixed directory with no caller-supplied input, run
 * through execFile rather than a shell, so there is no argument to inject into.
 */
/**
 * Remove the build output and installed dependencies.
 *
 * Only the two generated directories are deleted — the source stays, so the
 * server can be installed again from the console without re-fetching anything.
 */
export async function uninstallMcpServer(): Promise<McpServerStatus> {
  const root = locateMcpServer();
  if (!root) {
    throw new Error("MCP server source not found next to the backend.");
  }

  if (await isClaudeCliAvailable()) {
    await deregisterFromClaudeCode();
  }

  for (const generated of ["dist", "node_modules"]) {
    fs.rmSync(path.join(root, generated), { recursive: true, force: true });
  }
  logger.debug(`🗑️ MCP server build removed from ${root}`);

  return getMcpServerStatus();
}

export async function installMcpServer(): Promise<McpServerStatus> {
  const root = locateMcpServer();
  if (!root) {
    throw new Error("MCP server source not found next to the backend.");
  }
  if (!(await isNpmAvailable())) {
    throw new Error(
      "npm is not available in this environment, so the MCP server cannot be built here.",
    );
  }

  const options = { cwd: root, timeout: INSTALL_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 };

  logger.debug(`🛠️ Installing MCP server in ${root}`);
  await execFileAsync("npm", ["install", "--no-audit", "--no-fund"], options);
  await execFileAsync("npm", ["run", "build"], options);
  logger.debug(`✅ MCP server built in ${root}`);

  // Registering is what actually makes it usable. Only possible when Claude
  // Code runs on this machine; elsewhere the console shows the command instead.
  if (await isClaudeCliAvailable()) {
    await registerWithClaudeCode(path.join(root, "dist", "index.js"));
    logger.debug(`✅ MCP server registered with Claude Code as ${MCP_CLIENT_NAME}`);
  }

  return getMcpServerStatus();
}
