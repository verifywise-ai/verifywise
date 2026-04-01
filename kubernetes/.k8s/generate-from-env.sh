#!/bin/bash

# Script to generate Kubernetes ConfigMap and Secret from .env file
# Usage: ./generate-from-env.sh [env-file] [output-dir]

set -e

ENV_FILE="${1:-../.env.prod}"
OUTPUT_DIR="${2:-./}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file '$ENV_FILE' not found"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Define sensitive keys that should go into secrets
SENSITIVE_KEYS=(
    "SUPERADMIN_EMAIL"
    "SUPERADMIN_PASSWORD"
    "DB_USER"
    "DB_PASSWORD"
    "DB_NAME"
    "JWT_SECRET"
    "REFRESH_TOKEN_SECRET"
    "ENCRYPTION_PASSWORD"
    "ENCRYPTION_ALGORITHM"
    "SLACK_CLIENT_SECRET"
    "SLACK_BOT_TOKEN"
    "SLACK_USER_OAUTH_TOKEN"
    "RESEND_API_KEY"
    "SMTP_PASS"
    "EXCHANGE_ONLINE_PASS"
    "EXCHANGE_ONPREM_PASS"
    "AWS_SES_ACCESS_KEY_ID"
    "AWS_SES_SECRET_ACCESS_KEY"
)

# Function to check if a key is sensitive
is_sensitive() {
    local key=$1
    for sensitive in "${SENSITIVE_KEYS[@]}"; do
        if [ "$key" = "$sensitive" ]; then
            return 0
        fi
    done
    return 1
}

# Function to base64 encode
b64encode() {
    echo -n "$1" | base64 | tr -d '\n'
}

echo "Generating Kubernetes manifests from $ENV_FILE..."

# Create ConfigMap YAML
cat > "$OUTPUT_DIR/configmap-generated.yaml" << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: verifywise-config
  namespace: verifywise
  labels:
    app: verifywise
data:
EOF

# Create Secret YAML
cat > "$OUTPUT_DIR/secrets-generated.yaml" << 'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: verifywise-secrets
  namespace: verifywise
  labels:
    app: verifywise
type: Opaque
data:
EOF

# Parse .env file and distribute to ConfigMap or Secret
while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue

    # Remove leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)

    # Remove quotes from value if present
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"

    if [ -z "$value" ]; then
        continue
    fi

    if is_sensitive "$key"; then
        # Add to secrets (base64 encoded)
        encoded_value=$(b64encode "$value")
        echo "  $key: $encoded_value" >> "$OUTPUT_DIR/secrets-generated.yaml"
        echo "  ✓ Added $key to secrets"
    else
        # Add to configmap (plain text, but quoted for YAML safety)
        # Escape special YAML characters
        if [[ "$value" =~ ^[\[\{] ]]; then
            # JSON-like values, use single quotes
            echo "  $key: '$value'" >> "$OUTPUT_DIR/configmap-generated.yaml"
        else
            echo "  $key: \"$value\"" >> "$OUTPUT_DIR/configmap-generated.yaml"
        fi
        echo "  ✓ Added $key to configmap"
    fi
done < "$ENV_FILE"

echo ""
echo "✅ Generated files:"
echo "  - $OUTPUT_DIR/configmap-generated.yaml"
echo "  - $OUTPUT_DIR/secrets-generated.yaml"
echo ""
echo "To apply to your cluster:"
echo "  kubectl apply -f $OUTPUT_DIR/configmap-generated.yaml"
echo "  kubectl apply -f $OUTPUT_DIR/secrets-generated.yaml"
echo ""
echo "⚠️  Remember to add secrets-generated.yaml to .gitignore if not already ignored!"
