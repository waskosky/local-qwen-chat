#!/usr/bin/env bash
set -u

printf 'Local Qwen services\n'
systemctl show \
  qwen-model-selector.service qwen-chat-ui.service qwen36-q4.service qwen36-q6.service \
  --property=Id --property=ActiveState --property=SubState --property=MainPID \
  --no-pager 2>/dev/null || true

printf '\nModel API\n'
curl --silent --show-error --max-time 5 http://127.0.0.1:8090/api/models || true
printf '\n\nDisk\n'
df -h /var/lib/local-qwen-chat /opt/local-qwen-chat 2>/dev/null || df -h /

if command -v nvidia-smi >/dev/null 2>&1; then
  printf '\nNVIDIA GPUs\n'
  nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader 2>/dev/null || true
fi

printf '\nRecent service logs\n'
journalctl \
  -u qwen-chat-ui.service -u qwen36-q4.service -u qwen36-q6.service \
  --no-pager -n 30 2>/dev/null || true

printf '\nFor a correlated context/MCP report, run local-qwen-context-report.\n'
