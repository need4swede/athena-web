#!/usr/bin/env sh
set -e

# This script runs inside the official nginx entrypoint.
# It substitutes environment variables into the built static
# /usr/share/nginx/html/sso-config.json so the frontend has
# real SSO values at runtime.

CONFIG="/usr/share/nginx/html/sso-config.json"

if [ -f "$CONFIG" ]; then
  echo "/docker-entrypoint.d/30-sso-config-envsubst.sh: processing $CONFIG with envsubst"
  # Perform substitution over all ${VAR} occurrences.
  # If some vars are not set, they become empty strings which the app handles.
  envsubst < "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
  echo "/docker-entrypoint.d/30-sso-config-envsubst.sh: done"
else
  echo "/docker-entrypoint.d/30-sso-config-envsubst.sh: $CONFIG not found; skipping"
fi

