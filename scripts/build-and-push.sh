#!/usr/bin/env bash
set -euo pipefail

# Multi-arch build and push for Athena frontend + backend
#
# Examples:
#   ./scripts/build-and-push.sh \
#     --frontend-url https://athenabeta.njesdit.net \
#     --registry docker.io \
#     --namespace need4swede \
#     --tag $(date +%Y%m%d-%H%M) \
#     --push-latest
#
# Optional env for non-interactive login:
#   DOCKER_USERNAME=... DOCKER_PASSWORD=... ./scripts/build-and-push.sh --login --frontend-url https://...

REGISTRY=${REGISTRY:-docker.io}
NAMESPACE=${NAMESPACE:-need4swede}
FRONTEND_REPO=${FRONTEND_REPO:-athena-web-frontend}
BACKEND_REPO=${BACKEND_REPO:-athena-web-backend}
TAG=${TAG:-}
AUTO_TAG=false
PUSH_LATEST=false
LOGIN=false
INSTALL_BINFMT=false
FRONTEND_URL=""
VITE_API_URL_ARG="/api"
VITE_BASE_URL_ARG=""
PLATFORMS=${PLATFORMS:-linux/amd64,linux/arm64}
BUILDER_NAME=${BUILDER_NAME:-athena-multiarch}

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --frontend-url URL     Public URL of the frontend (e.g., https://athenabeta.example.com) [required]
  --registry REGISTRY    Container registry (default: docker.io)
  --namespace NS         Registry namespace/user (default: need4swede)
  --frontend-repo NAME   Frontend repo name (default: athena-web-frontend)
  --backend-repo NAME    Backend repo name (default: athena-web-backend)
  --tag TAG              Image tag (default: git short SHA or current date)
  --auto-tag             Compute next X.Y tag (X integer, Y=0..9)
  --push-latest          Also tag and push :latest
  --login                Run docker login using DOCKER_USERNAME/DOCKER_PASSWORD envs
  --install-binfmt       Install QEMU binfmt via tonistiigi/binfmt (requires privileged Docker)
  --platforms LIST       Build platforms (default: linux/amd64,linux/arm64)
  -h, --help             Show help

Environment overrides:
  REGISTRY, NAMESPACE, FRONTEND_REPO, BACKEND_REPO, TAG, PLATFORMS, BUILDER_NAME
  DOCKER_USERNAME, DOCKER_PASSWORD (used with --login)

Build args used:
  VITE_API_URL = /api
  VITE_BASE_URL = --frontend-url
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend-url)
      FRONTEND_URL="$2"; shift 2;;
    --registry)
      REGISTRY="$2"; shift 2;;
    --namespace)
      NAMESPACE="$2"; shift 2;;
    --frontend-repo)
      FRONTEND_REPO="$2"; shift 2;;
    --backend-repo)
      BACKEND_REPO="$2"; shift 2;;
    --tag)
      TAG="$2"; shift 2;;
    --auto-tag)
      AUTO_TAG=true; shift;;
    --push-latest)
      PUSH_LATEST=true; shift;;
    --login)
      LOGIN=true; shift;;
    --platforms)
      PLATFORMS="$2"; shift 2;;
    --install-binfmt)
      INSTALL_BINFMT=true; shift;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown option: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$FRONTEND_URL" ]]; then
  echo "--frontend-url is required" >&2
  usage
  exit 1
fi

# Derive defaults
if [[ -z "$TAG" ]]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --short HEAD >/dev/null 2>&1; then
    TAG=$(git rev-parse --short HEAD)
  else
    TAG=$(date +%Y%m%d-%H%M)
  fi
fi

VITE_BASE_URL_ARG="$FRONTEND_URL"

# Compute next numeric tag like 1.0 -> 1.1 -> ... -> 1.9 -> 2.0
compute_next_numeric_tag() {
  local current="$1"
  if [[ -z "$current" ]]; then
    echo "1.0"; return 0
  fi
  if [[ ! "$current" =~ ^([0-9]+)\.([0-9])$ ]]; then
    echo "1.0"; return 0
  fi
  local major minor
  major=${BASH_REMATCH[1]}
  minor=${BASH_REMATCH[2]}
  if (( minor < 9 )); then
    echo "$major.$((minor+1))"
  else
    echo "$((major+1)).0"
  fi
}

# Fetch tags from Docker Hub API (unauthenticated)
fetch_dockerhub_tags() {
  local namespace="$1" repo="$2" page=1 url tags json
  tags=()
  if ! command -v curl >/dev/null 2>&1; then
    # curl not available; cannot discover tags
    printf ''
    return 0
  fi
  while :; do
    url="https://hub.docker.com/v2/repositories/${namespace}/${repo}/tags?page_size=100&page=${page}"
    json=$(curl -fsSL "$url" || true)
    [[ -z "$json" ]] && break
    # extract "name": "tag"
    while IFS= read -r name; do
      tags+=("$name")
    done < <(printf '%s' "$json" | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]\+\)".*/\1/p')
    # pagination check
    local next
    next=$(printf '%s' "$json" | sed -n 's/.*"next"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    [[ -z "$next" || "$next" == null ]] && break
    page=$((page+1))
  done
  printf '%s\n' "${tags[@]}" | sort -u
}

# Determine latest numeric tag across both repos (if available)
determine_latest_numeric_tag() {
  local reg="$1" ns="$2" fe_repo="$3" be_repo="$4"
  local latest=""
  if [[ "$reg" == "docker.io" ]]; then
    local t
    for repo in "$fe_repo" "$be_repo"; do
      while IFS= read -r t; do
        # Match X.Y with single-digit Y
        if [[ "$t" =~ ^([0-9]+)\.([0-9])$ ]]; then
          local maj=${BASH_REMATCH[1]} min=${BASH_REMATCH[2]}
          if [[ -z "$latest" ]]; then latest="$maj.$min"; continue; fi
          local lmaj=${latest%%.*} lmin=${latest##*.}
          if (( maj > lmaj || (maj == lmaj && min > lmin) )); then
            latest="$maj.$min"
          fi
        fi
      done < <(fetch_dockerhub_tags "$ns" "$repo")
    done
    echo "$latest"
  else
    echo "" # unsupported registry auto-discovery
  fi
}

# Auto-tag if requested and TAG not specified
if $AUTO_TAG && [[ -z "$TAG" ]]; then
  echo "==> Auto-tagging enabled; checking remote tags..."
  latest_found=$(determine_latest_numeric_tag "$REGISTRY" "$NAMESPACE" "$FRONTEND_REPO" "$BACKEND_REPO")
  echo "==> Latest numeric tag found: ${latest_found:-'(none)'}"
  TAG=$(compute_next_numeric_tag "$latest_found")
  echo "==> Using next tag: $TAG"
fi

FRONTEND_IMAGE="$REGISTRY/$NAMESPACE/$FRONTEND_REPO"
BACKEND_IMAGE="$REGISTRY/$NAMESPACE/$BACKEND_REPO"

echo "==> Registry:       $REGISTRY"
echo "==> Namespace:      $NAMESPACE"
echo "==> Frontend image: $FRONTEND_IMAGE:$TAG"
echo "==> Backend image:  $BACKEND_IMAGE:$TAG"
echo "==> Platforms:      $PLATFORMS"
echo "==> Frontend URL:   $FRONTEND_URL"
echo "==> Push latest:    $PUSH_LATEST"

# Optional login
if $LOGIN; then
  if [[ -z "${DOCKER_USERNAME:-}" || -z "${DOCKER_PASSWORD:-}" ]]; then
    echo "--login provided but DOCKER_USERNAME/DOCKER_PASSWORD not set" >&2
    exit 1
  fi
  echo "==> Logging into $REGISTRY as $DOCKER_USERNAME"
  echo "$DOCKER_PASSWORD" | docker login "$REGISTRY" -u "$DOCKER_USERNAME" --password-stdin
fi

echo "==> Ensuring binfmt/buildx is ready for multi-arch..."
if ! docker buildx ls >/dev/null 2>&1; then
  echo "Docker buildx not available; please install Docker Buildx." >&2
  exit 1
fi

if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  docker buildx create --name "$BUILDER_NAME" --use >/dev/null
fi

if $INSTALL_BINFMT; then
  echo "==> Installing binfmt (requires privileged Docker)..."
  docker run --privileged --rm tonistiigi/binfmt --install all
fi

# Frontend build (uses root Dockerfile)
echo "==> Building and pushing FRONTEND: $FRONTEND_IMAGE:$TAG"
FRONTEND_TAGS=("-t" "$FRONTEND_IMAGE:$TAG")
if $PUSH_LATEST; then
  FRONTEND_TAGS+=("-t" "$FRONTEND_IMAGE:latest")
fi
docker buildx build \
  --builder "$BUILDER_NAME" \
  --platform "$PLATFORMS" \
  -f Dockerfile \
  "${FRONTEND_TAGS[@]}" \
  --build-arg VITE_API_URL="$VITE_API_URL_ARG" \
  --build-arg VITE_BASE_URL="$VITE_BASE_URL_ARG" \
  --push \
  .

# Backend build (uses server/Dockerfile)
echo "==> Building and pushing BACKEND: $BACKEND_IMAGE:$TAG"
BACKEND_TAGS=("-t" "$BACKEND_IMAGE:$TAG")
if $PUSH_LATEST; then
  BACKEND_TAGS+=("-t" "$BACKEND_IMAGE:latest")
fi
docker buildx build \
  --builder "$BUILDER_NAME" \
  --platform "$PLATFORMS" \
  -f server/Dockerfile \
  "${BACKEND_TAGS[@]}" \
  --push \
  .

echo "==> Done. Pushed:"
echo "   - $FRONTEND_IMAGE:$TAG"
if $PUSH_LATEST; then echo "   - $FRONTEND_IMAGE:latest"; fi
echo "   - $BACKEND_IMAGE:$TAG"
if $PUSH_LATEST; then echo "   - $BACKEND_IMAGE:latest"; fi

echo "==> Update deploy/docker-compose.yml to use the new tag if desired."
