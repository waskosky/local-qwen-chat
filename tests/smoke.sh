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
  "$root/scripts/model-server" \
  "$root/scripts/model-selector" \
  "$root/scripts/diagnose.sh"

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x \
    "$root/install.sh" \
    "$root/uninstall.sh" \
    "$root/scripts/model-server" \
    "$root/scripts/model-selector" \
    "$root/scripts/diagnose.sh"
fi

node --check "$root/server.mjs"
node --check "$root/public/app.js"
node "$root/tests/codex-compat.mjs"

plan="$($root/install.sh --dry-run --models both --backend cpu)"
[[ "$plan" == *"Backend:         cpu"* ]]
[[ "$plan" == *"Models:          both"* ]]
[[ "$plan" == *"Dry run complete"* ]]

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
