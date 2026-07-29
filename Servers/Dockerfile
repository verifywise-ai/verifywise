FROM node:24-alpine3.20

# Security: guarantee production mode in the published image.
# Without this, cookies lose the Secure flag, Swagger docs are exposed,
# and dev code paths activate if NODE_ENV is not set elsewhere.
ENV NODE_ENV=production

WORKDIR /app
COPY ./package.json ./

# Increase timeout and use cache for cross-platform builds
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retries 5 && \
    npm ci --prefer-offline --no-audit || npm install

# Install Playwright dependencies and git for Alpine
# Note: Playwright requires chromium and its dependencies
# Git is required for AI detection repository scanning
RUN apk add --no-cache \
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

COPY ./templates ./dist/templates

# Install dcron with error handling for ARM64 QEMU issues
RUN apk add --no-cache dcron || apk add --no-cache --force-broken-world dcron
RUN touch /var/log/cron.log
RUN echo "0 0 * * * TZ=UTC cd /app && node dist/utils/logger/upload-logs-to-do.js >> /var/log/cron.log 2>&1" > /etc/crontabs/root

EXPOSE 3000

COPY ./start.sh ./start.sh
RUN chmod +x ./start.sh

CMD ["./start.sh"]
