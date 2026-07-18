# Local Qwen Chat

[![CI](https://github.com/waskosky/local-qwen-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/waskosky/local-qwen-chat/actions/workflows/ci.yml)

A private, dependency-free web chat for running Qwen3.6 27B locally with
llama.cpp. It installs both recommended GGUF quantizations and lets you switch
between them from the browser:

- **Q4_K_M** — faster, 17.98 GB, the default for most work
- **Q6_K_L** — higher fidelity, 24.29 GB

Only one model is loaded at a time. Clicking a model stops the current service,
starts the selected service, displays live loading state, and remembers the
selection across reboots.

## One-command install

On a 64-bit Linux system with systemd:

```bash
curl -fsSL https://raw.githubusercontent.com/waskosky/local-qwen-chat/main/install.sh | sudo bash -s -- --yes
```

That command installs build dependencies, a private Node.js runtime, a pinned
llama.cpp build, both verified GGUF files, systemd services, and the web app. It
then launches Q4 and waits until it is ready.

If Tailscale is already connected, the installer also attempts to configure a
tailnet-only HTTPS URL with Tailscale Serve. Otherwise, open:

```text
http://127.0.0.1:8090/
```

Cold model starts commonly take one to several minutes. The page remains
available and shows progress while llama.cpp maps the model and allocates its
context.

## Requirements

- Linux or WSL2 with systemd enabled
- x86-64 or ARM64
- One of: `apt`, `dnf`, `pacman`, or `zypper`
- About 45 GB for both models, plus build/cache headroom
- Enough combined RAM and VRAM for the selected quantization

The installer detects the compute backend in this order:

1. CUDA when an NVIDIA GPU and CUDA compiler are available
2. Vulkan when a physical GPU and Vulkan driver are detected
3. CPU fallback

llama.cpp is compiled locally so the resulting binary matches the machine.
CUDA Toolkit installation is intentionally left to the GPU vendor or Linux
distribution; systems without `nvcc` can still use Vulkan or CPU.

## Installation choices

Clone first if you prefer to inspect the installer:

```bash
git clone https://github.com/waskosky/local-qwen-chat.git
cd local-qwen-chat
./install.sh --dry-run
sudo ./install.sh --yes
```

Common options:

```bash
# Install only Q4 to save about 24 GB. Q6 appears as “Not installed.”
sudo ./install.sh --models q4 --yes

# Add Q6 later; verified existing files are skipped.
sudo ./install.sh --models both --yes

# Force a backend.
sudo ./install.sh --backend cuda --yes
sudo ./install.sh --backend vulkan --yes
sudo ./install.sh --backend cpu --yes

# Install everything without starting it or changing Tailscale Serve.
sudo ./install.sh --no-start --no-tailscale --yes
```

The installer is idempotent. Re-running it skips verified downloads and matching
runtimes, preserves `/etc/local-qwen-chat/settings.env`, refreshes application
files and units, then safely restarts only the selected model.

## What gets installed

| Path | Purpose |
| --- | --- |
| `/opt/local-qwen-chat` | Web app, private Node.js, and llama.cpp runtime |
| `/var/lib/local-qwen-chat/models` | GGUF model files |
| `/var/lib/local-qwen-chat/active-model` | Reboot-persistent Q4/Q6 selection |
| `/etc/local-qwen-chat/settings.env` | User-editable runtime tuning |
| `/etc/local-qwen-chat/paths.env` | Installer-managed paths and backend |
| `/usr/local/libexec/local-qwen-chat` | Model launch/control scripts |
| `/etc/systemd/system/qwen*.service` | Model selector, llama.cpp, and UI services |

Model downloads are resumable and verified against pinned SHA-256 hashes. The
installer also verifies the Node.js distribution checksum and the exact
llama.cpp Git commit before building.

## Operations

```bash
local-qwen-diagnose
systemctl status qwen-chat-ui qwen36-q4 qwen36-q6
journalctl -u qwen-chat-ui -u qwen36-q4 -u qwen36-q6 -f
```

Edit `/etc/local-qwen-chat/settings.env` to change context size, thread counts,
KV cache types, GPU fit headroom, or extra llama-server arguments. Then restart
the selected model:

```bash
sudo systemctl restart qwen36-q4   # or qwen36-q6
```

## Local API

The same-origin proxy exposes an OpenAI-compatible endpoint:

```bash
curl http://127.0.0.1:8090/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3.6-27b-q4",
    "messages": [{"role": "user", "content": "Write a Python hello world."}]
  }'
```

The browser additionally records response duration, time to first token, token
counts, prompt/generation speed, cache use, and llama.cpp timing details.
Conversations remain in that browser's local storage.

## Security model

- Both llama.cpp and the web app bind to `127.0.0.1` by default.
- Tailscale Serve, when configured, remains tailnet-only; Funnel is never used.
- The model-control API only accepts Q4/Q6 from an exact allowlist and requires
  same-origin JavaScript headers.
- Model services conflict at the systemd level, and the controller explicitly
  waits for the old model to stop before starting the new one.

## Uninstall

```bash
sudo ./uninstall.sh --yes
```

Models are preserved so a reinstall does not download them again. To remove the
GGUF files too:

```bash
sudo ./uninstall.sh --purge-models --yes
```

Tailscale routes are left untouched because a node may serve other applications.
Disable the chat route explicitly with the corresponding `tailscale serve ... off`
command if desired.

## Upstream projects

- [llama.cpp](https://github.com/ggml-org/llama.cpp), MIT licensed
- [bartowski/Qwen_Qwen3.6-27B-GGUF](https://huggingface.co/bartowski/Qwen_Qwen3.6-27B-GGUF), Apache-2.0 model artifacts

This repository does not redistribute model weights. They are downloaded
directly from Hugging Face during installation.

## License

The installer and web application are released under the MIT License. See
[LICENSE](LICENSE).
