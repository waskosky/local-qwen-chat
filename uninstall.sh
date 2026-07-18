#!/usr/bin/env bash
set -Eeuo pipefail

PURGE_MODELS=0
YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge-models) PURGE_MODELS=1 ;;
    --yes|-y) YES=1 ;;
    --help|-h)
      printf 'Usage: sudo ./uninstall.sh [--purge-models] [--yes]\n'
      exit 0
      ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

[[ "$EUID" -eq 0 ]] || { printf 'Run this uninstaller as root.\n' >&2; exit 1; }

if [[ "$YES" != "1" && -t 0 ]]; then
  read -r -p "Remove Local Qwen Chat services and runtime? Models are preserved by default. [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) printf 'Cancelled.\n'; exit 0 ;;
  esac
fi

systemctl disable --now qwen-chat-ui.service qwen-model-selector.service qwen36-q4.service qwen36-q6.service 2>/dev/null || true
rm -f \
  /etc/systemd/system/qwen-chat-ui.service \
  /etc/systemd/system/qwen-model-selector.service \
  /etc/systemd/system/qwen36-q4.service \
  /etc/systemd/system/qwen36-q6.service \
  /usr/local/bin/local-qwen-diagnose \
  /usr/local/bin/local-qwen-codex
rm -rf /usr/local/libexec/local-qwen-chat /opt/local-qwen-chat /var/cache/local-qwen-chat /etc/local-qwen-chat

if [[ "$PURGE_MODELS" == "1" ]]; then
  rm -rf /var/lib/local-qwen-chat
  printf 'Models and saved model selection removed.\n'
else
  printf 'Models preserved in /var/lib/local-qwen-chat/models.\n'
fi

systemctl daemon-reload
printf 'Local Qwen Chat removed. Existing Tailscale Serve routes were left untouched.\n'
