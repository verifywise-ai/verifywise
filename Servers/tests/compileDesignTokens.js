/**
 * Compiles shared/design-tokens into Servers/tools/design-tokens.
 * The server tsconfig rootDir is Servers/, so tsc cannot import the shared
 * TypeScript directly. Build and Jest compile it first. postbuild copies
 * the output into dist/tools/design-tokens for the running server.
 */
const { execSync } = require("node:child_process");
const path = require("node:path");

function compileDesignTokens() {
  execSync("npx tsc -p ../shared/design-tokens/tsconfig.json --outDir tools/design-tokens", {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
}

module.exports = async function globalSetup() {
  compileDesignTokens();
};

module.exports.compileDesignTokens = compileDesignTokens;
