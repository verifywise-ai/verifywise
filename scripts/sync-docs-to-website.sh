#!/bin/bash

# Sync Documentation from VerifyWise App to Website
# Run from verifywise root: ./scripts/sync-docs-to-website.sh

APP_ROOT="/Users/gorkemcetin/verifywise"
WEBSITE_ROOT="/Users/gorkemcetin/website/verifywise"

echo "Syncing VerifyWise documentation to website..."
echo ""

# ===========================================
# PART 1: USER GUIDE
# ===========================================
echo "========================================"
echo "User Guide"
echo "========================================"

# Sync content files
echo "1. Copying content files..."
rm -rf "$WEBSITE_ROOT/content/user-guide"
cp -r "$APP_ROOT/shared/user-guide-content" "$WEBSITE_ROOT/content/user-guide"
echo "   ✓ Content copied to website/content/user-guide/"

# Sync images
echo ""
echo "2. Copying images..."
mkdir -p "$WEBSITE_ROOT/public/images/user-guide"
rm -rf "$WEBSITE_ROOT/public/images/user-guide"/*
cp -r "$APP_ROOT/Clients/public/images/user-guide"/* "$WEBSITE_ROOT/public/images/user-guide/"
IMAGE_COUNT=$(ls "$WEBSITE_ROOT/public/images/user-guide" | wc -l | tr -d ' ')
echo "   ✓ $IMAGE_COUNT images copied to website/public/images/user-guide/"

echo ""

# ===========================================
# PART 2: API DOCUMENTATION
# ===========================================
echo "========================================"
echo "API Documentation"
echo "========================================"

# Run the split script to regenerate endpoint files
echo "3. Regenerating endpoint files..."
if [ -f "$APP_ROOT/scripts/split-api-endpoints.js" ]; then
  node "$APP_ROOT/scripts/split-api-endpoints.js"
  ENDPOINT_COUNT=$(ls "$WEBSITE_ROOT/content/api-docs/endpoints"/*.ts 2>/dev/null | wc -l | tr -d ' ')
  echo "   ✓ $ENDPOINT_COUNT endpoint files generated"
else
  echo "   ⚠ Split script not found at $APP_ROOT/scripts/split-api-endpoints.js"
fi

echo ""
echo "========================================"
echo "Done! Documentation has been synced to website."
echo "========================================"
