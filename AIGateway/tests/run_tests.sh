#!/bin/bash
#
# AI Gateway E2E Test Runner
#
# Prerequisites:
#   - Express backend running on port 3000
#   - AI Gateway running on port 8100
#   - PostgreSQL + Redis running
#
# Usage:
#   VW_PASSWORD=your-password ./tests/run_tests.sh
#   VW_PASSWORD=your-password ./tests/run_tests.sh -k "test_scan"  # run specific tests
#   VW_PASSWORD=your-password ./tests/run_tests.sh -v              # verbose output

set -e

cd "$(dirname "$0")/.."

if [ -z "$VW_PASSWORD" ]; then
  echo "ERROR: VW_PASSWORD is required"
  echo "Usage: VW_PASSWORD=your-password ./tests/run_tests.sh"
  exit 1
fi

# Install test dependencies if needed
pip install -q pytest pytest-asyncio httpx 2>/dev/null

echo "Running AI Gateway E2E tests..."
echo "  Backend: ${BACKEND_URL:-http://localhost:3000}"
echo "  Gateway: ${GATEWAY_URL:-http://localhost:8100}"
echo ""

cd tests
python -m pytest "$@" --tb=short -q
