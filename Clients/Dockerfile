# Step 1: Use a Node.js base image
FROM node:26-alpine AS build

# Increase Node.js memory limit for the build
# ENV NODE_OPTIONS="--max_old_space_size=4096"

# Step 2: Set the working directory
WORKDIR /app

# Step 3: Copy the shared directory (needed for @user-guide-content alias)
# This will be at /app/shared, accessible via ../shared from /app/src
COPY shared/ /app/shared/

# Copy version.json (needed by vite.config.ts for __APP_VERSION__)
COPY version.json /app/version.json

# Step 4: Set working directory to /app/src for the client app
WORKDIR /app/src

# Step 5: Copy only package.json (not package-lock.json)
# This allows npm to generate a fresh lock file for Linux Alpine with correct platform binaries
COPY Clients/package.json ./

# Step 6: Install dependencies fresh for Linux platform
# This ensures platform-specific binaries (like @rollup/rollup-linux-x64-musl) are correctly installed
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retries 5 && \
    npm install --legacy-peer-deps

# Step 7: Copy the rest of the Clients application files
COPY Clients/ .

ARG VITE_SLACK_CLIENT_ID
ENV VITE_SLACK_CLIENT_ID=$VITE_SLACK_CLIENT_ID

ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Step 8: Build the application
RUN npm run build

# Step 9: Use a lightweight web server for production. The "web" stage is the
# server without the app, so Clients/scripts/test-nginx-proxy.sh can build and
# test it (`--target web`) without running the npm build.
FROM nginx:1.31.6-alpine AS web

# apk upgrade pulls the latest Alpine security patches so Trivy release scans
# don't fail on fixable base-image CVEs (e.g. util-linux CVE-2026-53612..53614,
# CVE-2026-76642, CVE-2026-78408..78410 on libuuid, fixed in 2.42.3-r1).
# The nginx alpine base lags behind the Alpine main repo.
RUN apk upgrade --no-cache

# Step 10: Copy the custom error page
# COPY Clients/upgrade.html /usr/share/nginx/html/upgrade.html

# Step 11: Copy the custom NGINX configuration as a template. At startup the
# nginx entrypoint writes it to /etc/nginx/conf.d/default.conf, filling in only
# the variables the filter allows (nginx's own $host etc. are left alone).
# VW_BACKEND_URL is where /api and /v1 are proxied: scheme, host and port only,
# no path. docker-compose sets it from BACKEND_PORT; Kubernetes sets the
# backend Service's full DNS name (nginx's resolver does not use search domains).
# VW_TRUSTED_PROXIES: proxies whose X-Forwarded-For gives the client address
# (space-separated addresses or CIDRs). Empty by default, so no forwarded
# address is believed; docker-compose.yml sets it for its host-proxy setup.
ENV VW_BACKEND_URL=http://backend:3000 \
    VW_TRUSTED_PROXIES="" \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER="^(VW_BACKEND_URL|NGINX_LOCAL_RESOLVERS)"
COPY --chmod=755 Clients/docker-entrypoint.d/18-verifywise.envsh /docker-entrypoint.d/
COPY Clients/nginx.conf /etc/nginx/templates/default.conf.template

# Step 12: Expose port 80
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:80/ >/dev/null || exit 1

# Step 13: Start NGINX server
CMD ["nginx", "-g", "daemon off;"]

# Step 14: The production image: the web server plus the built app
FROM web
COPY --from=build /app/src/dist /usr/share/nginx/html
