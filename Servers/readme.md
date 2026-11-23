# Servers

Node.js API for VerifyWise. This page is a pointer. Patterns, multi-tenancy, and migrations live in [CLAUDE.md](./CLAUDE.md). Architecture and domain docs live under [docs/technical/](../docs/technical/).

## Quickstart

From the repository root:

```bash
cd Servers
npm install
npm run watch
```

`npm run watch` compiles TypeScript, and on each successful build runs the API (`npm start`, which applies migrations) and the BullMQ worker together.

Apply migrations on their own with `npm run migrate-db` after `npm run build`. Framework migrations load `dist/structures`, so the build has to come first. See [CLAUDE.md](./CLAUDE.md).

## Commands

Names match the `scripts` section of `Servers/package.json`.

| Command | What it runs |
| --- | --- |
| `npm run build` | `tsc`. `prebuild` compiles design tokens; `postbuild` copies runtime files into `dist/`. |
| `npm run watch` | `tsc-watch`. On success: `postbuild`, then the API and the BullMQ worker. |
| `npm run migrate-db` | `npx sequelize db:migrate --debug` |
| `npm run test:unit` | Jest unit tests. Ignores `tests/integration/` and `helpers/`. `npm run test` is this script. |
| `npm run test:integration` | Jest tests in `tests/integration/`, one file at a time, with the integration global setup. |

`npm run test` does not include integration tests.
