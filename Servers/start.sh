#!/bin/sh

# NOTE: Starts the cron daemon, the BullMQ worker, runs DB migrations, then the
# Node.js application in the docker container. Invoked as the container CMD.
#
# Uses `node` and the local sequelize CLI directly (no npm/npx) so the runtime
# image can ship without a package manager — this keeps npm's bundled
# dependency CVEs out of the released image (see Dockerfile).

# Start cron daemon in background
crond

# Start the worker process in background (was: npm run worker)
node dist/jobs/worker.js &

# Run database migrations, then start the app in the foreground
# (was: npm start -> "npm run migrate-db && node dist/index.js").
./node_modules/.bin/sequelize db:migrate --debug && exec node dist/index.js
