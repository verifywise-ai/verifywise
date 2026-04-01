# Step 1: Use a Node.js base image
FROM node:25-alpine AS build

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

# Step 9: Use a lightweight web server for production
FROM nginx:1.29-alpine

# Step 10: Copy the build output to NGINX's default public directory
COPY --from=build /app/src/dist /usr/share/nginx/html

# Step 11: Copy the custom error page
# COPY Clients/upgrade.html /usr/share/nginx/html/upgrade.html

# Step 12: Copy the custom NGINX configuration
COPY Clients/nginx.conf /etc/nginx/conf.d/default.conf

# Step 13: Expose port 80
EXPOSE 80

# Step 14: Start NGINX server
CMD ["nginx", "-g", "daemon off;"]
