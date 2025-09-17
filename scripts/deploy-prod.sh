#!/usr/bin/env bash
set -euo pipefail

# One-shot deploy script for production (athena.njesdit.net)
# Builds and pushes multi-arch images for frontend+backend.

DIR="$(cd "$(dirname "$0")" && pwd)"

ARGS=(
  "--frontend-url" "https://athena.njesdit.net"
  "--auto-tag"
  "--push-latest"
  "--install-binfmt"
)

# If credentials are provided, enable docker login
if [[ -n "${DOCKER_USERNAME:-}" && -n "${DOCKER_PASSWORD:-}" ]]; then
  ARGS+=("--login")
fi

"$DIR/build-and-push.sh" "${ARGS[@]}"

