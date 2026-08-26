FROM node:26-alpine3.22

# Security: guarantee production mode in the published image.
# Without this, cookies lose the Secure flag, Swagger docs are exposed,
# and dev code paths activate if NODE_ENV is not set elsewhere.
ENV NODE_ENV=production

WORKDIR /app
COPY ./package.json ./package-lock.json ./

# Increase timeout and use cache for cross-platform builds.
# --include=dev is required even though NODE_ENV=production: devDependencies
# (patch-package for the postinstall patches, typescript for `npm run build`)
# are needed to build the image. NODE_ENV=production still governs runtime.
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retries 5 && \
    npm ci --include=dev --prefer-offline --no-audit || npm install --include=dev

# Install Playwright dependencies and git for Alpine
# Note: Playwright requires chromium and its dependencies
# Git is required for AI detection repository scanning
# apk upgrade pulls the latest security patches so Trivy release scans
# don't fail on fixable base-image CVEs.
RUN apk upgrade --no-cache && \
    apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-cjk \
    git

# Set Playwright to use installed Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY ./ ./
COPY ./SQL_Commands.sql ./SQL_Commands.sql

RUN npm run build

# Strip the package managers from the runtime image. npm/npx/corepack are only
# needed at build time (npm ci + npm run build, both done above). Their bundled
# transitive deps (tar, undici, brace-expansion, ip-address, sigstore, ...)
# carry a steady stream of fixable CRITICAL/HIGH CVEs that Trivy flags on the
# release scan even though they never run in production. Runtime startup and DB
# migrations use `node` and the local sequelize CLI directly (see start.sh).
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /root/.npm

COPY ./templates ./dist/templates

# Install dcron with error handling for ARM64 QEMU issues
RUN apk add --no-cache dcron || apk add --no-cache --force-broken-world dcron
RUN touch /var/log/cron.log
RUN echo "0 0 * * * TZ=UTC cd /app && node dist/utils/logger/upload-logs-to-do.js >> /var/log/cron.log 2>&1" > /etc/crontabs/root

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

COPY ./start.sh ./start.sh
RUN chmod +x ./start.sh

CMD ["./start.sh"]
