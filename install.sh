#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

INSTALL_ROOT="/opt/local-qwen-chat"
APP_DIR="$INSTALL_ROOT/app"
NODE_LINK="$INSTALL_ROOT/node"
LLAMA_ROOT="$INSTALL_ROOT/llama.cpp"
CONFIG_DIR="/etc/local-qwen-chat"
STATE_DIR="/var/lib/local-qwen-chat"
MODEL_DIR="$STATE_DIR/models"
CACHE_DIR="/var/cache/local-qwen-chat"
LIBEXEC_DIR="/usr/local/libexec/local-qwen-chat"
BOOTSTRAP_REPOSITORY="waskosky/local-qwen-chat"
BOOTSTRAP_REF="${LOCAL_QWEN_REPO_REF:-main}"

MODEL_CHOICE="both"
BACKEND_REQUESTED="auto"
BACKEND=""
YES=0
DRY_RUN=0
START_SERVICES=1
CONFIGURE_TAILSCALE=1
INSTALL_CODEX=0
PROJECT_SOURCE=""
TEMP_DIR=""
CUDA_COMPILER=""

log() {
  printf '\033[1;34m==>\033[0m %s\n' "$*"
}

success() {
  printf '\033[1;32m==>\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33mWarning:\033[0m %s\n' "$*" >&2
}

die() {
  printf '\033[1;31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install Local Qwen Chat and Qwen3.6 27B with one command.

Usage: sudo ./install.sh [options]

Options:
  --models both|q4|q6       Models to install (default: both)
  --backend auto|cuda|vulkan|cpu
                             llama.cpp compute backend (default: auto)
  --no-start                Install without starting services
  --no-tailscale            Do not configure Tailscale Serve when available
  --with-codex              Install a private, pinned Codex CLI for the launcher
  --yes, -y                 Accept the disk/download confirmation
  --dry-run                 Print detection and planned actions only
  --help, -h                Show this help

Environment:
  LOCAL_QWEN_BUILD_JOBS=N    Parallel llama.cpp build jobs
  LOCAL_QWEN_REPO_REF=REF    Repository ref used by the curl bootstrap
EOF
}

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --models)
      [[ $# -ge 2 ]] || die "--models requires a value"
      MODEL_CHOICE="$2"
      shift 2
      ;;
    --backend)
      [[ $# -ge 2 ]] || die "--backend requires a value"
      BACKEND_REQUESTED="$2"
      shift 2
      ;;
    --no-start)
      START_SERVICES=0
      shift
      ;;
    --no-tailscale)
      CONFIGURE_TAILSCALE=0
      shift
      ;;
    --with-codex)
      INSTALL_CODEX=1
      shift
      ;;
    --yes|-y)
      YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

case "$MODEL_CHOICE" in
  both|q4|q6) ;;
  *) die "--models must be both, q4, or q6" ;;
esac
case "$BACKEND_REQUESTED" in
  auto|cuda|vulkan|cpu) ;;
  *) die "--backend must be auto, cuda, vulkan, or cpu" ;;
esac

prepare_project_source() {
  local script_dir archive extracted source_path
  script_dir=""
  source_path="${BASH_SOURCE[0]:-}"
  if [[ -n "$source_path" && -e "$source_path" ]]; then
    script_dir="$(cd -- "$(dirname -- "$source_path")" && pwd -P)"
  fi
  if [[ -f "$script_dir/server.mjs" && -f "$script_dir/config/release.env" ]]; then
    PROJECT_SOURCE="$script_dir"
    return
  fi

  command -v curl >/dev/null 2>&1 || die "curl is required for the one-line bootstrap"
  command -v tar >/dev/null 2>&1 || die "tar is required for the one-line bootstrap"
  TEMP_DIR="$(mktemp -d)"
  archive="$TEMP_DIR/project.tar.gz"
  log "Downloading ${BOOTSTRAP_REPOSITORY}@${BOOTSTRAP_REF}"
  curl --fail --location --retry 5 --silent --show-error \
    "https://github.com/${BOOTSTRAP_REPOSITORY}/archive/${BOOTSTRAP_REF}.tar.gz" \
    --output "$archive"
  tar -xzf "$archive" -C "$TEMP_DIR"
  extracted="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "$extracted" && -f "$extracted/config/release.env" ]] || die "Downloaded project archive is incomplete"
  PROJECT_SOURCE="$extracted"
}

prepare_project_source
# shellcheck source=/dev/null
source "$PROJECT_SOURCE/config/release.env"

normalize_architecture() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'x64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *) die "Unsupported CPU architecture: $(uname -m)" ;;
  esac
}

find_cuda_compiler() {
  local candidate
  for candidate in "$(command -v nvcc 2>/dev/null || true)" /usr/local/cuda/bin/nvcc /opt/cuda/bin/nvcc; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      CUDA_COMPILER="$candidate"
      return 0
    fi
  done
  return 1
}

has_vulkan_gpu_hint() {
  local vendor
  if command -v nvidia-smi >/dev/null 2>&1 \
    && { compgen -G '/usr/share/vulkan/icd.d/*nvidia*.json' >/dev/null \
      || compgen -G '/etc/vulkan/icd.d/*nvidia*.json' >/dev/null; }; then
    return 0
  fi
  for vendor in /sys/class/drm/card*/device/vendor; do
    [[ -r "$vendor" ]] || continue
    case "$(<"$vendor")" in
      0x1002|0x8086|0x10de) return 0 ;;
    esac
  done
  return 1
}

detect_backend() {
  if [[ "$BACKEND_REQUESTED" != "auto" ]]; then
    BACKEND="$BACKEND_REQUESTED"
  elif find_cuda_compiler && { command -v nvidia-smi >/dev/null 2>&1 || [[ -e /dev/nvidiactl ]]; }; then
    BACKEND="cuda"
  elif has_vulkan_gpu_hint; then
    BACKEND="vulkan"
  else
    BACKEND="cpu"
  fi

  if [[ "$BACKEND" == "cuda" ]] && ! find_cuda_compiler; then
    die "CUDA was requested, but nvcc was not found. Install the CUDA Toolkit or use --backend vulkan."
  fi
}

ARCH="$(normalize_architecture)"
detect_backend

requested_model_bytes=0
if [[ "$MODEL_CHOICE" == "both" || "$MODEL_CHOICE" == "q4" ]]; then
  requested_model_bytes=$((requested_model_bytes + QWEN_Q4_SIZE))
fi
if [[ "$MODEL_CHOICE" == "both" || "$MODEL_CHOICE" == "q6" ]]; then
  requested_model_bytes=$((requested_model_bytes + QWEN_Q6_SIZE))
fi

print_plan() {
  local model_gib
  model_gib="$(awk -v bytes="$requested_model_bytes" 'BEGIN { printf "%.1f", bytes / 1073741824 }')"
  cat <<EOF

Local Qwen Chat installation plan
  Source:          $PROJECT_SOURCE
  Architecture:    $ARCH
  Backend:         $BACKEND
  Models:          $MODEL_CHOICE (${model_gib} GiB total)
  Application:     $APP_DIR
  Models:          $MODEL_DIR
  llama.cpp:       $LLAMA_CPP_TAG ($LLAMA_CPP_COMMIT)
  Node.js:         v$NODE_VERSION
  Local URL:       http://127.0.0.1:8090
  Tailscale Serve: $([[ "$CONFIGURE_TAILSCALE" == "1" ]] && printf 'auto' || printf 'disabled')
  Codex CLI:       $([[ "$INSTALL_CODEX" == "1" ]] && printf 'v%s (private runtime)' "$CODEX_VERSION" || printf 'use existing installation')

EOF
}

print_plan
if [[ "$DRY_RUN" == "1" ]]; then
  success "Dry run complete; no files or services were changed."
  exit 0
fi

[[ "$(uname -s)" == "Linux" ]] || die "This installer currently supports Linux and WSL2."
[[ "$EUID" -eq 0 ]] || die "Run this installer as root (for example: sudo ./install.sh)."
command -v systemctl >/dev/null 2>&1 || die "systemd is required."
[[ -d /run/systemd/system ]] || die "systemd is not running. On WSL2, enable systemd in /etc/wsl.conf first."

if [[ "$YES" != "1" && -t 0 ]]; then
  read -r -p "Continue with the downloads and installation? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) die "Installation cancelled" ;;
  esac
fi

install_dependencies() {
  local -a packages
  if command -v apt-get >/dev/null 2>&1; then
    packages=(build-essential cmake git curl ca-certificates xz-utils pkg-config libssl-dev)
    if [[ "$BACKEND" == "vulkan" ]]; then
      packages+=(libvulkan-dev glslc)
    fi
    log "Installing build dependencies with apt"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends "${packages[@]}"
  elif command -v dnf >/dev/null 2>&1; then
    packages=(gcc gcc-c++ make cmake git curl ca-certificates xz pkgconf-pkg-config openssl-devel)
    if [[ "$BACKEND" == "vulkan" ]]; then
      packages+=(vulkan-loader-devel glslc)
    fi
    log "Installing build dependencies with dnf"
    dnf install -y "${packages[@]}"
  elif command -v pacman >/dev/null 2>&1; then
    packages=(base-devel cmake git curl ca-certificates xz pkgconf openssl)
    if [[ "$BACKEND" == "vulkan" ]]; then
      packages+=(vulkan-headers vulkan-icd-loader shaderc)
    fi
    log "Installing build dependencies with pacman"
    pacman -Syu --needed --noconfirm "${packages[@]}"
  elif command -v zypper >/dev/null 2>&1; then
    packages=(gcc gcc-c++ make cmake git curl ca-certificates xz pkg-config libopenssl-devel)
    if [[ "$BACKEND" == "vulkan" ]]; then
      packages+=(vulkan-devel glslc)
    fi
    log "Installing build dependencies with zypper"
    zypper --non-interactive install "${packages[@]}"
  else
    die "Supported package managers: apt, dnf, pacman, and zypper. Install a C++ toolchain, CMake, Git, curl, xz, pkg-config, and OpenSSL headers, then retry."
  fi
}

install_dependencies
install -d -m 0755 "$INSTALL_ROOT" "$APP_DIR" "$LLAMA_ROOT" "$CONFIG_DIR" "$STATE_DIR" "$MODEL_DIR" "$CACHE_DIR" "$LIBEXEC_DIR"

download_bytes=0
if [[ "$MODEL_CHOICE" == "both" || "$MODEL_CHOICE" == "q4" ]]; then
  if [[ ! -f "$MODEL_DIR/$QWEN_Q4_FILE" \
    || "$(stat -c '%s' "$MODEL_DIR/$QWEN_Q4_FILE" 2>/dev/null || printf '0')" != "$QWEN_Q4_SIZE" ]]; then
    download_bytes=$((download_bytes + QWEN_Q4_SIZE))
  fi
fi
if [[ "$MODEL_CHOICE" == "both" || "$MODEL_CHOICE" == "q6" ]]; then
  if [[ ! -f "$MODEL_DIR/$QWEN_Q6_FILE" \
    || "$(stat -c '%s' "$MODEL_DIR/$QWEN_Q6_FILE" 2>/dev/null || printf '0')" != "$QWEN_Q6_SIZE" ]]; then
    download_bytes=$((download_bytes + QWEN_Q6_SIZE))
  fi
fi
available_bytes="$(df --output=avail -B1 "$MODEL_DIR" | tail -n 1 | tr -d '[:space:]')"
required_bytes=$((download_bytes + 5 * 1024 * 1024 * 1024))
if [[ "$available_bytes" =~ ^[0-9]+$ ]] && (( available_bytes < required_bytes )); then
  die "Not enough free space in $MODEL_DIR. The selected models plus working room need about $((required_bytes / 1073741824)) GiB."
fi

download_verified() {
  local url="$1" destination="$2" expected_sha="$3" label="$4"
  local partial="${destination}.part"
  if [[ -f "$destination" ]] && printf '%s  %s\n' "$expected_sha" "$destination" | sha256sum --check --status; then
    success "$label is already downloaded and verified."
    return
  fi
  if [[ -f "$destination" ]]; then
    mv -- "$destination" "${destination}.corrupt-$(date +%s)"
    warn "Moved an invalid existing $label aside."
  fi
  log "Downloading $label (resumable)"
  if ! curl --fail --location --retry 8 --retry-delay 3 --retry-all-errors \
    --continue-at - --output "$partial" "$url"; then
    warn "Resume failed; retrying $label from the beginning."
    rm -f -- "$partial"
    curl --fail --location --retry 8 --retry-delay 3 --retry-all-errors \
      --output "$partial" "$url"
  fi
  log "Verifying $label"
  printf '%s  %s\n' "$expected_sha" "$partial" | sha256sum --check --status \
    || die "$label failed its SHA-256 verification"
  mv -- "$partial" "$destination"
}

install_node() {
  local platform archive_name archive shasums expected_sha staging target
  platform="linux-$ARCH"
  archive_name="node-v${NODE_VERSION}-${platform}.tar.xz"
  archive="$CACHE_DIR/$archive_name"
  shasums="$CACHE_DIR/node-v${NODE_VERSION}-SHASUMS256.txt"
  target="$INSTALL_ROOT/node-v$NODE_VERSION"

  if [[ -x "$target/bin/node" && "$("$target/bin/node" --version)" == "v$NODE_VERSION" ]]; then
    success "Node.js v$NODE_VERSION is already installed."
  else
    log "Fetching Node.js v$NODE_VERSION checksums"
    curl --fail --location --retry 5 --silent --show-error \
      "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" --output "$shasums"
    expected_sha="$(awk -v file="$archive_name" '$2 == file { print $1 }' "$shasums")"
    [[ "$expected_sha" =~ ^[a-f0-9]{64}$ ]] || die "Could not find the Node.js archive checksum"
    download_verified \
      "https://nodejs.org/dist/v${NODE_VERSION}/${archive_name}" \
      "$archive" "$expected_sha" "Node.js v$NODE_VERSION"
    staging="${target}.new"
    rm -rf -- "$staging"
    install -d -m 0755 "$staging"
    tar -xJf "$archive" -C "$staging" --strip-components=1
    rm -rf -- "$target"
    mv -- "$staging" "$target"
  fi
  ln -sfn "node-v$NODE_VERSION" "$NODE_LINK"
}

install_codex() {
  local codex_dir codex_bin detected_version
  codex_dir="$INSTALL_ROOT/codex"
  codex_bin="$codex_dir/bin/codex"
  detected_version=""
  if [[ -x "$codex_bin" ]]; then
    detected_version="$(PATH="$NODE_LINK/bin:$PATH" "$codex_bin" --version 2>/dev/null || true)"
  fi
  if [[ "$detected_version" == "codex-cli $CODEX_VERSION" ]]; then
    success "Codex CLI v$CODEX_VERSION is already installed."
    return
  fi

  log "Installing Codex CLI v$CODEX_VERSION into $codex_dir"
  rm -rf -- "$codex_dir"
  install -d -m 0755 "$codex_dir"
  PATH="$NODE_LINK/bin:$PATH" "$NODE_LINK/bin/npm" install \
    --global \
    --prefix "$codex_dir" \
    --no-audit \
    --no-fund \
    "@openai/codex@$CODEX_VERSION"
  [[ -x "$codex_bin" ]] || die "Codex CLI installation did not produce $codex_bin"
  detected_version="$(PATH="$NODE_LINK/bin:$PATH" "$codex_bin" --version)"
  [[ "$detected_version" == "codex-cli $CODEX_VERSION" ]] \
    || die "Codex CLI version verification failed: $detected_version"
  success "Codex CLI v$CODEX_VERSION installed."
}

install_llama_cpp() {
  local source_dir build_dir version_dir install_dir staging jobs detected_commit
  local -a cmake_args
  source_dir="$CACHE_DIR/llama.cpp-$LLAMA_CPP_TAG"
  build_dir="$CACHE_DIR/llama.cpp-build-${LLAMA_CPP_TAG}-${BACKEND}"
  version_dir="$LLAMA_ROOT/${LLAMA_CPP_TAG}-${BACKEND}"
  install_dir="$version_dir/install"

  if [[ -x "$install_dir/bin/llama-server" \
    && -f "$version_dir/backend" \
    && "$(<"$version_dir/backend")" == "$BACKEND" \
    && "$("$install_dir/bin/llama-server" --version 2>&1 | head -n 1)" == *"${LLAMA_CPP_TAG#b}"* ]]; then
    success "llama.cpp $LLAMA_CPP_TAG ($BACKEND) is already installed."
    ln -sfn "${LLAMA_CPP_TAG}-${BACKEND}/install" "$LLAMA_ROOT/current"
    return
  fi

  if [[ -d "$source_dir/.git" \
    && "$(git -C "$source_dir" rev-parse HEAD 2>/dev/null || true)" != "$LLAMA_CPP_COMMIT" ]]; then
    warn "Discarding an incomplete or mismatched cached llama.cpp checkout."
    rm -rf -- "$source_dir"
  fi
  if [[ ! -d "$source_dir/.git" ]]; then
    rm -rf -- "$source_dir"
    log "Downloading llama.cpp $LLAMA_CPP_TAG"
    git clone --depth 1 --branch "$LLAMA_CPP_TAG" \
      https://github.com/ggml-org/llama.cpp.git "$source_dir"
  fi
  detected_commit="$(git -C "$source_dir" rev-parse HEAD)"
  [[ "$detected_commit" == "$LLAMA_CPP_COMMIT" ]] \
    || die "llama.cpp tag verification failed: expected $LLAMA_CPP_COMMIT, got $detected_commit"

  cmake_args=(
    -S "$source_dir"
    -B "$build_dir"
    -DCMAKE_BUILD_TYPE=Release
    -DLLAMA_BUILD_TESTS=OFF
    -DLLAMA_BUILD_EXAMPLES=OFF
    -DLLAMA_BUILD_SERVER=ON
    -DLLAMA_CURL=OFF
  )
  case "$BACKEND" in
    cuda)
      cmake_args+=(
        -DGGML_CUDA=ON
        -DGGML_CUDA_FA=ON
        -DGGML_CUDA_COMPRESSION_MODE=size
        "-DCMAKE_CUDA_COMPILER=$CUDA_COMPILER"
      )
      ;;
    vulkan)
      cmake_args+=(-DGGML_VULKAN=ON)
      ;;
    cpu)
      cmake_args+=(-DGGML_NATIVE=ON)
      ;;
  esac

  log "Configuring llama.cpp ($BACKEND)"
  cmake "${cmake_args[@]}"
  jobs="${LOCAL_QWEN_BUILD_JOBS:-$(nproc 2>/dev/null || printf '4')}"
  if (( jobs > 16 )); then jobs=16; fi
  log "Building llama.cpp with $jobs parallel jobs"
  cmake --build "$build_dir" --config Release --parallel "$jobs"
  staging="${version_dir}.new"
  rm -rf -- "$staging"
  cmake --install "$build_dir" --prefix "$staging/install"
  printf '%s\n' "$BACKEND" > "$staging/backend"
  rm -rf -- "$version_dir"
  mv -- "$staging" "$version_dir"
  ln -sfn "${LLAMA_CPP_TAG}-${BACKEND}/install" "$LLAMA_ROOT/current"
  success "llama.cpp $LLAMA_CPP_TAG ($BACKEND) installed."
}

install_application() {
  log "Installing the web application"
  install -m 0644 "$PROJECT_SOURCE/server.mjs" "$APP_DIR/server.mjs"
  rm -rf -- "${APP_DIR:?}/lib"
  cp -a -- "$PROJECT_SOURCE/lib" "$APP_DIR/lib"
  rm -rf -- "$APP_DIR/public"
  cp -a -- "$PROJECT_SOURCE/public" "$APP_DIR/public"
  find "$APP_DIR/public" -type d -exec chmod 0755 {} +
  find "$APP_DIR/public" -type f -exec chmod 0644 {} +

  install -m 0755 "$PROJECT_SOURCE/scripts/model-server" "$LIBEXEC_DIR/model-server"
  install -m 0755 "$PROJECT_SOURCE/scripts/model-selector" "$LIBEXEC_DIR/model-selector"
  install -m 0755 "$PROJECT_SOURCE/scripts/diagnose.sh" /usr/local/bin/local-qwen-diagnose
  install -m 0755 "$PROJECT_SOURCE/scripts/context-report" /usr/local/bin/local-qwen-context-report
  install -m 0755 "$PROJECT_SOURCE/scripts/codex-local" /usr/local/bin/local-qwen-codex
  install -m 0644 "$PROJECT_SOURCE/config/qwen3.6-codex.jinja" "$CONFIG_DIR/qwen3.6-codex.jinja"

  if [[ ! -f "$CONFIG_DIR/settings.env" ]]; then
    install -m 0644 "$PROJECT_SOURCE/config/settings.env" "$CONFIG_DIR/settings.env"
  else
    success "Preserving existing runtime settings in $CONFIG_DIR/settings.env"
  fi

  cat > "$CONFIG_DIR/paths.env" <<EOF
QWEN_BACKEND=$BACKEND
LLAMA_CPP_DIR=$LLAMA_ROOT/current
QWEN_Q4_MODEL=$MODEL_DIR/$QWEN_Q4_FILE
QWEN_Q6_MODEL=$MODEL_DIR/$QWEN_Q6_FILE
MODEL_STATE_DIR=$STATE_DIR
EOF

  install -m 0644 "$PROJECT_SOURCE/systemd/qwen36-q4.service" /etc/systemd/system/qwen36-q4.service
  install -m 0644 "$PROJECT_SOURCE/systemd/qwen36-q6.service" /etc/systemd/system/qwen36-q6.service
  install -m 0644 "$PROJECT_SOURCE/systemd/qwen-model-selector.service" /etc/systemd/system/qwen-model-selector.service
  install -m 0644 "$PROJECT_SOURCE/systemd/qwen-chat-ui.service" /etc/systemd/system/qwen-chat-ui.service
}

ensure_model() {
  local key="$1" file size sha label url destination marker
  case "$key" in
    q4)
      file="$QWEN_Q4_FILE"; size="$QWEN_Q4_SIZE"; sha="$QWEN_Q4_SHA256"; label="Qwen3.6 27B Q4_K_M"
      ;;
    q6)
      file="$QWEN_Q6_FILE"; size="$QWEN_Q6_SIZE"; sha="$QWEN_Q6_SHA256"; label="Qwen3.6 27B Q6_K_L"
      ;;
    *) die "Unknown model key: $key" ;;
  esac
  destination="$MODEL_DIR/$file"
  marker="${destination}.sha256"
  if [[ -f "$destination" && "$(stat -c '%s' "$destination")" == "$size" \
    && -f "$marker" && "$(awk 'NR == 1 { print $1 }' "$marker")" == "$sha" ]]; then
    success "$label is already downloaded and verified."
    return
  fi
  url="https://huggingface.co/${MODEL_REPOSITORY}/resolve/main/${file}?download=true"
  download_verified "$url" "$destination" "$sha" "$label"
  printf '%s  %s\n' "$sha" "$file" > "$marker"
}

install_node
if [[ "$INSTALL_CODEX" == "1" ]]; then
  install_codex
fi
install_llama_cpp

if [[ "$MODEL_CHOICE" == "both" || "$MODEL_CHOICE" == "q4" ]]; then
  ensure_model q4
fi
if [[ "$MODEL_CHOICE" == "both" || "$MODEL_CHOICE" == "q6" ]]; then
  ensure_model q6
fi

install_application

if [[ ! -f "$STATE_DIR/active-model" ]]; then
  if [[ "$MODEL_CHOICE" == "q6" ]]; then
    printf 'q6\n' > "$STATE_DIR/active-model"
  else
    printf 'q4\n' > "$STATE_DIR/active-model"
  fi
fi
chmod 0644 "$STATE_DIR/active-model"

systemctl daemon-reload
systemctl disable qwen36-q4.service qwen36-q6.service >/dev/null 2>&1 || true
systemctl enable qwen-model-selector.service qwen-chat-ui.service >/dev/null

TAILSCALE_URL=""
configure_tailscale_serve() {
  local -a tailscale_cmd
  if command -v tailscale >/dev/null 2>&1; then
    tailscale_cmd=("$(command -v tailscale)")
  elif [[ -x "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
    tailscale_cmd=("/mnt/c/Program Files/Tailscale/tailscale.exe")
  else
    return
  fi

  if ! "${tailscale_cmd[@]}" status --json 2>/dev/null | tr -d '[:space:]' | grep -q '"BackendState":"Running"'; then
    warn "Tailscale is installed but not connected; skipping Serve configuration."
    return
  fi
  log "Configuring tailnet-only HTTPS with Tailscale Serve"
  if "${tailscale_cmd[@]}" serve --bg --yes "http://localhost:8090" >/tmp/local-qwen-tailscale-serve.txt 2>&1; then
    TAILSCALE_URL="$(tr -d '\r' < /tmp/local-qwen-tailscale-serve.txt | grep -Eo 'https://[^ /]+' | head -n 1 || true)"
  else
    warn "Tailscale Serve could not be configured automatically. Run: tailscale serve --bg http://localhost:8090"
  fi
  rm -f /tmp/local-qwen-tailscale-serve.txt
}

if [[ "$START_SERVICES" == "1" ]]; then
  log "Starting the selected model and chat interface"
  systemctl stop qwen36-q4.service qwen36-q6.service >/dev/null 2>&1 || true
  systemctl restart qwen-model-selector.service
  systemctl restart qwen-chat-ui.service
  if [[ "$CONFIGURE_TAILSCALE" == "1" ]]; then
    configure_tailscale_serve
  fi

  log "Waiting for the selected model to become ready (cold starts can take several minutes)"
  ready=0
  for _ in $(seq 1 120); do
    if curl --silent --fail --max-time 3 http://127.0.0.1:8090/api/models \
      | grep -q '"servingModel":"q[46]"'; then
      ready=1
      break
    fi
    printf '.'
    sleep 5
  done
  printf '\n'
  if [[ "$ready" != "1" ]]; then
    local-qwen-diagnose
    die "The model did not become ready within 10 minutes. Diagnostics are shown above."
  fi
fi

success "Local Qwen Chat is installed."
printf '\nOpen: http://127.0.0.1:8090/\n'
if [[ -n "$TAILSCALE_URL" ]]; then
  printf 'Tailnet: %s\n' "$TAILSCALE_URL"
fi
printf '\nUseful commands:\n'
printf '  local-qwen-diagnose\n'
printf '  local-qwen-context-report\n'
printf '  systemctl status qwen-chat-ui qwen36-q4 qwen36-q6\n'
printf '  journalctl -u qwen-chat-ui -u qwen36-q4 -u qwen36-q6 -f\n'
printf '\nCodex CLI:\n'
printf '  local-qwen-codex q4\n'
if [[ "$MODEL_CHOICE" == "both" || "$MODEL_CHOICE" == "q6" ]]; then
  printf '  local-qwen-codex q6\n'
fi
printf '\nRe-run this installer at any time to repair or update the installation.\n'
