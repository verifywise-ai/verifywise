# Building the Frontend Docker Image

## Important: Build Context

This Dockerfile requires the **parent directory** as the build context because it needs access to the `../shared/user-guide-content` directory for the `@user-guide-content` TypeScript path alias.

## Build Command

**From the project root directory (`verifywise/`):**

```bash
docker build -f Clients/Dockerfile -t verifywise-frontend .
```

**DO NOT run from the Clients directory:**

```bash
# ❌ WRONG - This will fail
cd Clients && docker build -t verifywise-frontend .
```

## What the Dockerfile Does

1. Copies `Clients/package.json` and `Clients/package-lock.json`
2. Installs dependencies
3. **Copies `shared/` directory** (required for `@user-guide-content` alias)
4. Copies all `Clients/` files
5. Builds the application with Vite
6. Serves the built files with NGINX

## Build Arguments

The following build arguments are supported:

- `VITE_SLACK_CLIENT_ID` - Slack OAuth client ID
- `VITE_APP_VERSION` - Application version string

Example with build args:

```bash
docker build \
  -f Clients/Dockerfile \
  --build-arg VITE_SLACK_CLIENT_ID=your_slack_id \
  --build-arg VITE_APP_VERSION=1.0.0 \
  -t verifywise-frontend \
  .
```

## Troubleshooting

### Error: "Cannot find module '@user-guide-content/...'"

This means the build context is incorrect. Make sure you're running the build command from the **project root directory** (where `shared/` directory is located), not from the `Clients/` directory.

### Error: "COPY failed: file not found"

Verify that:

1. You're in the project root directory (`verifywise/`)
2. The `shared/` directory exists at the same level as `Clients/`
3. The `Clients/` directory contains all necessary files
