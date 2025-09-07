#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -e

# minimal colored output
if [ -z "$NO_COLOR" ] && [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
	BOLD="$(tput bold)"; RESET="$(tput sgr0)"
	RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"; YELLOW="$(tput setaf 3)"; BLUE="$(tput setaf 4)"
else
	BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""
fi
info(){ printf "%s[info]%s %s\n" "$BLUE" "$RESET" "$*"; }
ok(){ printf "%s[ok]%s %s\n" "$GREEN" "$RESET" "$*"; }
warn(){ printf "%s[warn]%s %s\n" "$YELLOW" "$RESET" "$*"; }
err(){ printf "%s[err ]%s %s\n" "$RED" "$RESET" "$*" 1>&2; }

printf "\n%sVibrae%s (C) 2025 Daniel Callero\n" "$BOLD" "$RESET"
printf "This is free software released under the GNU GPLv3; you may redistribute it under certain conditions.\n"
printf "There is NO WARRANTY, to the extent permitted by law. See LICENSE for details.\n\n"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname)" == "Darwin" ]]; then
	info "macOS: checking dependencies via Homebrew"
	if ! command -v brew >/dev/null 2>&1; then
		warn "Homebrew not found; attempting to install Homebrew (may prompt for password)"
		/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || warn "Homebrew install failed; continuing without auto-install"
		eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null)" 2>/dev/null || true
		eval "$(/usr/local/bin/brew shellenv 2>/dev/null)" 2>/dev/null || true
	fi
	if command -v brew >/dev/null 2>&1; then
		brew update >/dev/null 2>&1 || true
		# Ensure core tools
		command -v python3 >/dev/null 2>&1 || brew install -q python || true
		command -v node >/dev/null 2>&1 || brew install -q node || true
		command -v nginx >/dev/null 2>&1 || brew install -q nginx || true
		# envsubst via gettext
		if ! command -v envsubst >/dev/null 2>&1; then
			brew install -q gettext || true
			brew link --force gettext >/dev/null 2>&1 || true
		fi
		# cloudflared (best-effort)
		command -v cloudflared >/dev/null 2>&1 || brew install -q cloudflare/cloudflare/cloudflared || brew install -q cloudflared || true
		# VLC runtime (for python-vlc)
		if ! python3 - <<'PY' >/dev/null 2>&1; then
import vlc
import sys
try:
		_=vlc.Instance()
		sys.exit(0)
except Exception:
		sys.exit(1)

PY
		# If the heredoc python check failed (exit != 0), install VLC
			brew install --cask -q vlc || true
		fi
	else
		warn "Homebrew not available; skipping macOS auto-install."
	fi
fi

info "python venv"
if [ ! -d venv ]; then
	python3 -m venv venv
fi
source venv/bin/activate

info "pip deps"
pip install -U pip wheel >/dev/null 2>&1 || true
pip install -r requirements.txt

info "validating Python packages"
python - <<'PY'
import sys
mods = [
	("fastapi", "FastAPI"),
	("uvicorn", "Uvicorn"),
	("sqlalchemy", "SQLAlchemy"),
	("pydantic", "Pydantic"),
	("jose", None),
	("python_dotenv", None),
	("websockets", "websockets"),
	("vlc", "python-vlc"),
]
ok = True
for m, name in mods:
	try:
		__import__(m)
	except Exception as e:
		ok = False
		print(f"[warn] missing or broken Python module: {name or m}: {e}")
try:
	import vlc
	try:
		_ = vlc.Instance()
	except Exception as e:
		print(f"[warn] VLC runtime not available (libVLC). Install VLC media player: https://www.videolan.org/")
except Exception:
	pass
sys.exit(0)
PY

info "database"
if [ ! -f data/garden.db ]; then
	(cd "$ROOT_DIR" && PYTHONPATH="$ROOT_DIR:$(pwd)/packages/core/src" python -m vibrae_core.init_db)
fi

info "node deps"
if command -v npm >/dev/null 2>&1; then
	(cd apps/web && npm install)
else
	warn "npm not found; skipping web app dependencies. Frontend export/server will be unavailable."
fi

# Note: ffmpeg is optional and not required on macOS.

info "env validation"
ENV_FILE="$ROOT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
	cp -n "$ROOT_DIR/.env.example" "$ENV_FILE" 2>/dev/null || true
fi
touch "$ENV_FILE"
MISSING=0
require(){ local k="$1"; if ! grep -qE "^${k}=" "$ENV_FILE"; then printf '%s[warn]%s missing %s in .env\n' "$YELLOW" "$RESET" "$k"; MISSING=$((MISSING+1)); fi }
require SECRET_KEY
require BACKEND_PORT
require FRONTEND_PORT
# Conditional warnings
TUNNEL_VAL="$(grep -E '^TUNNEL=' "$ENV_FILE" | head -n1 | sed -E 's/^TUNNEL=//')"
if [ -z "$TUNNEL_VAL" ]; then TUNNEL_VAL="cloudflared"; fi
if [ "$TUNNEL_VAL" = "cloudflared" ]; then
	if ! grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=' "$ENV_FILE"; then
		warn "CLOUDFLARE_TUNNEL_TOKEN missing; public URL via Cloudflare Tunnel will be disabled."
	elif ! command -v cloudflared >/dev/null 2>&1; then
		warn "cloudflared not installed. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
	fi
fi
if ! command -v nginx >/dev/null 2>&1; then
	warn "nginx not installed; reverse proxy will be skipped on this machine."
fi
if ! grep -qE "^BACKEND_MODULE=" "$ENV_FILE"; then echo "BACKEND_MODULE=apps.api.src.vibrae_api.main:app" >> "$ENV_FILE"; fi
if ! grep -qE "^FRONTEND_DIST=" "$ENV_FILE"; then echo "FRONTEND_DIST=/apps/web/dist" >> "$ENV_FILE"; fi
if ! grep -qE "^MUSIC_DIR=" "$ENV_FILE"; then echo "MUSIC_DIR=music" >> "$ENV_FILE"; fi
if ! grep -qE "^LOG_LEVEL=" "$ENV_FILE"; then echo "LOG_LEVEL=INFO" >> "$ENV_FILE"; fi
if [ $MISSING -gt 0 ]; then
	warn "$MISSING required env value(s) are missing. Please edit .env before starting."
else
	ok ".env looks good."
fi

ok "Setup complete. Use the CLI (vibrae start) or ./run.sh to start the app."

# Make 'vibrae' available globally if possible
if ! command -v vibrae >/dev/null 2>&1; then
	CLI_SRC="$ROOT_DIR/vibrae"
	if [ -f "$CLI_SRC" ]; then
		chmod +x "$CLI_SRC" 2>/dev/null || true
		DEST="/usr/local/bin/vibrae"
		if ln -sf "$CLI_SRC" "$DEST" 2>/dev/null; then
			ok "Installed vibrae command at $DEST"
		elif command -v sudo >/dev/null 2>&1 && sudo ln -sf "$CLI_SRC" "$DEST" 2>/dev/null; then
			ok "Installed vibrae command at $DEST"
		else
			mkdir -p "$HOME/.local/bin" 2>/dev/null || true
			DEST_LOCAL="$HOME/.local/bin/vibrae"
			if ln -sf "$CLI_SRC" "$DEST_LOCAL" 2>/dev/null; then
				warn "Installed vibrae at $DEST_LOCAL. Add \"export PATH=\$HOME/.local/bin:\$PATH\" to your shell profile to use 'vibrae' globally."
			else
				warn "Could not install 'vibrae' on PATH. Use ./vibrae or install manually."
			fi
		fi
	fi
fi

# Mark installation completed
STAMP_FILE="$ROOT_DIR/.installed"
date +'installed_at=%Y-%m-%dT%H:%M:%S%z' > "$STAMP_FILE" 2>/dev/null || true
echo "venv=$SCRIPT_DIR/venv" >> "$STAMP_FILE" 2>/dev/null || true
echo "python=$("$SCRIPT_DIR/venv/bin/python" -V 2>/dev/null | tr -d '\n')" >> "$STAMP_FILE" 2>/dev/null || true
ok "Installation stamp written to $STAMP_FILE"
