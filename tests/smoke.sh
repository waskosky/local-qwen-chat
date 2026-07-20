#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
temp_dir="$(mktemp -d)"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT

bash -n \
  "$root/install.sh" \
  "$root/uninstall.sh" \
  "$root/scripts/codex-local" \
  "$root/scripts/model-server" \
  "$root/scripts/model-selector" \
  "$root/scripts/diagnose.sh" \
  "$root/scripts/context-report"

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x \
    "$root/install.sh" \
    "$root/uninstall.sh" \
    "$root/scripts/codex-local" \
    "$root/scripts/model-server" \
    "$root/scripts/model-selector" \
    "$root/scripts/diagnose.sh" \
    "$root/scripts/context-report"
fi

"$root/scripts/context-report" --help >/dev/null

node --check "$root/server.mjs"
node --check "$root/public/app.js"
node "$root/tests/codex-compat.mjs"

plan="$($root/install.sh --dry-run --models both --backend cpu)"
[[ "$plan" == *"Backend:         cpu"* ]]
[[ "$plan" == *"Models:          both"* ]]
[[ "$plan" == *"Dry run complete"* ]]

codex_plan="$($root/install.sh --dry-run --models q4 --backend cpu --with-codex)"
[[ "$codex_plan" == *"Models:          q4"* ]]
[[ "$codex_plan" == *"Codex CLI:       v"*"(private runtime)"* ]]

if "$root/install.sh" --dry-run --models invalid >/dev/null 2>&1; then
  printf 'install.sh accepted an invalid model choice\n' >&2
  exit 1
fi

mkdir -p "$temp_dir/config" "$temp_dir/llama/bin" "$temp_dir/llama/lib" "$temp_dir/models"
touch "$temp_dir/models/q4.gguf" "$temp_dir/models/q6.gguf"
touch "$temp_dir/config/qwen3.6-codex.jinja"
cat > "$temp_dir/llama/bin/llama-server" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@"
EOF
chmod +x "$temp_dir/llama/bin/llama-server"
cat > "$temp_dir/config/paths.env" <<EOF
QWEN_BACKEND=cpu
LLAMA_CPP_DIR=$temp_dir/llama
QWEN_Q4_MODEL=$temp_dir/models/q4.gguf
QWEN_Q6_MODEL=$temp_dir/models/q6.gguf
EOF
cat > "$temp_dir/config/settings.env" <<'EOF'
QWEN_CTX_SIZE=4096
QWEN_PARALLEL=1
QWEN_THREADS=4
QWEN_THREADS_BATCH=4
EOF

launcher_output="$(LOCAL_QWEN_CONFIG_DIR="$temp_dir/config" "$root/scripts/model-server" q4)"
[[ "$launcher_output" == *"qwen3.6-27b-q4"* ]]
[[ "$launcher_output" == *"--n-gpu-layers"* ]]
[[ "$launcher_output" == *"--chat-template-file"* ]]
[[ "$launcher_output" == *"--reasoning-format"* ]]
[[ "$launcher_output" == *"--reasoning-budget"* ]]
[[ "$launcher_output" == *$'0\n'* ]]

sed -i 's/QWEN_BACKEND=cpu/QWEN_BACKEND=cuda/' "$temp_dir/config/paths.env"
launcher_output="$(LOCAL_QWEN_CONFIG_DIR="$temp_dir/config" "$root/scripts/model-server" q6)"
[[ "$launcher_output" == *"qwen3.6-27b-q6"* ]]
[[ "$launcher_output" == *"--fit"* ]]
[[ "$launcher_output" == *"--flash-attn"* ]]

cat > "$temp_dir/systemctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*"
EOF
chmod +x "$temp_dir/systemctl"
printf 'q6\n' > "$temp_dir/active-model"
selector_output="$(
  LOCAL_QWEN_CONFIG_DIR="$temp_dir/config" \
  LOCAL_QWEN_STATE_FILE="$temp_dir/active-model" \
  SYSTEMCTL_BIN="$temp_dir/systemctl" \
  "$root/scripts/model-selector"
)"
[[ "$selector_output" == *"stop qwen36-q4.service"* ]]
[[ "$selector_output" == *"start qwen36-q6.service"* ]]

mkdir -p "$temp_dir/bin"
cat > "$temp_dir/bin/curl" <<'EOF'
#!/usr/bin/env bash
output=""
previous=""
for argument in "$@"; do
  if [[ "$previous" == "--output" ]]; then
    output="$argument"
    break
  fi
  previous="$argument"
done
if [[ "$*" == *"/v1/models"* ]]; then
  if [[ -n "$output" ]]; then
    printf '{"models":[]}\n' > "$output"
  else
    printf '{"models":[]}\n'
  fi
  exit 0
fi
if [[ "$*" == *"--request POST"* ]]; then
  : > "$FAKE_CURL_STATE"
  printf '{"transition":{"target":"q6"}}\n202'
elif [[ -f "$FAKE_CURL_STATE" ]]; then
  printf '{"servingModel":"q6"}'
else
  printf '{"servingModel":"q4"}'
fi
EOF
cat > "$temp_dir/bin/codex" <<'EOF'
#!/usr/bin/env bash
printf 'base=%s\n' "$CODEX_OSS_BASE_URL"
printf 'rust_log=%s\n' "$RUST_LOG"
printf 'argument=%s\n' "$@"
EOF
chmod +x "$temp_dir/bin/curl" "$temp_dir/bin/codex"
codex_output="$(
  PATH="$temp_dir/bin:$PATH" \
  CODEX_BIN="$temp_dir/bin/codex" \
  FAKE_CURL_STATE="$temp_dir/fake-curl-state" \
  LOCAL_QWEN_STATE_DIR="$temp_dir/state" \
  "$root/scripts/codex-local" q4 --no-alt-screen
)"
[[ "$codex_output" == *"base=http://127.0.0.1:8090/v1"* ]]
[[ "$codex_output" == *"rust_log=error"* ]]
[[ "$codex_output" == *"argument=--oss"* ]]
[[ "$codex_output" == *"argument=lmstudio"* ]]
[[ "$codex_output" == *"argument=qwen3.6-27b-q4"* ]]
[[ "$codex_output" == *"argument=model_catalog_json="*"state/catalogs/q4.json"* ]]
[[ "$codex_output" == *"argument=log_dir="*"state/codex"* ]]
[[ "$codex_output" == *"argument=--no-alt-screen"* ]]

codex_output="$(
  PATH="$temp_dir/bin:$PATH" \
  CODEX_BIN="$temp_dir/bin/codex" \
  FAKE_CURL_STATE="$temp_dir/fake-curl-state" \
  LOCAL_QWEN_STATE_DIR="$temp_dir/state" \
  "$root/scripts/codex-local" q6 --no-alt-screen
)"
[[ "$codex_output" == *"Selecting qwen3.6-27b-q6"* ]]
[[ "$codex_output" == *"base=http://127.0.0.1:8090/v1"* ]]
[[ "$codex_output" == *"argument=qwen3.6-27b-q6"* ]]

CHAT_HOST=127.0.0.1 CHAT_PORT=18090 QWEN_PORT=18080 \
QWEN_Q4_MODEL="$temp_dir/models/q4.gguf" QWEN_Q6_MODEL="$temp_dir/models/q6.gguf" \
SYSTEMCTL_BIN="$temp_dir/systemctl" node "$root/server.mjs" >"$temp_dir/server.log" 2>&1 &
server_pid=$!
for _ in $(seq 1 30); do
  if curl --silent --fail http://127.0.0.1:18090/ >/dev/null; then
    break
  fi
  sleep 0.2
done
curl --silent --fail http://127.0.0.1:18090/ | grep -q 'Local Qwen Chat'
status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST --header 'Content-Type: application/json' \
  --data '{"model":"q6"}' http://127.0.0.1:18090/api/models)"
[[ "$status" == "403" ]]

printf 'All smoke checks passed.\n'
